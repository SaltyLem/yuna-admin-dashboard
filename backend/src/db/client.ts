import pg from "pg";

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

export async function initDb(): Promise<void> {
  await pool.query("SELECT 1");
  console.log("[db] connected");
}
