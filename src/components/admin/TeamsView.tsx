"use client";

import { useMemo, useState, useTransition } from "react";
import { addTeam, approveTeam, mergeTeam } from "@/app/admin/(console)/data/actions";
import { useToast } from "./ui";

export type TeamRow = {
  id: string; name: string; org: string; sil: string; headcount: number | null;
  identities: number; identitySessions: string[]; promises: number;
};
export type PendingTeam = { id: string; name: string; identities: number; finders: number; promises: number; sessions: string[] };

type Modal = { kind: "add" } | { kind: "approve"; team: PendingTeam } | { kind: "merge"; team: PendingTeam };

export function TeamsView({ roster, pending, summary }: { roster: TeamRow[]; pending: PendingTeam[]; summary: string }) {
  const { toast, node } = useToast();
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);

  const orgs = useMemo(() => [...new Set(roster.map((t) => t.org))].sort((a, b) => a.localeCompare(b, "ko")), [roster]);
  const shown = roster.filter((t) => (!org || t.org === org) && (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <>
      <div className="ad-mhead">
        <div><h1>팀 명부</h1><div className="s">{summary}</div></div>
        <div className="acts"><button className="ad-btn pri" onClick={() => setModal({ kind: "add" })}>+ 팀 추가</button></div>
      </div>

      {pending.length > 0 && (
        <div className="ad-pending">
          <div className="t">명부에 없는 팀 입력 {pending.length}건 — 확인이 필요합니다</div>
          {pending.map((t) => (
            <div className="row" key={t.id}>
              <div>
                <div className="nm">{t.name}</div>
                <div className="ct">
                  {t.sessions.length ? `${t.sessions.join("·")}차수 · ` : ""}
                  {[t.identities && `팀 정체성 ${t.identities}건`, t.finders && `인재상 ${t.finders}건`, t.promises && `팀 실천약속 ${t.promises}건`].filter(Boolean).join(" · ") || "연결된 제출 없음"}
                  에서 직접 입력됨
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="ad-btn sm sec" onClick={() => setModal({ kind: "merge", team: t })}>기존 팀에 병합</button>
                <button className="ad-btn sm pri" onClick={() => setModal({ kind: "approve", team: t })}>명부에 추가</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ad-filters">
        <input placeholder="팀 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="조직 필터">
          <option value="">전체 조직</option>
          {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="ad-card" style={{ paddingTop: 14 }}>
        <div className="ad-tablewrap">
          <table>
            <thead><tr><th>팀</th><th>조직</th><th>실</th><th>인원</th><th>정체성</th><th>실천약속</th></tr></thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td><td>{t.org}</td><td>{t.sil || "—"}</td>
                  <td>{t.headcount != null ? `${t.headcount}명` : "—"}</td>
                  <td>
                    {t.identities ? `${t.identities}건` : "—"}
                    {t.identitySessions.length > 1 && <span className="ad-badge flag" style={{ marginLeft: 6 }}>⚑ {t.identitySessions.join("·")}차수</span>}
                  </td>
                  <td>{t.promises ? `${t.promises}건` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <div className="ad-empty">조건에 맞는 팀이 없습니다.</div>}
        <div className="ad-helper">{shown.length}개 팀 표시 · ⚑ = 여러 차수에서 팀 정체성을 제출(대형 팀 분할 입과)</div>
      </div>

      {modal && <TeamModal modal={modal} roster={roster} onClose={() => setModal(null)} onDone={(m) => { setModal(null); toast(m); }} />}
      {node}
    </>
  );
}

function TeamModal({
  modal, roster, onClose, onDone,
}: { modal: Modal; roster: TeamRow[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [v, setV] = useState({ name: "", org_name: "", sil_name: "", headcount: "" });
  const [target, setTarget] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const orgs = [...new Set(roster.map((t) => t.org))];
  const candidates = roster.filter((t) => !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 50);

  const submit = () =>
    start(async () => {
      const res =
        modal.kind === "add" ? await addTeam(v)
        : modal.kind === "approve" ? await approveTeam(modal.team.id, v)
        : await mergeTeam(modal.team.id, target);
      if (res.ok) onDone(res.message ?? (modal.kind === "add" ? "팀을 추가했습니다" : "명부에 추가했습니다 — 자동완성에 바로 반영됩니다"));
      else setError(res.message);
    });

  const title = modal.kind === "add" ? "팀 추가" : modal.kind === "approve" ? `명부에 추가 — ${modal.team.name}` : `기존 팀에 병합 — ${modal.team.name}`;
  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 480 }}>
        <h2>{title}</h2>
        {modal.kind === "merge" ? (
          <>
            <div className="cap">오타·약칭으로 입력된 경우입니다. 이 이름으로 들어온 제출이 모두 선택한 팀으로 옮겨집니다.</div>
            <div className="ad-form">
              <div className="full"><label htmlFor="ms">팀 검색</label><input id="ms" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="팀 이름" /></div>
              <div className="full">
                <label htmlFor="mt">병합할 팀</label>
                <select id="mt" size={7} value={target} onChange={(e) => setTarget(e.target.value)} style={{ height: "auto" }}>
                  {candidates.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.org}</option>)}
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="cap">{modal.kind === "approve" ? "조직 정보를 채우면 정식 팀이 되어 참여자 자동완성에 나타납니다." : "조직 개편 등으로 새 팀이 생긴 경우에 사용합니다."}</div>
            <div className="ad-form">
              {modal.kind === "add" && <div className="full"><label htmlFor="tn">팀 이름 *</label><input id="tn" value={v.name} onChange={set("name")} maxLength={60} /></div>}
              <div><label htmlFor="to">조직 *</label><input id="to" list="org-list" value={v.org_name} onChange={set("org_name")} maxLength={40} /><datalist id="org-list">{orgs.map((o) => <option key={o} value={o} />)}</datalist></div>
              <div><label htmlFor="ts">실</label><input id="ts" value={v.sil_name} onChange={set("sil_name")} placeholder="비우면 본부 직속" maxLength={40} /></div>
              <div><label htmlFor="th">인원</label><input id="th" inputMode="numeric" value={v.headcount} onChange={set("headcount")} /></div>
            </div>
          </>
        )}
        {error && <div className="ad-err" role="alert">{error}</div>}
        <div className="foot"><div className="r">
          <button className="ad-btn sec" onClick={onClose}>닫기</button>
          <button className="ad-btn pri" disabled={pending || (modal.kind === "merge" && !target)} onClick={submit}>
            {pending ? "처리 중…" : modal.kind === "merge" ? "병합" : "저장"}
          </button>
        </div></div>
      </div>
    </div>
  );
}
