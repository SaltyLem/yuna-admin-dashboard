import { Router, Request, Response } from "express";
import Docker from "dockerode";
import { PassThrough } from "node:stream";

const router = Router();

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// SSE 用に独自トークン検証 (EventSource はカスタムヘッダ送れないので ?token= で受ける)。
// `sessions` map は親 index.ts に閉じてるので、そこから検証関数を import する代わりに
// ここでは "Authorization: Bearer ..." と "?token=..." の両方をサポートする。
function tokenFromReq(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const q = req.query.token;
  if (typeof q === "string") return q;
  return undefined;
}

// 認証ミドルウェアは親で `app.use(requireAuth)` 済みだが、SSE のために
// ?token クエリも受け付ける形に置き換える。親の requireAuth を回避するため
// 親側の mount を `app.use("/docker", ...)` ではなく、本ファイル内の SSE 経路
// だけ別ハンドラを通す。詳細は index.ts 側で。

router.get("/containers", async (_req: Request, res: Response) => {
  try {
    const list = await docker.listContainers({ all: false });
    const out = list.map((c) => ({
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
      image: c.Image,
      status: c.Status,
      state: c.State,
    }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ containers: out });
  } catch (err) {
    res.status(500).json({ error: "docker unreachable", detail: String(err) });
  }
});

// SSE: live tail.
//   GET /docker/logs/stream/:name?tail=200&token=<sessionToken>
// stdout/stderr を demuxStream で分離し、各行を SSE event として送る。
router.get("/logs/stream/:name", async (req: Request, res: Response) => {
  const name = String(req.params.name ?? "");
  const tail = Math.max(1, Math.min(2000, parseInt(String(req.query.tail ?? "200"), 10) || 200));

  let container;
  try {
    container = docker.getContainer(name);
    await container.inspect();
  } catch {
    res.status(404).json({ error: "container not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`: connected to ${name}\n\n`);

  let logStream: NodeJS.ReadableStream | null = null;
  const stdoutBuf: string[] = [""];
  const stderrBuf: string[] = [""];

  const pumpLines = (chunk: Buffer, buf: string[], stream: "stdout" | "stderr") => {
    const text = chunk.toString("utf8");
    const parts = text.split("\n");
    parts[0] = (buf[0] ?? "") + (parts[0] ?? "");
    for (let i = 0; i < parts.length - 1; i++) {
      const line = parts[i] ?? "";
      const payload = JSON.stringify({ stream, line, ts: Date.now() });
      res.write(`data: ${payload}\n\n`);
    }
    buf[0] = parts[parts.length - 1] ?? "";
  };

  try {
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    });
    logStream = stream as unknown as NodeJS.ReadableStream;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.on("data", (d: Buffer) => pumpLines(d, stdoutBuf, "stdout"));
    stderr.on("data", (d: Buffer) => pumpLines(d, stderrBuf, "stderr"));
    docker.modem.demuxStream(stream, stdout, stderr);
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
    res.end();
    return;
  }

  // heartbeat
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    const s = logStream as unknown as { destroy?: () => void } | null;
    if (s && typeof s.destroy === "function") s.destroy();
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
});

export { tokenFromReq };
export default router;
