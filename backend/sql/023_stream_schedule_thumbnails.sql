-- Per-schedule + per-date サムネイル予約.
-- 既存 stream_youtube_thumbnails (channel, date) は「channel 全体に対する 1 日分の override」.
-- これは「特定 schedule (= 番組枠) を特定の日付に上書き」する目的の別テーブル.
--
-- 同じ recurring schedule (例: 毎日 12:00 の info:noon) を、特定の日だけ別サムネに
-- 差し替えたい運用を想定. なければ channel-wide → auto 生成の順でフォールバック.

CREATE TABLE IF NOT EXISTS stream_schedule_thumbnails (
  schedule_id INT         NOT NULL REFERENCES stream_schedules(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,             -- JST 暦日
  image_url   TEXT        NOT NULL,             -- R2 永続 URL
  source      TEXT        NOT NULL DEFAULT 'upload' CHECK (source IN ('upload')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (schedule_id, date)
);

CREATE INDEX IF NOT EXISTS idx_stream_schedule_thumbnails_date
  ON stream_schedule_thumbnails (date);
