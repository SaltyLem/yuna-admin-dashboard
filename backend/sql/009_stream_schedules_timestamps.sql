-- stream_schedules: minute-of-day (start_minutes / end_minutes / date) 方式を廃止し、
-- once は絶対 TIMESTAMPTZ で、daily/weekly は TIME + timezone で持つ。
-- 日跨ぎ slot (23:00-01:00 等) が時刻幅演算で崩れるバグの根治。
--
-- ファイル全体は idempotent。毎起動適用される applySchemas に合わせて:
--   - 旧カラムが残っていれば "初回" 扱いで過去データ全破棄 (ユーザー承諾済み) + column 刈り
--   - 新カラムが既にあれば ADD はスキップ
-- という手順を DO ブロックで保護する。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stream_schedules' AND column_name = 'start_minutes'
  ) THEN
    DELETE FROM stream_schedules;
    ALTER TABLE stream_schedules DROP COLUMN start_minutes;
    ALTER TABLE stream_schedules DROP COLUMN end_minutes;
    ALTER TABLE stream_schedules DROP COLUMN date;
  END IF;
END $$;

ALTER TABLE stream_schedules
  ADD COLUMN IF NOT EXISTS starts_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time   TIME,
  ADD COLUMN IF NOT EXISTS timezone   TEXT NOT NULL DEFAULT 'Asia/Tokyo';

ALTER TABLE stream_schedules
  DROP CONSTRAINT IF EXISTS schedule_once_requires_absolute;
ALTER TABLE stream_schedules
  ADD CONSTRAINT schedule_once_requires_absolute CHECK (
    repeat_type <> 'once'
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  );

ALTER TABLE stream_schedules
  DROP CONSTRAINT IF EXISTS schedule_recurring_requires_time_of_day;
ALTER TABLE stream_schedules
  ADD CONSTRAINT schedule_recurring_requires_time_of_day CHECK (
    repeat_type = 'once'
    OR (start_time IS NOT NULL AND end_time IS NOT NULL)
  );
