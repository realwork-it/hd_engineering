"use client";

import { useState, useTransition } from "react";
import type { SessionRow, SessionStatus } from "@/lib/admin";
import { dateLabel, sessionLabel } from "@/lib/participant/types";
import { saveSession, type SessionInput } from "@/app/admin/(console)/actions";
import { STATUS_LABEL, StatusBadge, copyText, useToast } from "./ui";
import { ScheduleUpload } from "./ScheduleUpload";

export type Stats = {
  session_id: string; study_views: number; identities: number; finders: number; pledges: number; pulses: number;
};

const EMPTY: SessionInput = {
  display_no: "", date: "", location: "", room: "", expected: "", actual: "",
  ft_name: "", status: "confirmed", note: "",
};
const toInput = (s: SessionRow): SessionInput => ({
  display_no: s.display_no, date: s.date?.slice(0, 10) ?? "", location: s.location ?? "", room: s.room ?? "",
  expected: s.expected?.toString() ?? "", actual: s.actual?.toString() ?? "",
  ft_name: s.ft_name ?? "", status: s.status, note: s.note ?? "",
});

export function SessionsTable({
  sessions, stats, origin,
}: { sessions: SessionRow[]; stats: Record<string, Stats>; origin: string }) {
  const { toast, node } = useToast();
  const [editing, setEditing] = useState<{ id: string | null; input: SessionInput } | null>(null);
  const [linkOf, setLinkOf] = useState<SessionRow | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canceled = sessions.filter((s) => s.status === "canceled").length;
  const visible = sessions.filter((s) => showCanceled || s.status !== "canceled");

  return (
    <>
      <div className="ad-mhead">
        <div>
          <h1>차수 관리</h1>
          <div className="s">차수 번호·일정·장소는 언제든 수정할 수 있습니다 — 링크는 내부 ID로 발급되어 번호를 바꿔도 유지됩니다</div>
        </div>
        <div className="acts">
          {canceled > 0 && (
            <label style={{ fontSize: 12.5, color: "var(--sub)", display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={showCanceled} onChange={(e) => setShowCanceled(e.target.checked)} />
              취소된 차수 {canceled}건 보기
            </label>
          )}
          <button className="ad-btn sec" onClick={() => setUploading(true)}>⬆ 일정 엑셀 업로드</button>
          <button className="ad-btn pri" onClick={() => setEditing({ id: null, input: EMPTY })}>+ 차수 추가</button>
        </div>
      </div>

      <div className="ad-card" style={{ paddingTop: 14 }}>
        <div className="ad-tablewrap">
          <table>
            <thead>
              <tr><th>차수</th><th>일정</th><th>장소</th><th>대상 인원</th><th>실참석</th><th>FT</th><th>상태</th><th>조회·제출</th><th /></tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const st = stats[s.id];
                const base = s.expected;
                const hasData = st && st.study_views + st.identities + st.finders + st.pledges + st.pulses > 0;
                return (
                  <tr key={s.id} className={s.status === "canceled" ? "dim" : ""}>
                    <td><b>{s.display_no}</b></td>
                    <td className="nw">{dateLabel(s.date) ?? "미정"}</td>
                    <td className="nw">{[s.location, s.room].filter(Boolean).join(" ") || "—"}</td>
                    <td>{s.expected ?? "—"}</td>
                    <td>
                      {s.actual ?? "—"}
                      {s.actual != null && base ? <div className="sub">{Math.round((s.actual / base) * 100)}%</div> : null}
                    </td>
                    <td className="nw">{s.ft_name ?? "미정"}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>
                      {hasData ? (
                        <>
                          자료 {st.study_views} · Pulse {st.pulses}
                          <div className="sub">정체성 {st.identities} · 인재상 {st.finders} · 다짐 {st.pledges}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td>
                      <div className="ad-rowacts">
                        <button className="ad-ract" onClick={() => setEditing({ id: s.id, input: toInput(s) })}>편집</button>
                        <button className="ad-ract" onClick={() => setLinkOf(s)}>QR·링크</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ad-helper">
          전체 {sessions.length - canceled}개 차수. 참석률 = 실참석 ÷ 대상 인원.
          차수는 삭제하지 않고 &apos;취소&apos; 상태로 바꿉니다.
        </div>
      </div>

      {editing && (
        <EditModal
          id={editing.id} initial={editing.input} onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); toast(m); }}
        />
      )}
      {uploading && <ScheduleUpload onClose={() => setUploading(false)} onDone={(m) => { setUploading(false); toast(m); }} />}
      {linkOf && <LinkModal session={linkOf} url={`${origin}/s/${linkOf.slug}`} onClose={() => setLinkOf(null)} toast={toast} />}
      {node}
    </>
  );
}

function EditModal({
  id, initial, onClose, onSaved,
}: { id: string | null; initial: SessionInput; onClose: () => void; onSaved: (msg: string) => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof SessionInput) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  const save = (override?: Partial<SessionInput>) =>
    start(async () => {
      const res = await saveSession(id, { ...v, ...override });
      if (res.ok) onSaved(override?.status === "canceled" ? "차수를 취소 처리했습니다" : id ? "차수를 수정했습니다" : "차수를 추가했습니다 — 링크·QR이 발급되었습니다");
      else setError(res.message);
    });

  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label={id ? "차수 편집" : "차수 추가"}>
        <h2>{id ? "차수 편집" : "차수 추가"}</h2>
        <div className="cap">{id ? "번호·일정을 바꿔도 이미 발급된 링크와 QR은 그대로 유효합니다." : "저장하면 허브 링크와 QR이 자동 발급됩니다."}</div>
        <div className="ad-form">
          <div><label htmlFor="f-no">차수 번호 *</label><input id="f-no" value={v.display_no} onChange={set("display_no")} placeholder="예) 14" maxLength={10} /></div>
          <div>
            <label htmlFor="f-status">상태 *</label>
            <select id="f-status" value={v.status} onChange={set("status")}>
              {(Object.keys(STATUS_LABEL) as SessionStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div><label htmlFor="f-date">일정</label><input id="f-date" type="date" value={v.date} onChange={set("date")} /></div>
          <div><label htmlFor="f-ft">FT</label><input id="f-ft" value={v.ft_name} onChange={set("ft_name")} maxLength={40} /></div>
          <div><label htmlFor="f-loc">장소</label><input id="f-loc" value={v.location} onChange={set("location")} placeholder="예) 대강의실, 포럼관" maxLength={40} /></div>
          <div><label htmlFor="f-room">강의실</label><input id="f-room" value={v.room} onChange={set("room")} placeholder="예) A, B, C" maxLength={20} /></div>
          <div><label htmlFor="f-exp">대상 인원</label><input id="f-exp" inputMode="numeric" value={v.expected} onChange={set("expected")} /></div>
          <div><label htmlFor="f-act">실참석</label><input id="f-act" inputMode="numeric" value={v.actual} onChange={set("actual")} placeholder="종료 후 입력" /></div>
          <div className="full"><label htmlFor="f-note">메모</label><textarea id="f-note" value={v.note} onChange={set("note")} maxLength={500} /></div>
        </div>
        {error && <div className="ad-err" role="alert">{error}</div>}
        <div className="foot">
          {id && v.status !== "canceled" && (
            <button className="ad-btn danger" disabled={pending}
              onClick={() => confirm("이 차수를 취소 처리할까요? 데이터는 보존되며 언제든 상태를 되돌릴 수 있습니다.") && save({ status: "canceled" })}>
              차수 취소
            </button>
          )}
          <div className="r">
            <button className="ad-btn sec" onClick={onClose}>닫기</button>
            <button className="ad-btn pri" disabled={pending} onClick={() => save()}>{pending ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkModal({
  session: s, url, onClose, toast,
}: { session: SessionRow; url: string; onClose: () => void; toast: (m: string) => void }) {
  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label="QR·링크">
        <h2>{sessionLabel(s.display_no)} — QR·링크</h2>
        <div className="cap">허브 링크 1개로 5개 활동에 모두 접근합니다. 번호·일정을 바꿔도 이 링크는 바뀌지 않습니다.</div>
        <div className="ad-qrbig">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/admin/qr?slug=${s.slug}`} alt="허브 QR" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--mut)", wordBreak: "break-all", fontFamily: "ui-monospace,Consolas,monospace" }}>{url}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button className="ad-btn sm sec" onClick={async () => toast((await copyText(url)) ? "허브 링크가 복사되었습니다" : "복사에 실패했습니다")}>링크 복사</button>
              <a className="ad-btn sm sec" href={url} target="_blank" rel="noopener">참여자 화면 열기 ↗</a>
              <a className="ad-btn sm pri" href={`/admin/sessions/${s.id}/print`} target="_blank" rel="noopener">🖨 A4 인쇄 시트</a>
            </div>
          </div>
        </div>
        <div className="foot"><div className="r"><button className="ad-btn sec" onClick={onClose}>닫기</button></div></div>
      </div>
    </div>
  );
}
