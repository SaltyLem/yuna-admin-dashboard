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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stream_programs (
      id            SERIAL PRIMARY KEY,
      name          TEXT UNIQUE NOT NULL,
      overlay_path  TEXT NOT NULL DEFAULT '/default',
      description   TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stream_schedules (
      id            SERIAL PRIMARY KEY,
      channel       TEXT NOT NULL CHECK (channel IN ('ja', 'en')),
      repeat_type   TEXT NOT NULL DEFAULT 'once' CHECK (repeat_type IN ('once', 'daily', 'weekly')),
      repeat_days   INT[] DEFAULT '{}',
      date          DATE,
      start_minutes INT NOT NULL,
      end_minutes   INT NOT NULL,
      program       TEXT NOT NULL,
      label         TEXT NOT NULL,
      title         TEXT NOT NULL DEFAULT '',
      enabled       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // デフォルト programs をシード（存在しなければ）
  const { rowCount } = await pool.query("SELECT 1 FROM stream_programs LIMIT 1");
  if (rowCount === 0) {
    await pool.query(`
      INSERT INTO stream_programs (name, overlay_path, description) VALUES
        ('chat:morning', '/default', 'Morning chat'),
        ('chat:afternoon', '/default', 'Afternoon chat'),
        ('chat:evening', '/default', 'Evening chat'),
        ('chat:golden', '/default', 'Golden time chat'),
        ('chat:goodnight', '/default', 'Goodnight chat'),
        ('info:morning', '/info', 'Morning info'),
        ('info:noon', '/info', 'Noon info'),
        ('market:report', '/market', 'Market report')
    `);
    console.log("[db] seeded default programs");
  }

  console.log("[db] connected, tables ensured");
}
