import { getBoardSnapshot } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getBoardSnapshot();
    return Response.json({
      schema_version: 1,
      kind: "t04_live_evidence_export",
      status: snapshot.readings.length === 2 ? "sealed" : "collecting",
      record_timezone: "Asia/Seoul",
      record_count: snapshot.readings.length,
      records: snapshot.readings.map((row) => ({
        server_created_at: row.server_created_at,
        source_url: row.reading.source_url,
        source_observed_at: row.reading.source_time,
        normalized_value: row.normalized_value,
        unit: row.unit,
        record_date: row.record_date,
        raw_sha256: row.raw_sha256,
      })),
      note: "플랫폼 과정 영수증을 대신하지 않는 공개 보조 내보내기입니다.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "evidence_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
