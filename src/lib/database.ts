import "server-only";

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { BoardSnapshot, DailyReading, NormalizedReading } from "@/lib/domain";

interface DatabaseRow {
  record_id: string;
  signal_id: string;
  record_date: string;
  normalized_value: number | string;
  unit: string;
  source_name: string;
  source_url: string;
  source_time: string | null;
  fetched_at: string;
  record_timezone: "Asia/Seoul";
  first_fetched_at: string;
  last_fetched_at: string;
  server_created_at: string;
  raw_payload: unknown;
  raw_sha256: string;
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  return databaseUrl ? neon(databaseUrl) : null;
}

function toDailyReading(row: DatabaseRow): DailyReading {
  const reading: NormalizedReading = {
    signal_id: row.signal_id,
    normalized_value: Number(row.normalized_value),
    unit: row.unit,
    source_name: row.source_name,
    source_url: row.source_url,
    source_time: row.source_time,
    fetched_at: row.fetched_at,
    record_timezone: row.record_timezone,
    record_date: row.record_date,
  };

  return {
    record_id: row.record_id,
    signal_id: row.signal_id,
    record_date: row.record_date,
    normalized_value: Number(row.normalized_value),
    unit: row.unit,
    first_fetched_at: row.first_fetched_at,
    last_fetched_at: row.last_fetched_at,
    server_created_at: row.server_created_at,
    raw_payload: row.raw_payload,
    raw_sha256: row.raw_sha256,
    reading,
  };
}

const selectColumns = `
  record_id,
  signal_id,
  record_date::text AS record_date,
  normalized_value,
  unit,
  source_name,
  source_url,
  CASE WHEN source_time IS NULL THEN NULL ELSE
    to_char(source_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS') || '+09:00'
  END AS source_time,
  to_char(fetched_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+09:00' AS fetched_at,
  record_timezone,
  to_char(first_fetched_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+09:00' AS first_fetched_at,
  to_char(last_fetched_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+09:00' AS last_fetched_at,
  to_char(server_created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+09:00' AS server_created_at,
  raw_payload,
  raw_sha256
`;

export async function getBoardSnapshot(): Promise<BoardSnapshot> {
  const sql = getSql();
  if (!sql) return { configured: false, sealed: false, readings: [] };

  const rows = (await sql.query(
    `SELECT ${selectColumns}
     FROM live_daily_readings
     WHERE signal_id = $1
     ORDER BY record_date ASC`,
    ["seoul.temperature_2m"],
  )) as DatabaseRow[];

  return {
    configured: true,
    sealed: rows.length >= 2,
    readings: rows.map(toDailyReading),
  };
}

export async function saveLiveReading(reading: NormalizedReading, raw: unknown): Promise<{
  saved: boolean;
  snapshot: BoardSnapshot;
}> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_NOT_CONFIGURED");

  const rawText = JSON.stringify(raw);
  const rawSha256 = createHash("sha256").update(rawText).digest("hex");
  const recordId = `live-${reading.signal_id}-${reading.record_date}`;

  const result = (await sql.query(
    `WITH current_count AS (
       SELECT COUNT(*)::integer AS count
       FROM live_daily_readings
       WHERE signal_id = $1
     ), written AS (
       INSERT INTO live_daily_readings (
         record_id, signal_id, record_date, normalized_value, unit,
         source_name, source_url, source_time, fetched_at, record_timezone,
         first_fetched_at, last_fetched_at, raw_payload, raw_sha256
       )
       SELECT $2, $1, $3::date, $4::numeric, $5, $6, $7, $8::timestamptz,
              $9::timestamptz, $10, $9::timestamptz, $9::timestamptz,
              $11::jsonb, $12
       FROM current_count
       WHERE count < 2
       ON CONFLICT (signal_id, record_date) DO UPDATE SET
         normalized_value = EXCLUDED.normalized_value,
         unit = EXCLUDED.unit,
         source_name = EXCLUDED.source_name,
         source_url = EXCLUDED.source_url,
         source_time = EXCLUDED.source_time,
         fetched_at = EXCLUDED.fetched_at,
         last_fetched_at = EXCLUDED.last_fetched_at,
         raw_payload = EXCLUDED.raw_payload,
         raw_sha256 = EXCLUDED.raw_sha256
       RETURNING record_id
     )
     SELECT EXISTS(SELECT 1 FROM written) AS saved`,
    [
      reading.signal_id,
      recordId,
      reading.record_date,
      reading.normalized_value,
      reading.unit,
      reading.source_name,
      reading.source_url,
      reading.source_time,
      reading.fetched_at,
      reading.record_timezone,
      rawText,
      rawSha256,
    ],
  )) as Array<{ saved: boolean }>;

  return { saved: Boolean(result[0]?.saved), snapshot: await getBoardSnapshot() };
}
