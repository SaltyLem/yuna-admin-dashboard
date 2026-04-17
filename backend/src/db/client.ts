import pg from "pg";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const pool = new pg.Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 5,
});

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params);
}

/**
 * Apply every .sql file under backend/sql/ in filename order. Each file
 * is expected to be idempotent (uses IF NOT EXISTS / ON CONFLICT). Runs
 * on every boot — cheap, keeps schema in sync with the tree.
 */
async function applySchemas(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sqlDir = path.resolve(here, "../../sql");
  let files: string[];
  try {
    files = (await fs.readdir(sqlDir)).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return;
  }
  for (const file of files) {
    const sql = await fs.readFile(path.join(sqlDir, file), "utf8");
    try {
      await pool.query(sql);
      console.log(`[db] applied ${file}`);
    } catch (err) {
      console.error(`[db] failed to apply ${file}:`, err instanceof Error ? err.message : err);
    }
  }
}

export async function initDb(): Promise<void> {
  await pool.query("SELECT 1");
  console.log("[db] connected");
  await applySchemas();
}
