-- Per-slot broadcast lifecycle 用に status カラム追加.
-- reserved (作成済 / bind 前) → live (transition→live 後) → completed (transition→complete 後).
-- 既存 row は live 中だった可能性もあるが、scheduler が次に enterIdle するときに
-- /complete が走って 'completed' にマークされるので、デフォルト NULL で問題なし.

ALTER TABLE stream_youtube_broadcasts
  ADD COLUMN IF NOT EXISTS status text;
