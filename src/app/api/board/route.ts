import { getBoardSnapshot } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getBoardSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { configured: true, sealed: false, readings: [], error: "storage_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
