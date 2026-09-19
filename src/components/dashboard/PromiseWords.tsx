"use client";

import type { DashboardData } from "@/lib/dashboard";
import { useGrow } from "./DashboardView";

/**
 * 팀 실천약속 — 카테고리별 핵심 단어 (원문 비노출 원칙 유지)
 * 리더행동 · 팀원행동 · 팀루틴/구조 세 열에, 각 카테고리의 약속 문장에서 자주 나온 단어를 막대로 보여준다.
 * 단어는 DB에서 조사·서술어 꼬리를 떼고('회의를'→'회의', '공유합니다'→'공유') 한 팀당 1번만 센다.
 */
const COLUMNS = [
  { key: "leader", title: "리더행동", sub: "리더는 ~합니다", color: "var(--pre)" },
  { key: "member", title: "팀원행동", sub: "팀원은 ~합니다", color: "var(--gold)" },
  { key: "routine", title: "팀루틴/구조", sub: "우리는 ~합니다", color: "var(--amber)" },
] as const;

export function PromiseWords({ words, teams }: { words: DashboardData["promise_words"]; teams: number }) {
  const on = useGrow();
  return (
    <div className="db-pw">
      {COLUMNS.map((col) => {
        const list = words[col.key];
        const max = Math.max(1, ...list.map((x) => x[1]));
        return (
          <div className="db-pw-col" key={col.key}>
            <div className="db-pw-head" style={{ color: col.color }}>{col.title}<span>{col.sub}</span></div>
            {list.length === 0 && <div className="db-pw-empty">—</div>}
            {list.map(([w, c]) => (
              <div className="db-pw-row" key={w} title={`${teams}개 팀 중 ${c}개 팀`}>
                <span className="db-pw-bar" style={{ width: on ? `${Math.max(8, (c / max) * 100)}%` : 0, background: col.color }} />
                <span className="db-pw-w">{w}</span>
                <span className="db-pw-c">{c}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
