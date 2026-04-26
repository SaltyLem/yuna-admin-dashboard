-- YouTube OAuth credentials per stream channel (ja/en).
-- Used by yuna-stream backend to create new live broadcasts on slot switch.
-- One row per channel; refresh_token is long-lived (Workspace Internal OAuth).

CREATE TABLE IF NOT EXISTS stream_youtube_credentials (
  channel TEXT PRIMARY KEY CHECK (channel IN ('ja', 'en')),
  refresh_token TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Current active broadcast per channel. Updated on each slot switch.
CREATE TABLE IF NOT EXISTS stream_youtube_broadcasts (
  channel TEXT PRIMARY KEY CHECK (channel IN ('ja', 'en')),
  broadcast_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  rtmp_url TEXT NOT NULL,
  ingest_address TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  title TEXT,
  switched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
