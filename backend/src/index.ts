import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "4100", 10);
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "admin";

// セッション管理（インメモリ）
const sessions = new Map<string, number>(); // token → expires_at
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24h

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !sessions.has(token) || sessions.get(token)! < Date.now()) {
    sessions.delete(token ?? "");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.use(cors());
app.use(express.json());

// 認証不要
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "yuna-admin" });
});

app.post("/auth/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL);
  res.json({ token });
});

app.post("/auth/verify", requireAuth, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// 以降のルートは認証必須
app.use(requireAuth);

app.listen(PORT, () => {
  console.log(`[yuna-admin] Running on http://localhost:${PORT}`);
});
