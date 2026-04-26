-- Persistent reusable liveStream per channel.
-- Created once, then every slot switch just creates a new broadcast and
-- binds it to this stream. The broadcaster keeps pushing to the same
-- stream key forever — only the broadcast object cycles.

ALTER TABLE stream_youtube_credentials
  ADD COLUMN IF NOT EXISTS reusable_stream_id TEXT,
  ADD COLUMN IF NOT EXISTS reusable_stream_key TEXT,
  ADD COLUMN IF NOT EXISTS reusable_ingest_address TEXT;
