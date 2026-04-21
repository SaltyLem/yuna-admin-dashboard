-- TTS reading rules: 単位 (km/cm/mm/ml/kg/m/g/l/Hz 系) / マグニチュード / カンマ区切り数字.
-- 既存 004 / 005 / 008 と同じ (language, scope, pattern) 一意性で idempotent.
--
-- pattern は Python re 用。lookbehind / lookahead も使う。
-- wrapper 側が pre → (LLM) → post の順で適用する前提。
--   pre  scope: LLM 入力前の構造書換 (数字・単位はここで処理. LLM にカタカナ化
--               させないで済ませたいため)
--   post scope: LLM 出力後の素直な置換 (記号類はこちら)

INSERT INTO tts_reading_rules (language, scope, pattern, replacement, flags, priority, note)
SELECT * FROM (VALUES
  -- ── マグニチュード ──
  -- "M7" / "M7.5" → "マグニチュード7" / "マグニチュード7.5"
  -- 後ろが英字なら magnitude ではないので除外 (例: M3U, Mb, Mac 等).
  ('ja', 'pre', '\mM(\d+(?:\.\d+)?)(?![A-Za-z])', 'マグニチュード\1', '', 20,
   'M7 / M7.5 → マグニチュードN'),

  -- ── カンマ区切り数字 ──
  -- "1,000" / "12,345" / "1,234,567" を無カンマ化して TTS の数字読みに任せる.
  -- コンマが「3桁の digit グループが続く」パターンの時だけ消す (座標 "1,2" は対象外).
  ('ja', 'pre', ',(?=\d{3}(?:,\d{3})*(?:[^\d]|$))', '', '', 25,
   'カンマ区切り千単位 (1,234 / 1,234,567) を無カンマ化'),

  -- ── 単位 (数字直後のみ反応) ──
  -- 長い prefix から先に判定させるため priority で順序付け (小→大の order で
  -- applyReadingRules が回る前提なら km/cm/mm を先に)。
  --   km = キロメートル, cm = センチメートル, mm = ミリメートル, ml = ミリリットル,
  --   kg = キログラム, Hz = ヘルツ, kHz / MHz / GHz も個別登録。
  --   m / g / l / L は 2 文字ユニットの後に適用したいので priority を低くする。
  ('ja', 'pre', '(?<=\d)\s?km(?![A-Za-z])',  'キロメートル',   '', 30, '単位 km'),
  ('ja', 'pre', '(?<=\d)\s?cm(?![A-Za-z])',  'センチメートル', '', 30, '単位 cm'),
  ('ja', 'pre', '(?<=\d)\s?mm(?![A-Za-z])',  'ミリメートル',   '', 30, '単位 mm'),
  ('ja', 'pre', '(?<=\d)\s?ml(?![A-Za-z])',  'ミリリットル',   '', 30, '単位 ml'),
  ('ja', 'pre', '(?<=\d)\s?kg(?![A-Za-z])',  'キログラム',     '', 30, '単位 kg'),
  ('ja', 'pre', '(?<=\d)\s?GHz(?![A-Za-z])', 'ギガヘルツ',     '', 30, '単位 GHz'),
  ('ja', 'pre', '(?<=\d)\s?MHz(?![A-Za-z])', 'メガヘルツ',     '', 30, '単位 MHz'),
  ('ja', 'pre', '(?<=\d)\s?kHz(?![A-Za-z])', 'キロヘルツ',     '', 30, '単位 kHz'),
  ('ja', 'pre', '(?<=\d)\s?Hz(?![A-Za-z])',  'ヘルツ',         '', 30, '単位 Hz'),
  -- 2 文字系が先に食うので single-char 単位は後段 (priority 40) に。
  ('ja', 'pre', '(?<=\d)\s?m(?![A-Za-z])',   'メートル',       '', 40, '単位 m'),
  ('ja', 'pre', '(?<=\d)\s?g(?![A-Za-z])',   'グラム',         '', 40, '単位 g'),
  ('ja', 'pre', '(?<=\d)\s?l(?![A-Za-z])',   'リットル',       '', 40, '単位 l'),
  ('ja', 'pre', '(?<=\d)\s?L(?![A-Za-z])',   'リットル',       '', 40, '単位 L')
) AS v(language, scope, pattern, replacement, flags, priority, note)
WHERE NOT EXISTS (
  SELECT 1 FROM tts_reading_rules r
  WHERE r.language = v.language AND r.scope = v.scope AND r.pattern = v.pattern
);
