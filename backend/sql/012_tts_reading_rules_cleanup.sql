-- 011 で DELETE できなかった「バックスラッシュ始まり」の古い pattern を明示的に削除。
-- PostgreSQL の LIKE は \ をエスケープ文字として扱うので '\m%' では拾えなかった。
-- ここでは ESCAPE '' (空) で LIKE のエスケープを無効化して \ 先頭を検索可能にする。

DELETE FROM tts_reading_rules
WHERE language = 'ja' AND scope = 'pre'
  AND (
    pattern LIKE '\m%' ESCAPE ''
    OR pattern LIKE '(?<=\d)%' ESCAPE ''
  );
