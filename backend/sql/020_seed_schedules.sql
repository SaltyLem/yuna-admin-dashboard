-- 既定 daily スケジュールを seed する.
--
-- start_time / end_time + timezone で recurring を表現 (009 で minute-of-day
-- ベース廃止済). channel + start_time + program で重複弾く.
-- すべて Asia/Tokyo 基準 (EN ch も JST で時刻指定する運用).
--
-- 内訳:
--   ja  daily 07:00-09:00 info:morning   朝の情報番組
--   ja  daily 11:00-13:00 info:noon      お昼情報番組
--   ja  daily 19:00-21:00 chat:golden    夜の雑談タイム
--   en  daily 21:00-23:00 info:morning   Morning Stream (JST eve = US morning)
--   en  daily 02:00-04:00 info:noon      Noon Stream    (JST 深夜 = US 昼)
--   en  daily 09:00-11:00 chat:golden    Evening Chat   (JST 朝 = US 夜)

INSERT INTO stream_schedules (channel, repeat_type, repeat_days, start_time, end_time, timezone, program, label, title, enabled)
SELECT * FROM (VALUES
  -- JA
  ('ja', 'daily', '{}'::int[], '07:00'::time, '09:00'::time, 'Asia/Tokyo', 'info:morning', '朝の情報番組',     '', TRUE),
  ('ja', 'daily', '{}'::int[], '11:00'::time, '13:00'::time, 'Asia/Tokyo', 'info:noon',    'お昼情報番組',     '', TRUE),
  ('ja', 'daily', '{}'::int[], '19:00'::time, '21:00'::time, 'Asia/Tokyo', 'chat:golden',  '夜の雑談タイム',   '', TRUE),
  -- EN (時刻は JST 表記、内部 timezone も Asia/Tokyo で統一)
  ('en', 'daily', '{}'::int[], '21:00'::time, '23:00'::time, 'Asia/Tokyo', 'info:morning', 'Morning Stream',   '', TRUE),
  ('en', 'daily', '{}'::int[], '02:00'::time, '04:00'::time, 'Asia/Tokyo', 'info:noon',    'Noon Stream',      '', TRUE),
  ('en', 'daily', '{}'::int[], '09:00'::time, '11:00'::time, 'Asia/Tokyo', 'chat:golden',  'Evening Chat',     '', TRUE)
) AS v(channel, repeat_type, repeat_days, start_time, end_time, timezone, program, label, title, enabled)
WHERE NOT EXISTS (
  SELECT 1 FROM stream_schedules s
  WHERE s.channel = v.channel
    AND s.repeat_type = v.repeat_type
    AND s.start_time = v.start_time
    AND s.program = v.program
);
