export const ERROR_CODES = [
  "timeout",
  "auth",
  "rate_limit",
  "offline",
  "schema_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type Freshness = "fresh" | "stale";

export interface NormalizedReading {
  signal_id: string;
  normalized_value: number;
  unit: string;
  source_name: string;
  source_url: string;
  source_time: string | null;
  fetched_at: string;
  record_timezone: "Asia/Seoul";
  record_date: string;
}

export interface ReadingStatus {
  freshness: Freshness;
  error_code: "none" | ErrorCode;
}

export interface DailyReading {
  record_id: string;
  signal_id: string;
  record_date: string;
  normalized_value: number;
  unit: string;
  first_fetched_at: string;
  last_fetched_at: string;
  reading: NormalizedReading;
  raw_payload?: unknown;
  raw_sha256?: string;
  server_created_at?: string;
}

export interface BoardSnapshot {
  configured: boolean;
  sealed: boolean;
  readings: DailyReading[];
  error?: string;
}

export interface Comparison {
  state: "insufficient" | "unit_mismatch" | "comparable";
  direction: "increase" | "decrease" | "unchanged" | null;
  magnitude: number | null;
  signed_delta: number | null;
  unit: string | null;
}

export interface ReplayState {
  schema_version: "aleph-t04-evaluation-state-v1";
  daily_readings: DailyReading[];
  current_reading: NormalizedReading | null;
  status: ReadingStatus | null;
  last_comparison: Comparison;
  last_run: {
    fixture_id: string | null;
    virtual_now: string | null;
    outcome: "success" | "error";
    error_code: "none" | ErrorCode;
    retry_after_seconds: number | null;
  } | null;
  sequence: number;
}

export interface ReplayFixture {
  fixture_id: string;
  contract_version: "1.1.0";
  description_ko: string;
  virtual_now: string;
  transport: {
    mode: "http" | "timeout" | "offline";
    status: number | null;
    delay_ms: number;
    deadline_ms: number;
    headers: Record<string, string>;
  };
  payload: unknown;
  expected: {
    freshness: Freshness;
    error_code: "none" | ErrorCode;
    row_count: number;
    stored_value: number | null;
    delta: number | null;
    preserve_last_good: boolean;
    same_record_id_as?: string;
    record_date?: string;
  };
}

const NORMALIZED_KEYS = [
  "signal_id",
  "normalized_value",
  "unit",
  "source_name",
  "source_url",
  "source_time",
  "fetched_at",
  "record_timezone",
  "record_date",
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function kstDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("fetched_at must be a valid ISO-8601 date-time");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function validateNormalizedReading(value: unknown): asserts value is NormalizedReading {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("normalized reading must be an object");
  }

  const reading = value as Record<string, unknown>;
  const actualKeys = Object.keys(reading).sort();
  const expectedKeys = [...NORMALIZED_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError(`normalized reading keys must be exactly: ${NORMALIZED_KEYS.join(", ")}`);
  }

  if (
    typeof reading.signal_id !== "string" ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(reading.signal_id) ||
    reading.signal_id.length > 100
  ) {
    throw new TypeError("signal_id is invalid");
  }
  if (typeof reading.normalized_value !== "number" || !Number.isFinite(reading.normalized_value)) {
    throw new TypeError("normalized_value must be a finite number");
  }
  if (typeof reading.unit !== "string" || reading.unit.length < 1 || reading.unit.length > 24) {
    throw new TypeError("unit is invalid");
  }
  if (
    typeof reading.source_name !== "string" ||
    reading.source_name.length < 1 ||
    reading.source_name.length > 120
  ) {
    throw new TypeError("source_name is invalid");
  }
  if (typeof reading.source_url !== "string") {
    throw new TypeError("source_url is invalid");
  }
  const sourceUrl = new URL(reading.source_url);
  if (sourceUrl.protocol !== "https:") {
    throw new TypeError("source_url must use HTTPS");
  }
  if (
    reading.source_time !== null &&
    (typeof reading.source_time !== "string" || Number.isNaN(new Date(reading.source_time).getTime()))
  ) {
    throw new TypeError("source_time must be a valid date-time or null");
  }
  if (typeof reading.fetched_at !== "string" || Number.isNaN(new Date(reading.fetched_at).getTime())) {
    throw new TypeError("fetched_at must be a valid date-time");
  }
  if (reading.record_timezone !== "Asia/Seoul") {
    throw new TypeError("record_timezone must be Asia/Seoul");
  }
  if (
    typeof reading.record_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(reading.record_date) ||
    reading.record_date !== kstDate(reading.fetched_at)
  ) {
    throw new TypeError("record_date must be the Asia/Seoul date derived from fetched_at");
  }
}

export function resetReplayState(): ReplayState {
  return {
    schema_version: "aleph-t04-evaluation-state-v1",
    daily_readings: [],
    current_reading: null,
    status: null,
    last_comparison: {
      state: "insufficient",
      direction: null,
      magnitude: null,
      signed_delta: null,
      unit: null,
    },
    last_run: null,
    sequence: 0,
  };
}

export function comparisonFor(rows: DailyReading[], current: DailyReading): Comparison {
  const previous = rows
    .filter((row) => row.signal_id === current.signal_id && row.record_date < current.record_date)
    .sort((left, right) => right.record_date.localeCompare(left.record_date))[0];

  if (!previous) {
    return { state: "insufficient", direction: null, magnitude: null, signed_delta: null, unit: null };
  }
  if (previous.unit !== current.unit) {
    return { state: "unit_mismatch", direction: null, magnitude: null, signed_delta: null, unit: null };
  }

  const signed = Number((current.normalized_value - previous.normalized_value).toFixed(10));
  return {
    state: "comparable",
    direction: signed > 0 ? "increase" : signed < 0 ? "decrease" : "unchanged",
    magnitude: Math.abs(signed),
    signed_delta: signed,
    unit: current.unit,
  };
}

export function applySuccessfulReading(
  inputState: ReplayState,
  reading: NormalizedReading,
  runMeta: { fixture_id?: string; virtual_now?: string } = {},
): ReplayState {
  validateNormalizedReading(reading);
  const state = clone(inputState);
  const existingIndex = state.daily_readings.findIndex(
    (row) => row.signal_id === reading.signal_id && row.record_date === reading.record_date,
  );
  const existing = existingIndex >= 0 ? state.daily_readings[existingIndex] : null;
  const row: DailyReading = {
    record_id: existing?.record_id ?? `demo-${reading.signal_id}-${reading.record_date}`,
    signal_id: reading.signal_id,
    record_date: reading.record_date,
    normalized_value: reading.normalized_value,
    unit: reading.unit,
    first_fetched_at: existing?.first_fetched_at ?? reading.fetched_at,
    last_fetched_at: reading.fetched_at,
    reading: clone(reading),
  };

  if (existingIndex >= 0) state.daily_readings[existingIndex] = row;
  else state.daily_readings.push(row);
  state.daily_readings.sort((left, right) => left.record_date.localeCompare(right.record_date));

  state.current_reading = clone(reading);
  state.status = { freshness: "fresh", error_code: "none" };
  state.last_comparison = comparisonFor(state.daily_readings, row);
  state.sequence += 1;
  state.last_run = {
    fixture_id: runMeta.fixture_id ?? null,
    virtual_now: runMeta.virtual_now ?? reading.fetched_at,
    outcome: "success",
    error_code: "none",
    retry_after_seconds: null,
  };
  return state;
}

export function applyError(
  inputState: ReplayState,
  errorCode: ErrorCode,
  runMeta: { fixture_id?: string; virtual_now?: string; retry_after_seconds?: number | null } = {},
): ReplayState {
  if (!ERROR_CODES.includes(errorCode)) throw new TypeError(`unsupported error code: ${errorCode}`);
  const state = clone(inputState);
  state.status = { freshness: "stale", error_code: errorCode };
  state.sequence += 1;
  state.last_run = {
    fixture_id: runMeta.fixture_id ?? null,
    virtual_now: runMeta.virtual_now ?? null,
    outcome: "error",
    error_code: errorCode,
    retry_after_seconds: runMeta.retry_after_seconds ?? null,
  };
  return state;
}

export function runFixture(inputState: ReplayState, fixture: ReplayFixture): ReplayState {
  const meta = {
    fixture_id: fixture.fixture_id,
    virtual_now: fixture.virtual_now,
    retry_after_seconds: fixture.transport.headers["retry-after"]
      ? Number(fixture.transport.headers["retry-after"])
      : null,
  };

  if (fixture.transport.mode === "timeout") return applyError(inputState, "timeout", meta);
  if (fixture.transport.mode === "offline") return applyError(inputState, "offline", meta);
  if (fixture.transport.status === 401 || fixture.transport.status === 403) {
    return applyError(inputState, "auth", meta);
  }
  if (fixture.transport.status === 429) return applyError(inputState, "rate_limit", meta);
  if (fixture.transport.status !== null && fixture.transport.status >= 200 && fixture.transport.status < 300) {
    try {
      validateNormalizedReading(fixture.payload);
      return applySuccessfulReading(inputState, fixture.payload, meta);
    } catch {
      return applyError(inputState, "schema_error", meta);
    }
  }
  return applyError(inputState, "schema_error", meta);
}

export function validateStatus(status: ReadingStatus): boolean {
  if (status.freshness === "fresh") return status.error_code === "none";
  return ERROR_CODES.includes(status.error_code as ErrorCode);
}
