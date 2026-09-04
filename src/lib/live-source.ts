import "server-only";

import { z } from "zod";
import { kstDate, type ErrorCode, type NormalizedReading } from "@/lib/domain";

export const LIVE_SOURCE_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m&temperature_unit=celsius&timezone=Asia%2FSeoul&forecast_days=1";

const openMeteoSchema = z.object({
  timezone: z.literal("Asia/Seoul"),
  current: z.object({
    time: z.string().min(16),
    temperature_2m: z.number().finite(),
  }),
  current_units: z.object({
    temperature_2m: z.string().min(1).max(24),
  }),
});

export class LiveSourceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "LiveSourceError";
  }
}

function sourceTimeWithOffset(value: string): string {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const result = `${withSeconds}+09:00`;
  if (Number.isNaN(new Date(result).getTime())) {
    throw new LiveSourceError("schema_error", "원천 시각 형식이 계약과 다릅니다.");
  }
  return result;
}

export function normalizeOpenMeteo(raw: unknown, fetchedAt: string): NormalizedReading {
  const parsed = openMeteoSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LiveSourceError("schema_error", "원천 응답 형식이 계약과 다릅니다.");
  }

  return {
    signal_id: "seoul.temperature_2m",
    normalized_value: parsed.data.current.temperature_2m,
    unit: parsed.data.current_units.temperature_2m,
    source_name: "Open-Meteo Weather Forecast API",
    source_url: LIVE_SOURCE_URL,
    source_time: sourceTimeWithOffset(parsed.data.current.time),
    fetched_at: fetchedAt,
    record_timezone: "Asia/Seoul",
    record_date: kstDate(fetchedAt),
  };
}

export async function fetchLiveReading(timeoutMs = 8_000): Promise<{
  reading: NormalizedReading;
  raw: unknown;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(LIVE_SOURCE_URL, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });

    if (response.status === 401 || response.status === 403) {
      throw new LiveSourceError("auth", "외부 원천이 요청을 거절했습니다.");
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new LiveSourceError(
        "rate_limit",
        "외부 원천의 호출 제한에 도달했습니다.",
        Number.isFinite(retryAfter) ? retryAfter : null,
      );
    }
    if (!response.ok) {
      throw new LiveSourceError("schema_error", "외부 원천이 예상하지 못한 응답을 보냈습니다.");
    }

    const raw: unknown = await response.json();
    const fetchedAt = new Date().toISOString();
    return { reading: normalizeOpenMeteo(raw, fetchedAt), raw };
  } catch (error) {
    if (error instanceof LiveSourceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new LiveSourceError("timeout", "외부 원천 응답이 제한시간을 넘었습니다.");
    }
    throw new LiveSourceError("offline", "외부 원천에 연결할 수 없습니다.");
  } finally {
    clearTimeout(timeout);
  }
}
