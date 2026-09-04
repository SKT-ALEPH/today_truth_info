import { z } from "zod";
import { getBoardSnapshot, saveLiveReading } from "@/lib/database";
import { fetchLiveReading, LiveSourceError } from "@/lib/live-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  action: z.enum(["preview", "capture"]),
});

function errorStatus(error: LiveSourceError) {
  if (error.code === "timeout") return 504;
  if (error.code === "rate_limit") return 429;
  return 502;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_024) {
    return Response.json({ error_code: "invalid_request" }, { status: 413 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error_code: "invalid_request" }, { status: 400 });
  }

  try {
    const live = await fetchLiveReading();
    if (parsed.data.action === "preview") {
      return Response.json({
        mode: "preview",
        reading: live.reading,
        raw: live.raw,
        status: { freshness: "fresh", error_code: "none" },
      });
    }

    try {
      const result = await saveLiveReading(live.reading, live.raw);
      return Response.json({
        mode: "capture",
        reading: live.reading,
        raw: live.raw,
        saved: result.saved,
        sealed: result.snapshot.sealed,
        snapshot: result.snapshot,
        status: { freshness: "fresh", error_code: "none" },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") {
        return Response.json(
          {
            error_code: "storage_not_configured",
            message: "저장소가 아직 연결되지 않아 실제값을 기록하지 못했습니다.",
            reading: live.reading,
          },
          { status: 503 },
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof LiveSourceError) {
      const snapshot = await getBoardSnapshot().catch(() => ({ configured: false, sealed: false, readings: [] }));
      return Response.json(
        {
          error_code: error.code,
          message: error.message,
          retry_after_seconds: error.retryAfterSeconds,
          last_good: snapshot.readings.at(-1) ?? null,
          status: { freshness: "stale", error_code: error.code },
        },
        { status: errorStatus(error) },
      );
    }
    return Response.json({ error_code: "storage_unavailable" }, { status: 503 });
  }
}
