import express from "express";
import cors from "cors";

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "4100", 10);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "yuna-admin" });
});

app.listen(PORT, () => {
  console.log(`[yuna-admin] Running on http://localhost:${PORT}`);
});
