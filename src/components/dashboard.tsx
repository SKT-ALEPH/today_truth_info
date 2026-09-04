"use client";

import { useState } from "react";
import { Activity, CircleDot, FlaskConical, ShieldCheck } from "lucide-react";
import { LivePanel } from "@/components/live-panel";
import { ReplayLab } from "@/components/replay-lab";
import type { BoardSnapshot } from "@/lib/domain";
import { PACKAGE_ID } from "@/lib/fixtures";

type View = "live" | "replay";

export function Dashboard({ initialSnapshot }: { initialSnapshot: BoardSnapshot }) {
  const [view, setView] = useState<View>("live");

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><CircleDot size={18} /></span>
          <div>
            <strong>오늘의 진짜 정보판</strong>
            <span>서울 · 2m 현재 기온</span>
          </div>
        </div>
        <div className="timezone"><span /> 기준 시간대 Asia/Seoul</div>
      </header>

      <nav className="view-tabs" aria-label="정보판 보기">
        <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}>
          <Activity size={17} /> 실제 정보
        </button>
        <button className={view === "replay" ? "active" : ""} onClick={() => setView("replay")}>
          <FlaskConical size={17} /> 장애 재생실
        </button>
      </nav>

      {view === "live" ? <LivePanel initialSnapshot={initialSnapshot} /> : <ReplayLab />}

      <footer className="site-footer">
        <span><ShieldCheck size={15} /> 개인정보·사용자 위치를 수집하지 않습니다.</span>
        <code>{PACKAGE_ID}</code>
      </footer>
    </main>
  );
}
