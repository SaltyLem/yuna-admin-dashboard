-- Add `intent` column to stream_schedules.
-- 目的: YUNA がそのスケジュール枠でどんな意図で配信するか (e.g.
--   「新発見モバイルゲームの ファーストインプ」「視聴者からの質問祭り」
--   「リスナー互助会、悩み相談多めの夜」等) を保存し、stream director
--   がその意図を talker prompt に流して配信内容を寄せる用途.
-- 空文字 default で既存データに影響無し.

ALTER TABLE stream_schedules
  ADD COLUMN IF NOT EXISTS intent TEXT NOT NULL DEFAULT '';
