"use client";

import { useState, useTransition } from "react";
import { applySchedule, previewSchedule, type Preview } from "@/app/admin/(console)/sessions/actions";
import { FIELD_LABEL_CLIENT } from "./schedule-labels";

type Ready = Extract<Preview, { ok: true }>;

/** 일정 엑셀 업로드: 파일 선택 → 변경 미리보기 → 확인 후 반영 */
export function ScheduleUpload({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [preview, setPreview] = useState<Ready | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    setPreview(null);
    setErrors([]);
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await previewSchedule(fd);
      if (res.ok) setPreview(res);
      else setErrors(res.errors);
    });
  }

  function apply() {
    if (!preview) return;
    start(async () => {
      const res = await applySchedule(preview.rows, preview.columns);
      if (res.ok) onDone(`일정을 반영했습니다 — 수정 ${res.updated}건 · 추가 ${res.created}건`);
      else setErrors([res.message]);
    });
  }

  const changed = preview?.items.filter((i) => i.kind !== "same") ?? [];
  const same = (preview?.items.length ?? 0) - changed.length;

  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label="일정 엑셀 업로드" style={{ maxWidth: 720 }}>
        <h2>일정 엑셀 업로드</h2>
        <div className="cap">
          차수 번호(display_no)를 기준으로 기존 차수에 맞춰 넣습니다. 파일에 있는 열만 반영되고 <b>빈 칸은 기존 값을 그대로 둡니다</b>. QR·링크는 바뀌지 않습니다.
        </div>

        <input type="file" accept=".xlsx,.csv" disabled={pending} onChange={(e) => pick(e.target.files?.[0])} aria-label="일정 파일 선택" />
        <div className="ad-helper">읽는 열: display_no(차수) · date(일정) · location(장소) · room(강의실) · expected(대상자 인원) · status(상태) · FT · note(메모)</div>

        {pending && !preview && <div className="ad-helper">파일을 읽는 중…</div>}
        {errors.length > 0 && (
          <div className="ad-alert" style={{ marginTop: 14, marginBottom: 0, display: "block" }}>
            <b>반영하지 않았습니다.</b> 아래를 고쳐서 다시 올려 주세요.
            <ul style={{ margin: "6px 0 0 18px" }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        {preview && (
          <>
            <div style={{ margin: "16px 0 8px", fontSize: 13.5, fontWeight: 800 }}>
              변경 {changed.filter((i) => i.kind === "change").length}건 · 신규 {changed.filter((i) => i.kind === "new").length}건 · 그대로 {same}건
            </div>
            {preview.unknown.length > 0 && <div className="ad-helper" style={{ marginTop: 0 }}>무시한 열: {preview.unknown.join(", ")}</div>}
            {changed.length === 0 ? (
              <div className="ad-empty" style={{ padding: 18 }}>바뀌는 내용이 없습니다 — 현재 차수표와 같습니다.</div>
            ) : (
              <div className="ad-tablewrap" style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
                <table>
                  <thead><tr><th>차수</th><th>구분</th><th>바뀌는 내용</th></tr></thead>
                  <tbody>
                    {changed.map((i) => (
                      <tr key={i.display_no}>
                        <td><b>{i.display_no}</b></td>
                        <td><span className={`ad-badge ${i.kind === "new" ? "running" : "confirmed"}`}>{i.kind === "new" ? "신규" : "변경"}</span></td>
                        <td>
                          {i.changes.map((c) => (
                            <div key={c.field}>
                              <span className="sub">{FIELD_LABEL_CLIENT[c.field]}</span>{" "}
                              {i.kind === "new" ? <b>{c.to}</b> : <>{c.from} → <b>{c.to}</b></>}
                            </div>
                          ))}
                          {i.statusKept && <div className="sub">상태는 이미 진행 중·완료라 그대로 둡니다</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.untouched.length > 0 && (
              <div className="ad-helper">파일에 없어 그대로 두는 차수: {preview.untouched.join(", ")}</div>
            )}
          </>
        )}

        <div className="foot"><div className="r">
          <button className="ad-btn sec" onClick={onClose}>닫기</button>
          <button className="ad-btn pri" disabled={pending || !preview || changed.length === 0} onClick={apply}>
            {pending && preview ? "반영 중…" : `${changed.length}건 반영`}
          </button>
        </div></div>
      </div>
    </div>
  );
}
