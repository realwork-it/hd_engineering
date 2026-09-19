"use client";

import type { Team, TeamPick, Word } from "@/lib/participant/types";
import { submitFinder } from "@/app/s/[slug]/actions";
import { useFormState } from "./storage";
import { useSubmit } from "./useSubmit";
import { TeamBox, useRememberedTeam } from "./TeamBox";
import { Combo } from "./Combo";
import { SendNotice } from "./SendNotice";
import { Success } from "./Success";

type Form = {
  team: TeamPick | null;
  hAdj: Word | null; hNoun: Word | null; fAdj: Word | null; fNoun: Word | null;
  whyH: string; whyF: string;
};
const EMPTY: Form = { team: null, hAdj: null, hNoun: null, fAdj: null, fNoun: null, whyH: "", whyF: "" };
const cut = (t: string) => (t.length > 52 ? t.slice(0, 52) + "…" : t);

export function FinderForm({
  slug, label, teams, adj, noun,
}: { slug: string; label: string; teams: Team[]; adj: string[]; noun: string[] }) {
  const f = useFormState<Form>(slug, "finder", EMPTY);
  const v = f.value;
  const send = useSubmit(() => f.markDone({ ...v, whyH: v.whyH.trim(), whyF: v.whyF.trim() }));
  useRememberedTeam(f.ready, v.team, (team) => f.update({ team }));

  const valid = !!v.team && !!v.hAdj && !!v.hNoun && !!v.fAdj && !!v.fNoun;
  const go = (overwrite = false) =>
    send.submit(() =>
      submitFinder(slug, {
        id: f.submissionId(), team: v.team!,
        hAdj: v.hAdj!.word, hNoun: v.hNoun!.word, fAdj: v.fAdj!.word, fNoun: v.fNoun!.word,
        whyHeritage: v.whyH, whyFuture: v.whyF, overwrite,
      }),
    );

  if (f.done) {
    const d = f.done;
    return (
      <Success
        title="저장했습니다" slug={slug} onEdit={f.edit}
        recap={
          <>
            · {d.hAdj?.word} {d.hNoun?.word}<br />· {d.fAdj?.word} {d.fNoun?.word}
            {d.whyH && <div className="why">Heritage — “{cut(d.whyH)}”</div>}
            {d.whyF && <div className="why" style={{ marginTop: 4 }}>Future — “{cut(d.whyF)}”</div>}
          </>
        }
      >
        {label} · {d.team?.name}의 인재상 키워드가 안전하게 저장되었어요.<br />
        전 차수의 키워드가 모여 우리 회사의 인재상이 됩니다.
      </Success>
    );
  }

  return (
    <>
      <div className="pt-pad">
        <div className="pt-h-lead">이 길을 걷는 회사에는<br />어떤 사람이 필요한가요</div>
        <div className="pt-h-sub">
          조에서 종이에 작성한 키워드를 그대로 옮겨주세요. 조에서 1명이 대표로 올리면 됩니다.
        </div>

        <div className="pt-fgroup">
          <label className="pt-f-label">소속 팀</label>
          <TeamBox teams={teams} value={v.team} onChange={(team) => f.update({ team })} />
        </div>

        <div className="pt-sec-head">
          <span className="sq" /><span className="t">Heritage 키워드</span>
          <span className="s">우리 주위의 우수 인재 모습 · 형용사 + 명사</span>
        </div>
        <div className="pt-pair-row">
          <Combo pool={adj} placeholder="형용사" value={v.hAdj} onChange={(hAdj) => f.update({ hAdj })} align="left" />
          <span className="pt-pair-x">+</span>
          <Combo pool={noun} placeholder="명사" value={v.hNoun} onChange={(hNoun) => f.update({ hNoun })} align="right" />
        </div>
        <div className="pt-fgroup" style={{ marginTop: 8 }}>
          <label className="pt-f-label" htmlFor="why-h">선정 이유</label>
          <textarea id="why-h" className="pt-f-area" maxLength={300} style={{ minHeight: 84 }}
            placeholder="예) 한 번의 실수가 큰 사고로 이어질 수 있는 일이기에, 끝까지 확인하는 집요함이 우리를 지켜왔습니다"
            value={v.whyH} onChange={(e) => f.update({ whyH: e.target.value })} />
          <div className="pt-count">{v.whyH.length}/300</div>
        </div>

        <div className="pt-sec-head">
          <span className="sq" /><span className="t">Future 키워드</span>
          <span className="s">우리 비전 달성을 위해 필요한 모습 · 형용사 + 명사</span>
        </div>
        <div className="pt-pair-row">
          <Combo pool={adj} placeholder="형용사" value={v.fAdj} onChange={(fAdj) => f.update({ fAdj })} align="left" />
          <span className="pt-pair-x">+</span>
          <Combo pool={noun} placeholder="명사" value={v.fNoun} onChange={(fNoun) => f.update({ fNoun })} align="right" />
        </div>
        <div className="pt-fgroup" style={{ marginTop: 8 }}>
          <label className="pt-f-label" htmlFor="why-f">선정 이유</label>
          <textarea id="why-f" className="pt-f-area" maxLength={300} style={{ minHeight: 84 }}
            placeholder="예) 에너지 전환의 길에서는 익숙한 방식 너머로 나아가는 사람이 필요합니다"
            value={v.whyF} onChange={(e) => f.update({ whyF: e.target.value })} />
          <div className="pt-count">{v.whyF.length}/300</div>
        </div>

        <div className="pt-hub-note inline">
          단어를 입력하면 인재상 Finder Pool에서 찾아드려요. Pool에 없는 단어는 그대로 입력해도 됩니다 — 점선 칩으로 표시돼요.
        </div>
      </div>
      <div className="pt-cta-wrap">
        <SendNotice
          state={send.state} slug={slug}
          existsText="이미 제출된 인재상이 있습니다 — 수정하시겠어요?"
          onRetry={send.retry} onOverwrite={() => go(true)} onDismiss={send.dismiss}
        />
        <button type="button" className="pt-cta" disabled={!valid || send.busy || !f.ready} onClick={() => go()}>
          {send.busy ? <><span className="pt-spinner" />저장 중</> : "조별 인재상 저장"}
        </button>
        <div className="pt-autosave"><span className="dot" />작성 중인 내용은 이 기기에 자동 저장됩니다</div>
      </div>
    </>
  );
}
