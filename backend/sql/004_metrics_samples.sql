-- Time-series table for the host-level metrics (CPU / memory / GPU /
-- per-container Docker stats) the collector writes every 15 s.
--
-- Rationale: keep everything under admin-db so the admin dashboard
-- can present system observability without an external Prometheus /
-- Grafana stack. Retention is pruned by a 6h cron down to 7 days.
--
-- Columns:
--   kind    — 'cpu' | 'memory' | 'gpu' | 'docker' | 'disk' | 'network'
--   subject — nullable identifier inside a kind:
--             null (host-wide CPU / memory)
--             '0', '1'...  for GPU index
--             container name for docker
--             block device for disk
--             interface name for network
--   metric  — 'usage_pct' | 'mem_used_mb' | 'mem_total_mb' | 'mem_pct'
--             | 'vram_used_mb' | 'vram_total_mb' | 'vram_pct'
--             | 'temp_c' | 'power_w'
--             | 'cpu_pct' (per-container) | 'rx_bps' | 'tx_bps'
--   value   — numeric, always (pct 0-100 / bytes / MB / celsius / etc.)

CREATE TABLE IF NOT EXISTS metrics_samples (
  id          BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind        TEXT NOT NULL,
  subject     TEXT,
  metric      TEXT NOT NULL,
  value       NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS metrics_samples_recent
  ON metrics_samples (recorded_at DESC);

CREATE INDEX IF NOT EXISTS metrics_samples_lookup
  ON metrics_samples (kind, subject, metric, recorded_at DESC);
