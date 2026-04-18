-- Initial daily schedule seed.
-- Idempotent: skips if (channel, repeat_type='daily', start_minutes, program) already exists.

INSERT INTO stream_schedules (channel, repeat_type, start_minutes, end_minutes, program, label, enabled)
SELECT * FROM (VALUES
  -- JA
  ('ja', 'daily',  6 * 60,        8 * 60,       'info:morning',   '朝の情報番組',       TRUE),
  ('ja', 'daily', 11 * 60,       13 * 60,       'info:noon',      'お昼情報番組',       TRUE),
  ('ja', 'daily', 14 * 60,       16 * 60 + 55,  'chat:afternoon', '午後配信',           TRUE),
  ('ja', 'daily', 17 * 60,       18 * 60 + 55,  'chat:evening',   'よる配信',           TRUE),
  ('ja', 'daily', 19 * 60,       21 * 60 + 55,  'chat:golden',    'ゴールデンタイム',   TRUE),
  ('ja', 'daily', 22 * 60,       23 * 60 + 55,  'market:report',  '相場情報番組',       TRUE),
  ('ja', 'daily', 24 * 60,       25 * 60,       'chat:goodnight', 'おやすみ配信',       TRUE),
  -- EN
  ('en', 'daily',  8 * 60,       11 * 60,       'chat:golden',    'US Golden Time',     TRUE),
  ('en', 'daily', 13 * 60,       14 * 60,       'chat:goodnight', 'Goodnight Stream',   TRUE),
  ('en', 'daily', 22 * 60,       24 * 60,       'market:report',  'Market Report',      TRUE)
) AS v(channel, repeat_type, start_minutes, end_minutes, program, label, enabled)
WHERE NOT EXISTS (
  SELECT 1 FROM stream_schedules s
  WHERE s.channel = v.channel
    AND s.repeat_type = v.repeat_type
    AND s.start_minutes = v.start_minutes
    AND s.program = v.program
);
