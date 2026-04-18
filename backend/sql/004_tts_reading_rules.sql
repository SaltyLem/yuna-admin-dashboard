-- TTS reading rules: pattern → replacement substitutions used by the TTS
-- wrapper to normalize text before sending to SBV2 / Orpheus.
--
-- scope:
--   pre  = applied BEFORE the LLM (structural patterns the LLM tends to break)
--   post = applied AFTER the LLM (general substitutions, tickers, single letters)
--
-- The wrapper polls /tts/reading-rules every minute. Hardcoded defaults in
-- the Python code remain as a fallback when the API is unreachable.

CREATE TABLE IF NOT EXISTS tts_reading_rules (
  id           SERIAL PRIMARY KEY,
  language     TEXT NOT NULL DEFAULT 'ja' CHECK (language IN ('ja', 'en')),
  scope        TEXT NOT NULL DEFAULT 'post' CHECK (scope IN ('pre', 'post')),
  pattern      TEXT NOT NULL,
  replacement  TEXT NOT NULL,
  flags        TEXT NOT NULL DEFAULT '',  -- 'i' for case-insensitive
  priority     INT  NOT NULL DEFAULT 100, -- lower = applied first
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tts_reading_rules_lookup
  ON tts_reading_rules (language, scope, enabled, priority);

-- Seed: mirror the hardcoded rules currently in tts-server/wrapper/server.py
INSERT INTO tts_reading_rules (language, scope, pattern, replacement, flags, priority, note)
SELECT * FROM (VALUES
  -- ── pre rules (structural, run before LLM) ──
  ('ja', 'pre',  '第([0-9]+)話',     'だい\1わ',     '', 10, '第N話 → だいNわ'),
  ('ja', 'pre',  '第([0-9]+)回',     'だい\1かい',   '', 10, '第N回 → だいNかい'),
  ('ja', 'pre',  '第([0-9]+)章',     'だい\1しょう', '', 10, '第N章 → だいNしょう'),
  ('ja', 'pre',  '第([0-9]+)巻',     'だい\1かん',   '', 10, '第N巻 → だいNかん'),
  ('ja', 'pre',  '第([0-9]+)位',     'だい\1い',     '', 10, '第N位 → だいNい'),
  ('ja', 'pre',  '第([0-9]+)弾',     'だい\1だん',   '', 10, '第N弾 → だいNだん'),
  ('ja', 'pre',  '([0-9]+)ヶ月',     '\1かげつ',     '', 20, 'Nヶ月 → Nかげつ'),
  ('ja', 'pre',  '([0-9]+)箇月',     '\1かげつ',     '', 20, 'N箇月 → Nかげつ'),
  ('ja', 'pre',  '([0-9]+)週間',     '\1しゅうかん', '', 20, 'N週間 → Nしゅうかん'),
  ('ja', 'pre',  '([0-9]+)日間',     '\1にちかん',   '', 20, 'N日間 → Nにちかん'),
  ('ja', 'pre',  '([0-9]+)時間',     '\1じかん',     '', 20, 'N時間 → Nじかん'),
  ('ja', 'pre',  '(\d+位)〜(\d+位)', '\1から\2',     '', 30, 'N位〜M位 → N位からM位'),
  -- ── post rules (general substitutions) ──
  ('ja', 'post', 'YUNA',             'ゆな',         'i', 100, ''),
  ('ja', 'post', 'HINA',             'ひな',         'i', 100, ''),
  ('ja', 'post', 'TOP10',            'トップテン',   'i', 100, ''),
  ('ja', 'post', 'TOP5',             'トップファイブ', 'i', 100, ''),
  ('ja', 'post', 'TOP3',             'トップスリー', 'i', 100, ''),
  -- crypto tickers (negative lookbehind/lookahead for word boundary)
  ('ja', 'post', '(?<![A-Za-z0-9])BTC(?![A-Za-z0-9])',  'ビットコイン',     '', 110, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])ETH(?![A-Za-z0-9])',  'イーサリアム',     '', 110, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])SOL(?![A-Za-z0-9])',  'ソラナ',           '', 110, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])XRP(?![A-Za-z0-9])',  'リップル',         '', 110, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])DOGE(?![A-Za-z0-9])', 'ドージコイン',     '', 110, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])NFT(?![A-Za-z0-9])',  'エヌエフティー',   '', 110, ''),
  -- single letters (alphabet readings)
  ('ja', 'post', '(?<![A-Za-z0-9])S(?![A-Za-z0-9])',    'エス',     '', 200, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])A(?![A-Za-z0-9])',    'エー',     '', 200, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])B(?![A-Za-z0-9])',    'ビー',     '', 200, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])C(?![A-Za-z0-9])',    'シー',     '', 200, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])D(?![A-Za-z0-9])',    'ディー',   '', 200, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])E(?![A-Za-z0-9])',    'イー',     '', 200, ''),
  ('ja', 'post', '(?<![A-Za-z0-9])F(?![A-Za-z0-9])',    'エフ',     '', 200, '')
) AS v(language, scope, pattern, replacement, flags, priority, note)
WHERE NOT EXISTS (
  SELECT 1 FROM tts_reading_rules r
  WHERE r.language = v.language AND r.scope = v.scope AND r.pattern = v.pattern
);
