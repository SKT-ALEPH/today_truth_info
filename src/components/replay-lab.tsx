"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FlaskConical, LoaderCircle, RotateCcw, ShieldAlert } from "lucide-react";
import { resetReplayState, runFixture, type ErrorCode, type ReplayState } from "@/lib/domain";
import { loadFixture, PACKAGE_ID, PACKAGE_ZIP_SHA256, runFixtureSequence, type FixtureId } from "@/lib/fixtures";

const scenarios: Array<{ id: FixtureId; code: ErrorCode; label: string; explanation: string; next: string }> = [
  { id: "T04-TIMEOUT", code: "timeout", label: "응답 지연", explanation: "외부 응답이 1.5초 제한보다 늦었습니다.", next: "잠시 뒤 다시 시도해 주세요." },
  { id: "T04-AUTH-401", code: "auth", label: "401 거절", explanation: "외부 원천이 401로 요청을 거절했습니다.", next: "서비스 운영자가 원천 접근 정책을 확인합니다." },
  { id: "T04-RATE-429", code: "rate_limit", label: "호출 제한", explanation: "외부 원천의 호출 한도를 넘었습니다.", next: "Retry-After 60초 뒤 다시 시도해 주세요." },
  { id: "T04-OFFLINE", code: "offline", label: "오프라인", explanation: "외부 원천과 네트워크 연결이 끊겼습니다.", next: "연결 상태를 확인한 뒤 다시 시도해 주세요." },
  { id: "T04-SCHEMA-BREAK", code: "schema_error", label: "형식 변경", explanation: "값의 타입이 숫자에서 문자열로 바뀌었습니다.", next: "응답 계약을 점검하기 전에는 새 값을 저장하지 않습니다." },
];

export function ReplayLab() {
  const [state, setState] = useState<ReplayState>(resetReplayState);
  const [active, setActive] = useState<FixtureId | "normal" | null>(null);
  const [busy, setBusy] = useState(false);

  const playFailure = useCallback(async (fixtureId: FixtureId) => {
    setBusy(true);
    try {
      const fixtures = await runFixtureSequence(["T04-NORMAL-D1-A", "T04-NORMAL-D1-B", fixtureId]);
      setState(fixtures.reduce(runFixture, resetReplayState()));
      setActive(fixtureId);
      return { fixture_id: fixtureId, freshness: "stale", preserved_value: 105, daily_rows: 1 };
    } finally {
      setBusy(false);
    }
  }, []);

  const playNormal = useCallback(async () => {
    setBusy(true);
    try {
      const fixtures = await runFixtureSequence(["T04-NORMAL-D1-A", "T04-NORMAL-D1-B", "T04-NORMAL-D2"]);
      setState(fixtures.reduce(runFixture, resetReplayState()));
      setActive("normal");
    } finally {
      setBusy(false);
    }
  }, []);

  const recover = useCallback(async () => {
    setBusy(true);
    try {
      const fixture = await loadFixture("T04-RECOVER-D2");
      setState((current) => runFixture(current, fixture));
      setActive("T04-RECOVER-D2");
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    setState(resetReplayState());
    setActive(null);
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "replay_failure_scenario",
      title: "합성 실패 재생",
      description: "실제 기록을 변경하지 않고 선택한 T04 합성 실패를 기준 상태에서 재생합니다.",
      inputSchema: {
        type: "object",
        properties: { fixture_id: { type: "string", enum: scenarios.map((item) => item.id) } },
        required: ["fixture_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const id = (input as { fixture_id?: FixtureId }).fixture_id;
        if (!id || !scenarios.some((item) => item.id === id)) throw new Error("지원하지 않는 fixture_id입니다.");
        return playFailure(id);
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [playFailure]);

  const scenario = scenarios.find((item) => item.id === active);
  const value = state.current_reading?.normalized_value ?? null;
  const status = state.status;
  const recovered = active === "T04-RECOVER-D2";

  return (
    <section className="lab" aria-labelledby="lab-heading">
      <div className="lab-intro">
        <div>
          <p className="eyebrow">DETERMINISTIC REPLAY</p>
          <h1 id="lab-heading">실패를 숨기지 않는 재생실</h1>
          <p>모든 버튼은 공개 합성 자료만 사용합니다. 실제 날짜 기록과 데이터베이스는 변경하지 않습니다.</p>
        </div>
        <button className="ghost-button" onClick={reset} disabled={busy}><RotateCcw size={16} /> 초기화</button>
      </div>

      <div className="scenario-grid" aria-label="합성 재생 시나리오">
        <button className={active === "normal" ? "active" : ""} onClick={() => void playNormal()} disabled={busy}>
          <span className="scenario-number">00</span><strong>정상 D1→D2</strong><small>1행 갱신 후 2행 생성</small>
        </button>
        {scenarios.map((item, index) => (
          <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => void playFailure(item.id)} disabled={busy}>
            <span className="scenario-number">0{index + 1}</span><strong>{item.label}</strong><small>{item.code}</small>
          </button>
        ))}
      </div>

      <div className="replay-result">
        <div className="replay-reading">
          <div className="result-heading">
            <p className="eyebrow">LAST GOOD VALUE</p>
            {busy ? <span className="state pending"><LoaderCircle className="spin" size={14} /> 재생 중</span> : status ? <span className={`state ${status.freshness}`}>{status.freshness} / {status.error_code}</span> : <span className="state pending">대기</span>}
          </div>
          <div className={`reading compact ${value === null ? "pending-reading" : ""}`}><strong>{value ?? "—"}</strong><span>{state.current_reading?.unit ?? "pt"}</span></div>

          {scenario && (
            <div className="failure-explanation">
              <ShieldAlert size={19} />
              <div><strong>{scenario.explanation}</strong><span>{scenario.next}</span></div>
            </div>
          )}
          {recovered && (
            <div className="failure-explanation recovered">
              <Check size={19} />
              <div><strong>외부 원천이 복구되었습니다.</strong><span>fresh / none, 다음 날짜 행 1건과 값 120을 저장했습니다.</span></div>
            </div>
          )}
          {status?.freshness === "stale" && (
            <button className="primary-button retry-button" onClick={() => void recover()} disabled={busy}>
              다시 시도 · T04-RECOVER-D2
            </button>
          )}
        </div>

        <div className="state-ledger">
          <p className="eyebrow">STATE LEDGER</p>
          <dl>
            <div><dt>마지막 fixture</dt><dd>{state.last_run?.fixture_id ?? "—"}</dd></div>
            <div><dt>freshness</dt><dd>{status?.freshness ?? "—"}</dd></div>
            <div><dt>error_code</dt><dd>{status?.error_code ?? "—"}</dd></div>
            <div><dt>일별 행 수</dt><dd>{state.daily_readings.length}</dd></div>
            <div><dt>마지막 정상값</dt><dd>{value ?? "—"}</dd></div>
            <div><dt>변화값</dt><dd>{state.last_comparison.signed_delta === null ? "—" : `${state.last_comparison.signed_delta > 0 ? "+" : ""}${state.last_comparison.signed_delta}`}</dd></div>
          </dl>
        </div>
      </div>

      <div className="replay-table">
        <div className="section-title"><FlaskConical size={18} /><div><p className="eyebrow">SYNTHETIC DAILY ROWS</p><h2>합성 일별 기록</h2></div></div>
        {state.daily_readings.length ? (
          <div className="table-wrap"><table><thead><tr><th>record_id</th><th>KST 날짜</th><th>값</th><th>최초 조회</th><th>마지막 조회</th></tr></thead><tbody>{state.daily_readings.map((row) => <tr key={row.record_id}><td><code>{row.record_id}</code></td><td>{row.record_date}</td><td className="numeric">{row.normalized_value} {row.unit}</td><td><code>{row.first_fetched_at}</code></td><td><code>{row.last_fetched_at}</code></td></tr>)}</tbody></table></div>
        ) : <p className="proof-empty">시나리오를 선택하면 상태 전이를 여기서 확인할 수 있습니다.</p>}
      </div>

      <details className="contract-details">
        <summary>공개 fixture 계약과 해시</summary>
        <dl><div><dt>package_id</dt><dd><code>{PACKAGE_ID}</code></dd></div><div><dt>fixture contract</dt><dd><code>1.1.0</code></dd></div><div><dt>전달 ZIP SHA-256</dt><dd><code>{PACKAGE_ZIP_SHA256}</code></dd></div></dl>
      </details>
    </section>
  );
}
