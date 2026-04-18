-- Scope announcements per overlay locale (ja / en). NULL = show everywhere.
ALTER TABLE admin_announcements
  ADD COLUMN IF NOT EXISTS locale TEXT CHECK (locale IN ('ja', 'en'));

CREATE INDEX IF NOT EXISTS admin_announcements_locale
  ON admin_announcements (locale);
