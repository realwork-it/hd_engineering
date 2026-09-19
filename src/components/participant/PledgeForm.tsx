"use client";

import { jEul } from "@/lib/josa";
import type { Team, TeamPick, Word } from "@/lib/participant/types";
import { submitPledge } from "@/app/s/[slug]/actions";
import { useFormState } from "./storage";
import { useSubmit } from "./useSubmit";
import { TeamBox, useRememberedTeam } from "./TeamBox";
import { Combo } from "./Combo";
import { SendNotice } from "./SendNotice";
import { Success } from "./Success";

type Form = { team: TeamPick | null; adj: Word | null; noun: Word | null; action: string };
const EMPTY: Form = { team: null, adj: null, noun: null, action: "" };

// "[형용사+명사]를 위해" — 조사는 마지막 단어의 받침으로 (R10과 같은 규칙)
// 부록 B: "[형용사+명사]를 위해, 나는 ___을 하겠습니다" — 실천 내용은 명사형으로 받고 을/를을 자동 선택
const pledgeSentence = (adj: string | undefined, noun: string | undefined, action: string) =>
  `${pairWithJosa(adj, noun)} 위해, 나는 ${action}${jEul(action)} 하겠습니다.`;

function pairWithJosa(adj?: string, noun?: string): string {
  const pair = [adj, noun].filter(Boolean).join(" ");
  return pair ? `${pair}${jEul(pair)}` : "";
}

export function PledgeForm({
  slug, teams, adj, noun,
}: { slug: string; teams: Team[]; adj: string[]; noun: string[] }) {
  const f = useFormState<Form>(slug, "pledge", EMPTY);
  const v = f.value;
  const send = useSubmit(() => f.markDone({ ...v, action: v.action.trim() }));
  useRememberedTeam(f.ready, v.team, (team) => f.update({ team }));

  const action = v.action.trim();
  const valid = !!v.team && !!v.adj && !!v.noun && !!action;
  const go = () =>
    send.submit(() =>
      submitPledge(slug, { id: f.submissionId(), team: v.team!, adj: v.adj!.word, noun: v.noun!.word, action }),
    );

  if (f.done)
    return (
      <Success
        title="저장했습니다" slug={slug} onEdit={f.edit}
        recap={<>“{pledgeSentence(f.done.adj?.word, f.done.noun?.word, f.done.action)}”</>}
      >
        당신의 다짐이 2,659명의 다짐에 더해졌어요.
      </Success>
    );

  const pair = pairWithJosa(v.adj?.word, v.noun?.word);
  return (
    <>
      <div className="pt-pad">
        <div className="pt-h-lead">나의 다짐 한 줄</div>
        <div className="pt-h-sub">이름은 남지 않아요. 소속 팀만 함께 기록됩니다.</div>

        <div className="pt-fgroup">
          <label className="pt-f-label">소속 팀</label>
          <TeamBox teams={teams} value={v.team} onChange={(team) => f.update({ team })} />
        </div>

        <div className="pt-fgroup">
          <label className="pt-f-label">내가 실행할 것 <span className="pt-f-help">형용사 + 명사</span></label>
          <div className="pt-pair-row">
            <Combo pool={adj} placeholder="형용사" value={v.adj} onChange={(a) => f.update({ adj: a })} align="left" />
            <span className="pt-pair-x">+</span>
            <Combo pool={noun} placeholder="명사" value={v.noun} onChange={(n) => f.update({ noun: n })} align="right" />
          </div>
        </div>

        <div className="pt-fgroup">
          <label className="pt-f-label" htmlFor="pl-action">실천 내용 <span className="pt-f-help">명사로 끝맺어 주세요</span></label>
          <textarea id="pl-action" className="pt-f-area" maxLength={80}
            placeholder="예) 안 될 것 같은 일도 일단 시도"
            value={v.action} onChange={(e) => f.update({ action: e.target.value })} />
          <div className="pt-count">{v.action.length}/80</div>
        </div>

        <div className="pt-artifact">
          <div className="cap">완성될 나의 다짐</div>
          <div className="sent">
            {pair ? <span className="slot">{pair}</span> : <><span className="slot empty">형용사 명사</span>를</>} 위해, 나는<br />
            {action ? <><span className="slot">{action}{jEul(action)}</span> 하겠습니다.</> : <><span className="slot empty">실천 내용</span>을 하겠습니다.</>}
          </div>
        </div>
      </div>
      <div className="pt-cta-wrap">
        <SendNotice state={send.state} slug={slug} onRetry={send.retry} onDismiss={send.dismiss} />
        <button type="button" className="pt-cta" disabled={!valid || send.busy || !f.ready} onClick={go}>
          {send.busy ? <><span className="pt-spinner" />저장 중</> : "다짐 저장"}
        </button>
        <div className="pt-autosave"><span className="dot" />작성 중인 내용은 이 기기에 자동 저장됩니다</div>
      </div>
    </>
  );
}
