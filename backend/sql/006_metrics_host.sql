-- Multi-host support for metrics_samples.
--
-- Adds a `host` column so the same table can hold samples from the
-- local admin-backend collector (3080 Ti box) and from remote
-- metrics-agent containers (e.g. the 5090 box), still queryable with
-- a single index.
--
-- Existing rows are backfilled to 'linux-3080' since they were all
-- collected from the in-process collector on that machine.

ALTER TABLE metrics_samples
  ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT 'linux-3080';

-- Drop the old lookup index and recreate it with host as leading key.
DROP INDEX IF EXISTS metrics_samples_lookup;
CREATE INDEX IF NOT EXISTS metrics_samples_lookup
  ON metrics_samples (host, kind, subject, metric, recorded_at DESC);
