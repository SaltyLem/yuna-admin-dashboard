-- TTS reading rules: symbols (decimal point, %, &, @).
-- Keeps 004 / 005 style, idempotent via (language, scope, pattern) uniqueness check.
--
-- Decimal point は数字の間の "." を "てん" に変換 (pre scope, 構造的書換え).
-- % と & は単純置換 (post scope, LLM 後).

INSERT INTO tts_reading_rules (language, scope, pattern, replacement, flags, priority, note)
SELECT * FROM (VALUES
  -- ── 小数点 "1.2" → "1てん2" (pre: LLM に数値扱いさせたくないので構造書換え) ──
  ('ja', 'pre',  '([0-9]+)\.([0-9]+)',  '\1てん\2',   '', 15, '小数点 → てん (1.2 → 1てん2)'),

  -- ── 記号 (post: LLM 後の素直な置換) ──
  ('ja', 'post', '%',                    'パーセント', '', 120, '% → パーセント'),
  ('ja', 'post', '&',                    'アンド',     '', 120, '& → アンド'),
  ('ja', 'post', '@',                    'アット',     '', 120, '@ → アット'),
  ('ja', 'post', '#',                    'シャープ',   '', 120, '# → シャープ'),
  ('ja', 'post', '\+',                   'プラス',     '', 120, '+ → プラス'),
  ('ja', 'post', '=',                    'イコール',   '', 120, '= → イコール')
) AS v(language, scope, pattern, replacement, flags, priority, note)
WHERE NOT EXISTS (
  SELECT 1 FROM tts_reading_rules r
  WHERE r.language = v.language AND r.scope = v.scope AND r.pattern = v.pattern
);
