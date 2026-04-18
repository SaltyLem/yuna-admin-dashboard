-- Admin → Overlay announcements (banner shown over default / loading / ending).
-- Multiple rows supported, but typical use = 1 active. Overlay polls every 30s.

CREATE TABLE IF NOT EXISTS admin_announcements (
  id          SERIAL PRIMARY KEY,
  message     TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  priority    INT NOT NULL DEFAULT 100,  -- lower = shown first
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_announcements_active
  ON admin_announcements (enabled, priority);
