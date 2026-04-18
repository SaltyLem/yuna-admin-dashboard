/**
 * metrics-agent — remote collector that mirrors admin-backend's
 * in-process metrics-collector but pushes samples over HTTP instead of
 * writing to admin-db directly. Designed to run as a tiny Node
 * container on each host that we want observability for (e.g. the
 * 5090 box). The admin-backend on the 3080 box is the authoritative
 * store.
 *
 * Sources:
 *   CPU / Memory  — /host/proc (mounted read-only from the host)
 *   GPU           — nvidia-smi via `docker exec <GPU_CONTAINER> nvidia-smi`
 *                   over the Docker Engine socket. The target container
 *                   must already have GPU access (e.g. ollama).
 *   Per-container — Docker Engine HTTP API /containers/:id/stats
 *
 * Cadence: 15s for host + GPU, 30s for per-container stats.
 */

import http from "http";
import { promises as fs } from "fs";

const HOST_PROC = process.env["HOST_PROC"] ?? "/host/proc";
const DOCKER_SOCK = process.env["DOCKER_SOCK"] ?? "/var/run/docker.sock";
const GPU_CONTAINER = process.env["METRICS_GPU_CONTAINER"] ?? "ollama";
const HOST_LABEL = process.env["METRICS_HOST_LABEL"] ?? "linux-5090";
const INGEST_URL = process.env["METRICS_INGEST_URL"] ?? "";
const INGEST_TOKEN = process.env["METRICS_INGEST_TOKEN"] ?? "";
const HOST_INTERVAL_MS = 15_000;
const DOCKER_INTERVAL_MS = 30_000;

if (!INGEST_URL) {
  console.error("[agent] METRICS_INGEST_URL is required");
  process.exit(1);
}
if (!INGEST_TOKEN) {
  console.error("[agent] METRICS_INGEST_TOKEN is required");
  process.exit(1);
}

/* ──────────────────── HTTP POST to admin-backend ─────────────── */

interface Sample {
  kind: string;
  subject: string | null;
  metric: string;
  value: number;
}

async function postSamples(samples: Sample[]): Promise<void> {
  if (samples.length === 0) return;
  try {
    const resp = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Metrics-Ingest-Token": INGEST_TOKEN,
      },
      body: JSON.stringify({ host: HOST_LABEL, samples }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`[agent] ingest ${resp.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn("[agent] ingest error:", err instanceof Error ? err.message : err);
  }
}

/* ──────────────────── CPU (/proc/stat) ───────────────────── */

interface CpuSnapshot { total: number; idle: number }
let prevCpu: CpuSnapshot | null = null;

async function readCpu(): Promise<number | null> {
  try {
    const data = await fs.readFile(`${HOST_PROC}/stat`, "utf8");
    const line = data.split("\n")[0];
    if (!line || !line.startsWith("cpu ")) return null;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    if (parts.length < 4) return null;
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
    const total = parts.reduce((a, b) => a + b, 0);
    if (!prevCpu) { prevCpu = { total, idle }; return null; }
    const deltaTotal = total - prevCpu.total;
    const deltaIdle = idle - prevCpu.idle;
    prevCpu = { total, idle };
    if (deltaTotal <= 0) return null;
    return 100 * (1 - deltaIdle / deltaTotal);
  } catch { return null; }
}

/* ──────────────────── Memory (/proc/meminfo) ─────────────── */

async function readMemory(): Promise<{ usedMb: number; totalMb: number; pct: number } | null> {
  try {
    const data = await fs.readFile(`${HOST_PROC}/meminfo`, "utf8");
    const map = new Map<string, number>();
    for (const line of data.split("\n")) {
      const m = /^([A-Za-z_()]+):\s+(\d+) kB/.exec(line);
      if (m) map.set(m[1]!, parseInt(m[2]!, 10));
    }
    const total = map.get("MemTotal");
    const avail = map.get("MemAvailable");
    if (total == null || avail == null) return null;
    const used = total - avail;
    return { usedMb: used / 1024, totalMb: total / 1024, pct: (100 * used) / total };
  } catch { return null; }
}

/* ──────────────────── GPU (nvidia-smi via docker exec) ───── */

interface GpuRow { index: string; utilPct: number; vramUsedMb: number; vramTotalMb: number; tempC: number; powerW: number }

function dockerExec(containerName: string, cmd: string[]): Promise<string> {
  return new Promise((resolve) => {
    const createBody = JSON.stringify({
      AttachStdout: true, AttachStderr: true, Tty: false, Cmd: cmd,
    });
    const create = http.request({
      socketPath: DOCKER_SOCK,
      path: `/containers/${encodeURIComponent(containerName)}/exec`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(createBody) },
    }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c.toString(); });
      res.on("end", () => {
        if (!res.statusCode || res.statusCode >= 300) return resolve("");
        let execId: string;
        try { execId = (JSON.parse(body) as { Id: string }).Id; }
        catch { return resolve(""); }

        const startBody = JSON.stringify({ Detach: false, Tty: false });
        const start = http.request({
          socketPath: DOCKER_SOCK,
          path: `/exec/${execId}/start`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(startBody),
          },
        }, (startRes) => {
          const chunks: Buffer[] = [];
          startRes.on("data", (c: Buffer) => chunks.push(c));
          startRes.on("end", () => {
            // Docker demux: 8-byte header + payload per frame.
            const buf = Buffer.concat(chunks);
            let i = 0; let text = "";
            while (i + 8 <= buf.length) {
              const size = buf.readUInt32BE(i + 4);
              const payload = buf.slice(i + 8, i + 8 + size);
              text += payload.toString("utf8");
              i += 8 + size;
            }
            resolve(text);
          });
        });
        start.on("error", () => resolve(""));
        start.write(startBody);
        start.end();
      });
    });
    create.on("error", () => resolve(""));
    create.write(createBody);
    create.end();
  });
}

async function readGpu(): Promise<GpuRow[]> {
  const out = await dockerExec(GPU_CONTAINER, [
    "nvidia-smi",
    "--query-gpu=index,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
    "--format=csv,noheader,nounits",
  ]);
  const rows: GpuRow[] = [];
  for (const line of out.trim().split("\n")) {
    if (!line) continue;
    const parts = line.split(",").map(s => s.trim());
    if (parts.length < 5) continue;
    const [index, util, vUsed, vTotal, temp, power] = parts;
    rows.push({
      index: index ?? "0",
      utilPct: parseFloat(util ?? "") || 0,
      vramUsedMb: parseFloat(vUsed ?? "") || 0,
      vramTotalMb: parseFloat(vTotal ?? "") || 0,
      tempC: parseFloat(temp ?? "") || 0,
      powerW: parseFloat(power ?? "") || 0,
    });
  }
  return rows;
}

/* ──────────────────── Docker container stats ─────────────── */

function dockerGet<T>(path: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = http.request({ socketPath: DOCKER_SOCK, path, method: "GET" }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c.toString(); });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body) as T); } catch { resolve(null); }
        } else resolve(null);
      });
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

interface ContainerInfo { Id: string; Names: string[]; State: string }
interface ContainerStats {
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
  memory_stats: { usage?: number; limit?: number };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
}

async function collectDocker(): Promise<Sample[]> {
  const containers = await dockerGet<ContainerInfo[]>("/containers/json");
  if (!containers) return [];
  const running = containers.filter(c => c.State === "running");
  const samples: Sample[] = [];

  await Promise.all(running.map(async (c) => {
    const name = (c.Names[0] ?? c.Id.slice(0, 12)).replace(/^\//, "");
    const stats = await dockerGet<ContainerStats>(`/containers/${c.Id}/stats?stream=false&one-shot=true`);
    if (!stats) return;

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const sysDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpus = stats.cpu_stats.online_cpus ?? 1;
    const cpuPct = sysDelta > 0 && cpuDelta > 0
      ? (cpuDelta / sysDelta) * cpus * 100
      : 0;

    const memUsed = stats.memory_stats.usage ?? 0;
    const memLimit = stats.memory_stats.limit ?? 0;
    const memMb = memUsed / (1024 * 1024);
    const memPct = memLimit > 0 ? (100 * memUsed) / memLimit : 0;

    samples.push({ kind: "docker", subject: name, metric: "cpu_pct", value: cpuPct });
    samples.push({ kind: "docker", subject: name, metric: "mem_used_mb", value: memMb });
    samples.push({ kind: "docker", subject: name, metric: "mem_pct", value: memPct });

    if (stats.networks) {
      let rx = 0; let tx = 0;
      for (const n of Object.values(stats.networks)) {
        rx += n.rx_bytes; tx += n.tx_bytes;
      }
      samples.push({ kind: "docker", subject: name, metric: "net_rx_bytes", value: rx });
      samples.push({ kind: "docker", subject: name, metric: "net_tx_bytes", value: tx });
    }
  }));

  return samples;
}

/* ──────────────────── Tick + loops ───────────────────────── */

async function tickHost(): Promise<void> {
  const rows: Sample[] = [];

  const cpu = await readCpu();
  if (cpu != null) rows.push({ kind: "cpu", subject: null, metric: "usage_pct", value: cpu });

  const mem = await readMemory();
  if (mem) {
    rows.push({ kind: "memory", subject: null, metric: "used_mb", value: mem.usedMb });
    rows.push({ kind: "memory", subject: null, metric: "total_mb", value: mem.totalMb });
    rows.push({ kind: "memory", subject: null, metric: "pct",      value: mem.pct });
  }

  const gpus = await readGpu();
  for (const g of gpus) {
    rows.push({ kind: "gpu", subject: g.index, metric: "usage_pct",     value: g.utilPct });
    rows.push({ kind: "gpu", subject: g.index, metric: "vram_used_mb",  value: g.vramUsedMb });
    rows.push({ kind: "gpu", subject: g.index, metric: "vram_total_mb", value: g.vramTotalMb });
    rows.push({ kind: "gpu", subject: g.index, metric: "vram_pct",
      value: g.vramTotalMb > 0 ? (100 * g.vramUsedMb) / g.vramTotalMb : 0 });
    rows.push({ kind: "gpu", subject: g.index, metric: "temp_c",        value: g.tempC });
    rows.push({ kind: "gpu", subject: g.index, metric: "power_w",       value: g.powerW });
  }

  await postSamples(rows);
}

async function tickDocker(): Promise<void> {
  const rows = await collectDocker();
  await postSamples(rows);
}

async function main(): Promise<void> {
  console.log(`[agent] starting host=${HOST_LABEL} gpu_container=${GPU_CONTAINER} ingest=${INGEST_URL}`);
  // Prime CPU delta so the first real tick has a valid %.
  void readCpu();
  setTimeout(() => {
    void tickHost();
    setInterval(() => void tickHost(), HOST_INTERVAL_MS);
  }, 5_000);

  setTimeout(() => {
    void tickDocker();
    setInterval(() => void tickDocker(), DOCKER_INTERVAL_MS);
  }, 8_000);
}

void main();
