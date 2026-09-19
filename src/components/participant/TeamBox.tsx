"use client";

import { useEffect, useMemo, useState } from "react";
import type { Team, TeamPick } from "@/lib/participant/types";
import { lsGet, lsSet } from "./storage";

const TEAM_KEY = "hec:team"; // R4: 팀 선택은 기기에 기억되어 이후 폼에 자동 표시

export function orgLine(t: TeamPick): string {
  if (t.id === null) return "명부에 없는 팀 · 직접 입력";
  return [t.org_name, t.sil_name ?? "직속"].filter(Boolean).join(" · ");
}

export function TeamBox({
  teams, value, onChange,
}: { teams: Team[]; value: TeamPick | null; onChange: (t: TeamPick | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");

  const query = q.trim();
  const hits = useMemo(() => {
    if (query.length < 2) return []; // 2글자부터 검색
    const lower = query.toLowerCase(); // 영문 대소문자 무시
    return teams.filter((t) => t.name.toLowerCase().includes(lower)).slice(0, 6);
  }, [teams, query]);

  function pick(t: TeamPick) {
    lsSet(TEAM_KEY, t);
    onChange(t);
    setEditing(false);
    setQ("");
  }

  if (value && !editing)
    return (
      <div className="pt-team-box">
        <div className="pt-team-picked">
          <div>
            <div className="nm">{value.name}</div>
            <div className="org">{orgLine(value)}</div>
          </div>
          <button type="button" className="chg" onClick={() => setEditing(true)}>변경</button>
        </div>
        <div className="pt-remember">✓ 이 기기에 기억되어 다음 화면에도 자동으로 떠요</div>
      </div>
    );

  const exact = teams.some((t) => t.name.toLowerCase() === query.toLowerCase());
  return (
    <div className="pt-team-box">
      <input
        className="pt-f-input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60}
        placeholder="팀 이름을 2글자 이상 입력하세요" autoComplete="off" enterKeyHint="search" aria-label="소속 팀 검색"
      />
      {query.length >= 2 && (
        <div className="pt-sugg">
          {hits.map((t) => (
            <button type="button" key={t.id} className="pt-sugg-item" onClick={() => pick(t)}>
              <div className="nm">{t.name}</div>
              <div className="org">{orgLine(t)}</div>
            </button>
          ))}
          {hits.length === 0 && (
            <div className="pt-sugg-empty">명부에 없는 팀이에요 — 아래를 눌러 그대로 입력할 수 있어요</div>
          )}
          {!exact && (
            <button type="button" className="pt-sugg-item pt-sugg-raw" onClick={() => pick({ id: null, name: query })}>
              <div className="org">{hits.length > 0 ? "위 목록에 우리 팀이 없다면" : "명부에 없는 팀 · 운영진이 확인합니다"}</div>
              <div className="nm">“{query}” 그대로 입력</div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 폼에 팀이 비어 있으면 기억된 팀을 자동으로 채운다 */
export function useRememberedTeam(ready: boolean, current: TeamPick | null, set: (t: TeamPick) => void) {
  useEffect(() => {
    if (!ready || current) return;
    const t = lsGet<TeamPick>(TEAM_KEY);
    if (t) set(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
