"use client";

import { useState, useTransition } from "react";
import { identitySentence, jEul } from "@/lib/josa";
import type { Submission, Tab } from "@/lib/admin-data";
import { sessionLabel } from "@/lib/participant/types";
import { editSubmission, reassignSession, setHidden } from "@/app/admin/(console)/data/actions";
import { useToast } from "./ui";

const EDIT_FIELDS: Record<Tab, [key: string, label: string, long?: boolean][]> = {
  identity: [["work", "고유업"], ["dna", "고유성"], ["goal", "지향점"]],
  finder: [["h_adj", "Heritage 형용사"], ["h_noun", "Heritage 명사"], ["f_adj", "Future 형용사"], ["f_noun", "Future 명사"],
    ["why_heritage", "Heritage 선정 이유", true], ["why_future", "Future 선정 이유", true]],
  pledge: [["adj", "형용사"], ["noun", "명사"], ["action", "실천 내용", true]],
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function Chip({ adj, noun, custom }: { adj: unknown; noun: unknown; custom: boolean }) {
  return <span className={`ad-kw${custom ? " ext" : ""}`}>{String(adj)} + {String(noun)}</span>;
}

export function DataTable({ tab, rows, sessions }: { tab: Tab; rows: Submission[]; sessions: { id: string; no: string }[] }) {
  const { toast, node } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Submission | null>(null);
  const [moving, setMoving] = useState<Submission | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      toast(res.ok ? okMsg : `실패: ${res.message}`);
      if (res.ok) after?.();
    });

  if (rows.length === 0) return node;
  return (
    <div className="ad-tablewrap">
      <table>
        <thead>
          <tr>
            <th>차수</th><th>{tab === "identity" ? "팀" : "소속 팀"}</th>
            {tab === "identity" && <th>완성 문장</th>}
            {tab === "finder" && <><th>Heritage 키워드</th><th>Future 키워드</th><th>선정 이유</th></>}
            {tab === "pledge" && <th>다짐</th>}
            <th>제출</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.hidden ? "dim" : ""}>
              <td>{r.session_no}</td>
              <td>
                <b>{r.team_name}</b>
                <div className="sub">{r.team_pending ? "미등록 팀" : [r.org, r.sil].filter(Boolean).join(" · ")}</div>
                {r.multi.length > 0 && <span className="ad-badge flag">복수 제출 · {r.multi.join("·")}차수에도</span>}
                {r.hidden && <span className="ad-badge flag">숨김됨</span>}
              </td>
              {tab === "identity" && <td>“{identitySentence(String(r.f.work), String(r.f.dna), String(r.f.goal))}”</td>}
              {tab === "finder" && (
                <>
                  <td><Chip adj={r.f.h_adj} noun={r.f.h_noun} custom={!!(r.f.h_adj_custom || r.f.h_noun_custom)} /></td>
                  <td><Chip adj={r.f.f_adj} noun={r.f.f_noun} custom={!!(r.f.f_adj_custom || r.f.f_noun_custom)} /></td>
                  <td className="sub" style={{ maxWidth: 300 }}>
                    {r.f.why_heritage && <div><b>H</b> {String(r.f.why_heritage)}</div>}
                    {r.f.why_future && <div><b>F</b> {String(r.f.why_future)}</div>}
                  </td>
                </>
              )}
              {tab === "pledge" && (
                <td>
                  <Chip adj={r.f.adj} noun={r.f.noun} custom={!!(r.f.adj_custom || r.f.noun_custom)} />
                  {jEul(String(r.f.noun))} 위해, 나는 {String(r.f.action)}{jEul(String(r.f.action))} 하겠습니다
                </td>
              )}
              <td style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
              <td>
                <div className="ad-rowacts">
                  {r.hidden ? (
                    <button className="ad-ract" disabled={pending} onClick={() => run(() => setHidden(tab, r.id, false), "복원했습니다")}>복원</button>
                  ) : (
                    <>
                      <button className="ad-ract" onClick={() => setEditing(r)}>수정</button>
                      <button className="ad-ract" onClick={() => setMoving(r)}>차수 재지정</button>
                      <button className="ad-ract danger" disabled={pending}
                        onClick={() => confirm("이 제출을 숨길까요? 현황판·집계에서 제외되며 언제든 복원할 수 있습니다.") && run(() => setHidden(tab, r.id, true), "숨김 처리했습니다")}>
                        숨김
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <EditModal tab={tab} row={editing} pending={pending} onClose={() => setEditing(null)}
          onSave={(input) => run(() => editSubmission(tab, editing.id, input), "수정했습니다", () => setEditing(null))} />
      )}
      {moving && (
        <MoveModal row={moving} sessions={sessions} pending={pending} onClose={() => setMoving(null)}
          onSave={(sid) => run(() => reassignSession(tab, moving.id, sid), "차수를 재지정했습니다", () => setMoving(null))} />
      )}
      {node}
    </div>
  );
}

function EditModal({
  tab, row, pending, onClose, onSave,
}: { tab: Tab; row: Submission; pending: boolean; onClose: () => void; onSave: (input: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(
    Object.fromEntries(EDIT_FIELDS[tab].map(([k]) => [k, (row.f[k] as string | null) ?? ""])),
  );
  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label="제출 수정">
        <h2>제출 수정 — {sessionLabel(row.session_no)} · {row.team_name}</h2>
        <div className="cap">오탈자 교정 등 최소한으로만 수정해 주세요.{tab === "identity" && " 수정 전 내용은 이력으로 보존됩니다."}</div>
        <div className="ad-form">
          {EDIT_FIELDS[tab].map(([k, label, long]) => (
            <div key={k} className={long || tab === "identity" ? "full" : ""}>
              <label htmlFor={`e-${k}`}>{label}</label>
              {long
                ? <textarea id={`e-${k}`} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
                : <input id={`e-${k}`} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />}
            </div>
          ))}
        </div>
        {tab === "identity" && <div className="ad-helper">“{identitySentence(v.work.trim(), v.dna.trim(), v.goal.trim())}”</div>}
        <div className="foot"><div className="r">
          <button className="ad-btn sec" onClick={onClose}>닫기</button>
          <button className="ad-btn pri" disabled={pending} onClick={() => onSave(v)}>{pending ? "저장 중…" : "저장"}</button>
        </div></div>
      </div>
    </div>
  );
}

function MoveModal({
  row, sessions, pending, onClose, onSave,
}: { row: Submission; sessions: { id: string; no: string }[]; pending: boolean; onClose: () => void; onSave: (sessionId: string) => void }) {
  const [sid, setSid] = useState(row.session_id);
  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label="차수 재지정" style={{ maxWidth: 420 }}>
        <h2>차수 재지정</h2>
        <div className="cap">{row.team_name} — 현재 {sessionLabel(row.session_no)}. 다른 방의 QR로 잘못 제출한 경우에 사용합니다.</div>
        <div className="ad-form"><div className="full">
          <label htmlFor="mv">옮길 차수</label>
          <select id="mv" value={sid} onChange={(e) => setSid(e.target.value)}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s.no)}</option>)}
          </select>
        </div></div>
        <div className="foot"><div className="r">
          <button className="ad-btn sec" onClick={onClose}>닫기</button>
          <button className="ad-btn pri" disabled={pending || sid === row.session_id} onClick={() => onSave(sid)}>옮기기</button>
        </div></div>
      </div>
    </div>
  );
}
