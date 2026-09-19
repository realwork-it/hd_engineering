"use client";

import { useState, useTransition } from "react";
import type { SessionRow } from "@/lib/admin";
import { HUB_CARDS, sessionLabel, type Activity, type Locks } from "@/lib/participant/types";
import { closeSession, setActual, setLock, setStatus } from "@/app/admin/(console)/actions";
import { StatusBadge, copyText, useToast } from "./ui";

const ACT_LABEL: Record<Activity, string> = {
  study: "시험공부 자료", identity: "팀 정체성", finder: "조별 인재상", pledge: "개인다짐", pulse: "Pulse Check",
};

export function TodayCard({ session: s, hubUrl, notice }: { session: SessionRow; hubUrl: string; notice: string }) {
  const { toast, node } = useToast();
  // 서버 값이 진실. 누른 직후에만 낙관적 값을 덧씌우고, 서버 반영이 끝나면 걷어낸다
  // (다른 운영자가 바꾼 토글도 15초 자동 새로고침으로 따라온다)
  const [optimistic, setOptimistic] = useState<Partial<Locks>>({});
  const locks: Locks = { ...s.locks, ...optimistic };
  const [actual, setActualText] = useState(s.actual?.toString() ?? "");
  const [pending, start] = useTransition();

  const base = s.expected ?? s.capacity;
  const rate = actual && base ? `참석률 ${Math.round((Number(actual) / base) * 100)}%` : "";

  function toggle(activity: Activity) {
    const open = !locks[activity];
    setOptimistic((o) => ({ ...o, [activity]: open }));
    start(async () => {
      const res = await setLock(s.id, activity, open);
      setOptimistic((o) => {
        const rest = { ...o };
        delete rest[activity];
        return rest;
      });
      if (!res.ok) return toast(`반영 실패: ${res.message}`);
      toast(`${ACT_LABEL[activity]} — 참여자 허브에 ${open ? "열림" : "잠금"}으로 반영되었습니다`);
    });
  }

  function saveActual() {
    const text = actual.trim();
    const n = text === "" ? null : Number(text);
    if (n === s.actual) return;
    start(async () => {
      const res = await setActual(s.id, n);
      toast(res.ok ? "실참석 인원이 저장되었습니다" : `저장 실패: ${res.message}`);
    });
  }

  const phase = (status: "running" | "done" | "confirmed", msg: string) =>
    start(async () => {
      const res = await setStatus(s.id, status);
      toast(res.ok ? msg : `변경 실패: ${res.message}`);
    });

  return (
    <div className={`ad-tcard${s.status === "running" ? " running" : ""}`}>
      <div className="top">
        <div>
          <div className="n">{sessionLabel(s.display_no)} · {[s.location, s.room].filter(Boolean).join(" ") || "장소 미정"}</div>
          <div className="d">
            {s.expected != null ? `예상 ${s.expected}명` : s.capacity != null ? `정원 ${s.capacity}명` : "인원 미정"}
            {" · "}FT {s.ft_name ?? "미정"}
          </div>
        </div>
        <StatusBadge status={s.status} />
      </div>
      <div className="body">
        <div className="ad-qr-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="ad-qr"><img src={`/admin/qr?slug=${s.slug}`} alt={`${sessionLabel(s.display_no)} 허브 QR`} /></div>
          <div className="ad-qr-meta">
            <div className="u">{hubUrl.replace(/^https?:\/\//, "")}</div>
            <div className="btns">
              <button className="ad-btn sm sec" onClick={async () => toast((await copyText(hubUrl)) ? "허브 링크가 복사되었습니다" : "복사에 실패했습니다")}>링크 복사</button>
              <button className="ad-btn sm sec" onClick={async () => toast((await copyText(notice)) ? "카톡 공지문이 복사되었습니다 — 붙여넣기만 하세요" : "복사에 실패했습니다")}>카톡 공지문</button>
              <a className="ad-btn sm sec" href={`/admin/sessions/${s.id}/print`} target="_blank" rel="noopener">🖨 시트</a>
            </div>
          </div>
        </div>

        <div className="ad-toggles">
          {HUB_CARDS.map((c) => (
            <div className="ad-tg" key={c.activity}>
              <span className="l">{c.no}. {ACT_LABEL[c.activity]}</span>
              <button
                type="button" role="switch" aria-checked={locks[c.activity]} aria-label={`${ACT_LABEL[c.activity]} 열기`}
                className={`ad-sw${locks[c.activity] ? " on" : ""}`} disabled={pending} onClick={() => toggle(c.activity)}
              />
            </div>
          ))}
        </div>

        <div className="ad-attend">
          <span className="l">실참석 인원</span>
          <input
            inputMode="numeric" placeholder="종료 시" value={actual} aria-label="실참석 인원"
            onChange={(e) => setActualText(e.target.value.replace(/\D/g, ""))}
            onBlur={saveActual} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <span className="rate">{rate}</span>
        </div>

        <div className="ad-phase">
          {s.status === "running" ? (
            <button className="ad-btn sm sec" disabled={pending}
              onClick={() => {
                if (!confirm(`${sessionLabel(s.display_no)}를 종료할까요?

열려 있는 활동이 모두 잠기고(시험공부 자료 제외) 이후 제출은 받지 않습니다.
아직 제출 중인 참여자가 없는지 확인해 주세요.`)) return;
                start(async () => {
                  const res = await closeSession(s.id);
                  toast(res.ok ? "차수를 종료하고 활동을 잠갔습니다" : `종료 실패: ${res.message}`);
                });
              }}>
              차수 종료
            </button>
          ) : s.status === "done" ? (
            <button className="ad-btn sm sec" disabled={pending} onClick={() => phase("running", "진행 중으로 되돌렸습니다")}>진행 중으로 되돌리기</button>
          ) : (
            <button className="ad-btn sm pri" disabled={pending} onClick={() => phase("running", "진행을 시작했습니다")}>진행 시작</button>
          )}
        </div>
      </div>
      {node}
    </div>
  );
}
