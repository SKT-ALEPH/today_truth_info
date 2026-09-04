CREATE TABLE IF NOT EXISTS live_daily_readings (
  record_id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  record_date DATE NOT NULL,
  normalized_value NUMERIC NOT NULL,
  unit TEXT NOT NULL CHECK (length(unit) BETWEEN 1 AND 24),
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  source_time TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL,
  record_timezone TEXT NOT NULL CHECK (record_timezone = 'Asia/Seoul'),
  first_fetched_at TIMESTAMPTZ NOT NULL,
  last_fetched_at TIMESTAMPTZ NOT NULL,
  server_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB NOT NULL,
  raw_sha256 TEXT NOT NULL CHECK (raw_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (signal_id, record_date)
);

CREATE INDEX IF NOT EXISTS live_daily_readings_signal_date_idx
  ON live_daily_readings (signal_id, record_date DESC);
