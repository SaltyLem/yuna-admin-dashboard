-- Per-date thumbnail reservations for YouTube switch.
-- 04:00 JST の自動 switch 時に当日 (channel, date) に row があれば、
-- レンダ経由ではなく R2 上の完成 PNG を直接 thumbnails.set に upload する.

CREATE TABLE IF NOT EXISTS stream_youtube_thumbnails (
  channel    TEXT        NOT NULL CHECK (channel IN ('ja', 'en')),
  date       DATE        NOT NULL,             -- JST 暦日
  image_url  TEXT        NOT NULL,             -- R2 永続 URL
  source     TEXT        NOT NULL DEFAULT 'upload' CHECK (source IN ('upload')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel, date)
);

CREATE INDEX IF NOT EXISTS idx_stream_youtube_thumbnails_date
  ON stream_youtube_thumbnails (date);
