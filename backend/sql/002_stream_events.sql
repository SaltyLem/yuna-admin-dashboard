-- Raw stream event log.
-- Every message flowing through stream:{ja,en}:{comments,status,speak,
-- speak_done,expression,control} is persisted here so the Live monitor
-- (and post-mortem tooling) can reconstruct the full timeline even when
-- YUNA has not created a session, or when Redis would otherwise drop the
-- event.
--
-- Retention: 30 days (cleaned nightly by admin-backend).
-- Speak event payloads are large; tighten separately if volume is heavy.

CREATE TABLE IF NOT EXISTS stream_events (
  id          BIGSERIAL PRIMARY KEY,
  channel     TEXT NOT NULL CHECK (channel IN ('ja', 'en')),
  event_type  TEXT NOT NULL,
  session_id  TEXT,
  payload     JSONB NOT NULL,
  emitted_at  TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stream_events_recent
  ON stream_events (channel, recorded_at DESC);

CREATE INDEX IF NOT EXISTS stream_events_by_session
  ON stream_events (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stream_events_by_type
  ON stream_events (event_type, recorded_at DESC);
