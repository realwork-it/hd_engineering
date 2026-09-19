"use client";

import type { Team, TeamPick } from "@/lib/participant/types";
import { submitPromise } from "@/app/s/[slug]/actions";
import { useFormState } from "./storage";
import { useSubmit } from "./useSubmit";
import { TeamBox, useRememberedTeam } from "./TeamBox";
import { SendNotice } from "./SendNotice";
import { Success } from "./Success";

// 팀 실천약속 — 3개 카테고리 모두 필수, 자유 문장 (팀당 1건 · 팀 정체성과 같은 재제출 규칙)
export const PROMISE_FIELDS = [
  { key: "leader", title: "리더행동", hint: "리더는 ~합니다", placeholder: "예) 리더는 결정의 배경을 먼저 설명합니다" },
  { key: "member", title: "팀원행동", hint: "팀원은 ~합니다", placeholder: "예) 팀원은 막히면 혼자 끌지 않고 바로 공유합니다" },
  { key: "routine", title: "팀루틴/구조", hint: "우리는 ~합니다", placeholder: "예) 우리는 매주 금요일 15분 회고를 합니다" },
] as const;
type Key = (typeof PROMISE_FIELDS)[number]["key"];
const MAX = 100;

type Form = { team: TeamPick | null } & Record<Key, string>;
const EMPTY: Form = { team: null, leader: "", member: "", routine: "" };

export function PromiseForm({ slug, label, teams }: { slug: string; label: string; teams: Team[] }) {
  const f = useFormState<Form>(slug, "promise", EMPTY);
  const v = f.value;
  const t: Form = { team: v.team, leader: v.leader.trim(), member: v.member.trim(), routine: v.routine.trim() };
  const send = useSubmit(() => f.markDone(t));
  useRememberedTeam(f.ready, v.team, (team) => f.update({ team }));

  const valid = !!t.team && !!t.leader && !!t.member && !!t.routine;
  const go = (overwrite = false) =>
    send.submit(() =>
      submitPromise(slug, { id: f.submissionId(), team: t.team!, leader: t.leader, member: t.member, routine: t.routine, overwrite }),
    );

  if (f.done)
    return (
      <Success
        title="저장했습니다" slug={slug} onEdit={f.edit}
        recap={<>{PROMISE_FIELDS.map((p) => <div key={p.key}>· {f.done![p.key]}</div>)}</>}
      >
        {label} · {f.done.team?.name}의 실천약속이 안전하게 저장되었어요.<br />
        약속은 현장으로 돌아가 팀과 함께 지켜 주세요.
      </Success>
    );

  return (
    <>
      <div className="pt-pad">
        <div className="pt-h-lead">우리 팀의 실천약속</div>
        <div className="pt-h-sub">
          팀에서 합의한 약속을 세 가지로 적어 주세요. 팀에서 1명이 대표로 올리면 됩니다.
        </div>

        <div className="pt-fgroup">
          <label className="pt-f-label">소속 팀</label>
          <TeamBox teams={teams} value={v.team} onChange={(team) => f.update({ team })} />
        </div>

        {PROMISE_FIELDS.map((p) => (
          <div className="pt-fgroup" key={p.key}>
            <label className="pt-f-label" htmlFor={`pr-${p.key}`}>{p.title} <span className="pt-f-help">{p.hint}</span></label>
            <textarea
              id={`pr-${p.key}`} className="pt-f-area" maxLength={MAX} style={{ minHeight: 70 }} placeholder={p.placeholder}
              value={v[p.key]} onChange={(e) => f.update({ [p.key]: e.target.value } as Partial<Form>)}
            />
            <div className="pt-count">{v[p.key].length}/{MAX}</div>
          </div>
        ))}

        <div className="pt-artifact">
          <div className="cap">우리 팀의 실천약속</div>
          <div className="sent pt-promise">
            {PROMISE_FIELDS.map((p) => (
              <div key={p.key}>
                <span className="tag">{p.title}</span>
                {t[p.key] ? <span className="slot">{t[p.key]}</span> : <span className="slot empty">{p.hint}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="pt-cta-wrap">
        <SendNotice
          state={send.state} slug={slug}
          existsText="이미 제출된 팀 실천약속이 있습니다 — 수정하시겠어요?"
          onRetry={send.retry} onOverwrite={() => go(true)} onDismiss={send.dismiss}
        />
        <button type="button" className="pt-cta" disabled={!valid || send.busy || !f.ready} onClick={() => go()}>
          {send.busy ? <><span className="pt-spinner" />저장 중</> : "팀 실천약속 저장"}
        </button>
        <div className="pt-autosave"><span className="dot" />작성 중인 내용은 이 기기에 자동 저장됩니다</div>
      </div>
    </>
  );
}
