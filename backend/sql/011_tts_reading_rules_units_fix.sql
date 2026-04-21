-- 010 で入れた rules のうち Python re が読めないパターンを置き換える。
-- (1) \m (word boundary, PostgreSQL 式) は Python では \b
-- (2) (?<=\d)\s? は可変幅 lookbehind で Python re が拒否する
--     → capture group (\d) で digit を持ち上げて replacement 先頭に戻す形に書換
--
-- まず 010 で投入した該当レコードを pattern 一致で削除してから再投入する。

DELETE FROM tts_reading_rules
WHERE language = 'ja' AND scope = 'pre' AND (
  pattern LIKE '\m%'
  OR pattern LIKE '(?<=\d)\s?%'
);

INSERT INTO tts_reading_rules (language, scope, pattern, replacement, flags, priority, note)
SELECT * FROM (VALUES
  -- ── マグニチュード ── \m → \b
  ('ja', 'pre', '\bM(\d+(?:\.\d+)?)(?![A-Za-z])', 'マグニチュード\1', '', 20,
   'M7 / M7.5 → マグニチュードN'),

  -- ── 単位 (数字直後のみ反応, lookbehind 禁止 → capture group) ──
  -- 2 文字ユニットを先に、1 文字を後段へ.
  ('ja', 'pre', '(\d)\s?km(?![A-Za-z])',  '\1キロメートル',   '', 30, '単位 km'),
  ('ja', 'pre', '(\d)\s?cm(?![A-Za-z])',  '\1センチメートル', '', 30, '単位 cm'),
  ('ja', 'pre', '(\d)\s?mm(?![A-Za-z])',  '\1ミリメートル',   '', 30, '単位 mm'),
  ('ja', 'pre', '(\d)\s?ml(?![A-Za-z])',  '\1ミリリットル',   '', 30, '単位 ml'),
  ('ja', 'pre', '(\d)\s?kg(?![A-Za-z])',  '\1キログラム',     '', 30, '単位 kg'),
  ('ja', 'pre', '(\d)\s?GHz(?![A-Za-z])', '\1ギガヘルツ',     '', 30, '単位 GHz'),
  ('ja', 'pre', '(\d)\s?MHz(?![A-Za-z])', '\1メガヘルツ',     '', 30, '単位 MHz'),
  ('ja', 'pre', '(\d)\s?kHz(?![A-Za-z])', '\1キロヘルツ',     '', 30, '単位 kHz'),
  ('ja', 'pre', '(\d)\s?Hz(?![A-Za-z])',  '\1ヘルツ',         '', 30, '単位 Hz'),
  ('ja', 'pre', '(\d)\s?m(?![A-Za-z])',   '\1メートル',       '', 40, '単位 m'),
  ('ja', 'pre', '(\d)\s?g(?![A-Za-z])',   '\1グラム',         '', 40, '単位 g'),
  ('ja', 'pre', '(\d)\s?l(?![A-Za-z])',   '\1リットル',       '', 40, '単位 l'),
  ('ja', 'pre', '(\d)\s?L(?![A-Za-z])',   '\1リットル',       '', 40, '単位 L')
) AS v(language, scope, pattern, replacement, flags, priority, note)
WHERE NOT EXISTS (
  SELECT 1 FROM tts_reading_rules r
  WHERE r.language = v.language AND r.scope = v.scope AND r.pattern = v.pattern
);
