-- Stream programs (overlay mapping)
CREATE TABLE IF NOT EXISTS stream_programs (
  id            SERIAL PRIMARY KEY,
  name          TEXT UNIQUE NOT NULL,
  overlay_path  TEXT NOT NULL DEFAULT '/default',
  description   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO stream_programs (name, overlay_path, description) VALUES
  ('chat:morning', '/default', 'Morning chat'),
  ('chat:afternoon', '/default', 'Afternoon chat'),
  ('chat:evening', '/default', 'Evening chat'),
  ('chat:golden', '/default', 'Golden time chat'),
  ('chat:goodnight', '/default', 'Goodnight chat'),
  ('info:morning', '/info', 'Morning info'),
  ('info:noon', '/info', 'Noon info'),
  ('market:report', '/market', 'Market report')
ON CONFLICT (name) DO NOTHING;

-- Stream schedules (repeat rules)
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
);
