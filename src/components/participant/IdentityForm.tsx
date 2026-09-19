"use client";

import { idSegs, identitySentence, type Seg } from "@/lib/josa";
import type { Team, TeamPick } from "@/lib/participant/types";
import { submitIdentity } from "@/app/s/[slug]/actions";
import { useFormState } from "./storage";
import { useSubmit } from "./useSubmit";
import { TeamBox, useRememberedTeam } from "./TeamBox";
import { SendNotice } from "./SendNotice";
import { Success } from "./Success";

type Form = { team: TeamPick | null; work: string; dna: string; goal: string };
const EMPTY: Form = { team: null, work: "", dna: "", goal: "" };

function Slot({ seg, placeholder, tail }: { seg: Seg | null; placeholder: string; tail: string }) {
  return seg ? (
    <><span className="slot">{seg.slot}</span> {seg.tail}</>
  ) : (
    <><span className="slot empty">{placeholder}</span>{tail}</>
  );
}

export function IdentityForm({ slug, label, teams }: { slug: string; label: string; teams: Team[] }) {
  const f = useFormState<Form>(slug, "identity", EMPTY);
  const v = f.value;
  const t: Form = { team: v.team, work: v.work.trim(), dna: v.dna.trim(), goal: v.goal.trim() };
  const send = useSubmit(() => f.markDone(t));
  useRememberedTeam(f.ready, v.team, (team) => f.update({ team }));

  const valid = !!t.team && !!t.work && !!t.dna && !!t.goal;
  const [ws, ds, gs] = idSegs(t.work, t.dna, t.goal);

  const go = (overwrite = false) =>
    send.submit(() =>
      submitIdentity(slug, { id: f.submissionId(), team: t.team!, work: t.work, dna: t.dna, goal: t.goal, overwrite }),
    );

  if (f.done)
    return (
      <Success
        title="저장했습니다" slug={slug} onEdit={f.edit}
        recap={<>“{identitySentence(f.done.work, f.done.dna, f.done.goal)}”</>}
      >
        {label} · {f.done.team?.name}의 정체성이 안전하게 저장되었어요.<br />
        워크숍이 끝나면 디자인된 카드로 만들어 보내드립니다.
      </Success>
    );

  return (
    <>
      <div className="pt-pad">
        <div className="pt-h-lead">우리 팀은 어떤 팀인가요</div>
        <div className="pt-h-sub">
          조에서 논의한 내용을 바탕으로, 제출은 팀 단위로 해주세요. 팀에서 1명이 대표로 올리면 됩니다.
        </div>

        <div className="pt-fgroup">
          <label className="pt-f-label">소속 팀</label>
          <TeamBox teams={teams} value={v.team} onChange={(team) => f.update({ team })} />
        </div>

        <div className="pt-fgroup">
          <label className="pt-f-label" htmlFor="id-work">고유업 <span className="pt-f-help">우리 팀은 무엇을 하는 팀인가요?</span></label>
          <input id="id-work" className="pt-f-input" maxLength={100} placeholder="예) 채용과 육성을 잇는"
            value={v.work} onChange={(e) => f.update({ work: e.target.value })} />
        </div>
        <div className="pt-fgroup">
          <label className="pt-f-label" htmlFor="id-dna">고유성 <span className="pt-f-help">우리 팀만의 일하는 DNA는 무엇인가요?</span></label>
          <input id="id-dna" className="pt-f-input" maxLength={100} placeholder="예) 끝까지 사람 편에서 생각하는 DNA"
            value={v.dna} onChange={(e) => f.update({ dna: e.target.value })} />
        </div>
        <div className="pt-fgroup">
          <label className="pt-f-label" htmlFor="id-goal">지향점 <span className="pt-f-help">그 일의 끝에서 무엇을 만드나요?</span></label>
          <input id="id-goal" className="pt-f-input" maxLength={100} placeholder="예) 그만두고 싶지 않은 회사"
            value={v.goal} onChange={(e) => f.update({ goal: e.target.value })} />
        </div>

        <div className="pt-artifact">
          <div className="cap">완성될 우리 팀의 문장</div>
          <div className="sent">
            <Slot seg={ws} placeholder="고유업" tail="을 하는 우리는," /><br />
            <Slot seg={ds} placeholder="고유성" tail="으로 일하며," /><br />
            <Slot seg={gs} placeholder="지향점" tail="을 만든다." />
          </div>
        </div>
      </div>
      <div className="pt-cta-wrap">
        <SendNotice
          state={send.state} slug={slug}
          existsText="이미 제출된 정체성이 있습니다 — 수정하시겠어요?"
          onRetry={send.retry} onOverwrite={() => go(true)} onDismiss={send.dismiss}
        />
        <button type="button" className="pt-cta" disabled={!valid || send.busy || !f.ready} onClick={() => go()}>
          {send.busy ? <><span className="pt-spinner" />저장 중</> : "팀 정체성 저장"}
        </button>
        <div className="pt-autosave"><span className="dot" />작성 중인 내용은 이 기기에 자동 저장됩니다</div>
      </div>
    </>
  );
}
