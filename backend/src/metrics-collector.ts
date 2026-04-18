/**
 * metrics-collector — polls system + container + GPU stats and
 * persists them to admin-db.metrics_samples. The Live monitor
 * dashboard renders those samples as time-series charts.
 *
 * Sources:
 *   CPU / Memory  — /host/proc (mounted read-only from the host)
 *   GPU           — nvidia-smi via `docker exec prism-sbv2-1 nvidia-smi`
 *                   (sbv2 already has GPU access and the binary)
 *   Per-container — Docker Engine HTTP API /containers/:id/stats
 *
 * Cadence: 15s for host + GPU, 30s for per-container stats.
 * Retention: 7 days (prune every 6h).
 */

import http from "http";
import { promises as fs } from "fs";
import { query } from "./db/client.js";

const HOST_PROC = "/host/proc";
const DOCKER_SOCK = "/var/run/docker.sock";
const GPU_CONTAINER = "prism-sbv2-1";
const HOST_INTERVAL_MS = 15_000;
const DOCKER_INTERVAL_MS = 30_000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;
const RETENTION_DAYS = 7;

/* ──────────────────── row buffer + flush ─────────────────── */

interface Sample {
  kind: string;
  subject: string | null;
  metric: string;
  value: number;
}

async function insert(rows: Sample[]): Promise<void> {
  if (rows.length === 0) return;
  // Build a single multi-row INSERT.
  const params: unknown[] = [];
  const tuples: string[] = [];
  for (const r of rows) {
    const base = params.length;
    tuples.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(r.kind, r.subject, r.metric, r.value);
  }
  try {
    await query(
      `INSERT INTO metrics_samples (kind, subject, metric, value) VALUES ${tuples.join(", ")}`,
      params,
    );
  } catch (err) {
    console.warn("[metrics] insert failed:", err instanceof Error ? err.message : err);
  }
}

/* ──────────────────── CPU (/proc/stat) ───────────────────── */

interface CpuSnapshot { total: number; idle: number; }
let prevCpu: CpuSnapshot | null = null;

async function readCpu(): Promise<number | null> {
  try {
    const data = await fs.readFile(`${HOST_PROC}/stat`, "utf8");
    const line = data.split("\n")[0];
    if (!line || !line.startsWith("cpu ")) return null;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    // user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice
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

/* ──────────────────── GPU (nvidia-smi) ───────────────────── */

interface GpuRow { index: string; utilPct: number; vramUsedMb: number; vramTotalMb: number; tempC: number; powerW: number; }

/**
 * Run nvidia-smi inside the GPU-equipped container via the Docker
 * Engine API (our container doesn't have the docker CLI; it only has
 * the socket). Two-step flow: create an exec with the command, then
 * start it and drain the demuxed stdout/stderr stream.
 */
function dockerExec(containerName: string, cmd: string[]): Promise<string> {
  return new Promise((resolve) => {
    // Step 1: create exec
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

        // Step 2: start exec and read the multiplexed stream
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
            // Docker demux: each frame is 8-byte header + payload. We
            // concat payload bytes from stdout/stderr blindly — for
            // nvidia-smi's short CSV output this is fine.
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
    const utilPct = parseFloat(util ?? "") || 0;
    const vramUsedMb = parseFloat(vUsed ?? "") || 0;
    const vramTotalMb = parseFloat(vTotal ?? "") || 0;
    const tempC = parseFloat(temp ?? "") || 0;
    const powerW = parseFloat(power ?? "") || 0;
    rows.push({ index: index ?? "0", utilPct, vramUsedMb, vramTotalMb, tempC, powerW });
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

interface ContainerInfo { Id: string; Names: string[]; State: string; }
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

  await insert(rows);
}

async function tickDocker(): Promise<void> {
  const rows = await collectDocker();
  await insert(rows);
}

async function prune(): Promise<void> {
  try {
    const res = await query(
      `DELETE FROM metrics_samples WHERE recorded_at < NOW() - ($1::int || ' days')::interval`,
      [RETENTION_DAYS],
    );
    if ((res.rowCount ?? 0) > 0) {
      console.log(`[metrics] pruned ${res.rowCount} rows older than ${RETENTION_DAYS}d`);
    }
  } catch (err) {
    console.warn("[metrics] prune failed:", err instanceof Error ? err.message : err);
  }
}

export function startMetricsCollector(): void {
  console.log("[metrics] collector starting");
  // First prime CPU delta calc so the first real tick has valid %.
  void readCpu();
  setTimeout(() => {
    void tickHost();
    setInterval(() => void tickHost(), HOST_INTERVAL_MS);
  }, 5_000);

  setTimeout(() => {
    void tickDocker();
    setInterval(() => void tickDocker(), DOCKER_INTERVAL_MS);
  }, 8_000);

  setTimeout(() => {
    void prune();
    setInterval(() => void prune(), PRUNE_INTERVAL_MS);
  }, 30_000);
}
