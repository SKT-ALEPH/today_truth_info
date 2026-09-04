"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Clock3,
  Database,
  ExternalLink,
  History,
  LoaderCircle,
  Minus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { comparisonFor, type BoardSnapshot, type DailyReading, type ErrorCode, type NormalizedReading } from "@/lib/domain";

interface LiveApiSuccess {
  mode: "preview" | "capture";
  reading: NormalizedReading;
  raw: unknown;
  saved?: boolean;
  sealed?: boolean;
  snapshot?: BoardSnapshot;
  status: { freshness: "fresh"; error_code: "none" };
}

interface LiveApiError {
  error_code: ErrorCode | "invalid_request" | "storage_not_configured" | "storage_unavailable";
  message?: string;
  reading?: NormalizedReading;
}

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: object;
          annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
          execute: (input: unknown) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

function toKstRfc3339(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+09:00`;
}

function rawValue(row: DailyReading | undefined) {
  if (!row?.raw_payload || typeof row.raw_payload !== "object") return null;
  const current = (row.raw_payload as { current?: unknown }).current;
  if (!current || typeof current !== "object") return null;
  const value = (current as { temperature_2m?: unknown }).temperature_2m;
  return typeof value === "number" ? value : null;
}

function errorCopy(code: LiveApiError["error_code"]) {
  const messages: Record<LiveApiError["error_code"], string> = {
    timeout: "원천 응답이 제한시간을 넘었습니다. 마지막 정상값은 그대로 둡니다.",
    auth: "외부 원천이 요청을 거절했습니다. 이 화면의 로그인이 필요한 것은 아닙니다.",
    rate_limit: "외부 원천의 호출 제한에 도달했습니다. 잠시 뒤 다시 시도해 주세요.",
    offline: "외부 원천에 연결할 수 없습니다. 네트워크가 복구되면 다시 시도해 주세요.",
    schema_error: "원천 응답 형식이 바뀌었습니다. 검증 전 값은 저장하지 않습니다.",
    invalid_request: "요청 형식이 올바르지 않습니다.",
    storage_not_configured: "실제값은 조회했지만 데이터베이스가 연결되지 않아 기록하지 못했습니다.",
    storage_unavailable: "저장소에 일시적으로 연결할 수 없습니다.",
  };
  return messages[code];
}

export function LivePanel({ initialSnapshot }: { initialSnapshot: BoardSnapshot }) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot>(initialSnapshot);
  const [preview, setPreview] = useState<{ reading: NormalizedReading; raw: unknown } | null>(null);
  const [loading, setLoading] = useState<"preview" | "capture" | null>(null);
  const [error, setError] = useState<LiveApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runLive = useCallback(async (action: "preview" | "capture") => {
    setLoading(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json()) as LiveApiSuccess | LiveApiError;
      if (!response.ok || !("reading" in body) || !("mode" in body)) {
        const apiError = body as LiveApiError;
        if (apiError.reading) setPreview({ reading: apiError.reading, raw: null });
        setError(apiError);
        return { ok: false, error_code: apiError.error_code };
      }

      setPreview({ reading: body.reading, raw: body.raw });
      if (body.snapshot) setSnapshot(body.snapshot);
      if (action === "capture") {
        setNotice(
          body.saved
            ? body.sealed
              ? "두 번째 실제 날짜를 저장하고 증거 묶음을 봉인했습니다."
              : "오늘의 실제 기록을 저장했습니다. 같은 KST 날짜에는 이 행만 갱신됩니다."
            : "두 날짜가 이미 봉인되어 새 값은 미리보기로만 표시했습니다.",
        );
      }
      return { ok: true, reading: body.reading, saved: body.saved ?? false };
    } catch {
      setError({ error_code: "offline" });
      return { ok: false, error_code: "offline" };
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "read_live_temperature",
      title: "서울 현재 기온 조회",
      description: "Open-Meteo에서 서울의 현재 2m 기온을 조회하되 일별 기록은 변경하지 않습니다.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async () => runLive("preview"),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [runLive]);

  const latestStored = snapshot.readings.at(-1);
  const current = preview?.reading ?? latestStored?.reading ?? null;
  const latestComparison = useMemo(
    () => latestStored ? comparisonFor(snapshot.readings, latestStored) : null,
    [latestStored, snapshot.readings],
  );
  const shownRaw = rawValue(latestStored);
  const isBusy = loading === "preview" || loading === "capture";

  return (
    <section className="workspace" aria-labelledby="live-heading">
      <div className="status-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">LIVE READING</p>
            <h1 id="live-heading">서울의 지금 기온</h1>
          </div>
          <span className={`state ${error ? (latestStored ? "stale" : "error") : current ? "fresh" : "pending"}`}>
            {error ? (latestStored ? "오래된 값 · stale" : "조회 실패") : current ? "정상 · fresh" : "조회 전"}
          </span>
        </div>

        <div className={`reading ${current ? "" : "pending-reading"}`} aria-live="polite">
          <strong>{current?.normalized_value ?? "—"}</strong><span>{current?.unit ?? "°C"}</span>
        </div>

        {error ? (
          <div className="inline-alert error-alert" role="alert">
            <TriangleAlert size={18} />
            <p><strong>{error.error_code}</strong>{error.message ?? errorCopy(error.error_code)}</p>
          </div>
        ) : (
          <p className="plain-note">서울 시청 좌표의 날씨 모델 기반 2m 기온입니다. 관측소 실측값으로 표현하지 않습니다.</p>
        )}

        {notice && <div className="inline-alert success-alert"><Check size={18} /><p>{notice}</p></div>}

        <div className="action-row">
          <button className="primary-button" onClick={() => void runLive("preview")} disabled={isBusy}>
            {loading === "preview" ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
            지금 조회
          </button>
          <button className="secondary-button" onClick={() => void runLive("capture")} disabled={isBusy || snapshot.sealed}>
            {loading === "capture" ? <LoaderCircle className="spin" size={17} /> : <Archive size={17} />}
            {snapshot.sealed ? "2일 기록 봉인 완료" : "오늘 기록 저장"}
          </button>
        </div>
      </div>

      <aside className="provenance-card" aria-label="출처 정보">
        <p className="eyebrow">PROVENANCE</p>
        <dl>
          <div><dt>출처</dt><dd>{current?.source_name ?? "Open-Meteo Weather Forecast API"}</dd></div>
          <div><dt>실제 공개 원천</dt><dd>{current ? <a href={current.source_url} target="_blank" rel="noreferrer">응답 JSON 열기 <ExternalLink size={13} /></a> : "조회 후 연결"}</dd></div>
          <div><dt>출처 시각</dt><dd><code>{current?.source_time ?? "조회 후 표시"}</code></dd></div>
          <div><dt>조회 시각</dt><dd><code>{toKstRfc3339(current?.fetched_at)}</code></dd></div>
          <div><dt>기준 시간대</dt><dd><code>Asia/Seoul</code></dd></div>
        </dl>
        <div className="storage-state">
          <Database size={16} />
          <span>{snapshot.configured ? (snapshot.sealed ? "실제 2일 기록 봉인됨" : "영구 저장소 연결됨") : "배포 시 영구 저장소 연결 필요"}</span>
        </div>
      </aside>

      <section className="history-card" aria-labelledby="history-heading">
        <div className="section-title">
          <History size={18} />
          <div><p className="eyebrow">DAILY RECORDS</p><h2 id="history-heading">실제 KST 날짜 기록</h2></div>
          <a className="evidence-link" href="/api/evidence" target="_blank" rel="noreferrer">JSON</a>
          <span className="counter">{snapshot.readings.length} / 2</span>
        </div>

        {snapshot.readings.length === 0 ? (
          <div className="empty-state">
            <span>01</span>
            <p><strong>첫 실제 기록을 기다리고 있습니다.</strong> 조회 성공 뒤 KST 날짜 기준으로 하루 한 행만 저장합니다.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>조회 날짜</th><th>정규화 값</th><th>원천 시각</th><th>서버 생성 시각</th><th>원자료 SHA-256</th></tr></thead>
              <tbody>
                {snapshot.readings.map((row) => (
                  <tr key={row.record_id}>
                    <td><strong>{row.record_date}</strong><small>Asia/Seoul</small></td>
                    <td className="numeric">{row.normalized_value} {row.unit}</td>
                    <td><code>{row.reading.source_time ?? "null"}</code></td>
                    <td><code>{toKstRfc3339(row.server_created_at)}</code></td>
                    <td><code className="hash">{row.raw_sha256}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {latestComparison?.state === "comparable" && (
          <div className="delta-proof">
            <div className="delta-icon">
              {latestComparison.direction === "increase" ? <ArrowUpRight /> : latestComparison.direction === "decrease" ? <ArrowDownRight /> : <Minus />}
            </div>
            <div><span>어제 대비 재계산</span><strong>{snapshot.readings[1].normalized_value} − {snapshot.readings[0].normalized_value} = {latestComparison.signed_delta && latestComparison.signed_delta > 0 ? "+" : ""}{latestComparison.signed_delta} {latestComparison.unit}</strong></div>
          </div>
        )}
      </section>

      <section className="proof-card" aria-labelledby="proof-heading">
        <div className="section-title">
          <Clock3 size={18} />
          <div><p className="eyebrow">ONE READING, THREE VIEWS</p><h2 id="proof-heading">원자료·저장값·화면값 대조</h2></div>
        </div>
        {latestStored ? (
          <div className="proof-grid">
            <div><span>원자료</span><code>current.temperature_2m = {shownRaw ?? "확인 불가"}</code></div>
            <div><span>저장값</span><code>normalized_value = {latestStored.normalized_value}</code></div>
            <div><span>화면값</span><code>{latestStored.normalized_value} {latestStored.unit}</code></div>
            <span className={`match-badge ${shownRaw === latestStored.normalized_value ? "matched" : ""}`}>
              {shownRaw === latestStored.normalized_value ? <><Check size={14} /> 숫자 일치</> : "대조 필요"}
            </span>
          </div>
        ) : (
          <p className="proof-empty">실제 기록이 저장되면 같은 한 건을 세 위치에서 대조합니다.</p>
        )}
      </section>
    </section>
  );
}
