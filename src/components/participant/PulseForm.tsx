"use client";

import { submitPulse } from "@/app/s/[slug]/actions";
import { useFormState } from "./storage";
import { useSubmit } from "./useSubmit";
import { SendNotice } from "./SendNotice";
import { Success } from "./Success";

// 부록 B — Pulse Check 동결 문안
const QUESTIONS: [tag: string, text: string][] = [
  ["가치체계 이해", "나는 우리 회사의 가치체계가 무엇을 의미하는지 다른 사람에게 설명할 수 있다."],
  ["가치체계 공감", "나는 이 가치체계가 현대엔지니어링이 가야 할 길이라는 데 공감한다."],
  ["팀 연결", "나는 가치체계 안에서 우리 팀이 맡고 있는 역할과 기여를 이해하고 있다."],
  ["실천 의지", "나는 가치체계와 연결된 행동 한 가지를 내 일에서 실천할 의향이 있다."],
];
const SCALE = [1, 2, 3, 4, 5, 6, 7];

type Form = { pre: (number | null)[]; now: (number | null)[]; open: string };
const EMPTY: Form = { pre: [null, null, null, null], now: [null, null, null, null], open: "" };

function Segment({
  label, kind, value, onPick,
}: { label: string; kind: "pre" | "now"; value: number | null; onPick: (n: number) => void }) {
  return (
    <div className={`pt-prow ${kind}`}>
      <span className="lb">{label}</span>
      <div className="pt-seg" role="radiogroup" aria-label={label}>
        {SCALE.map((n) => (
          <button type="button" key={n} role="radio" aria-checked={value === n}
            className={value === n ? "sel" : ""} onClick={() => onPick(n)}>{n}</button>
        ))}
      </div>
    </div>
  );
}

export function PulseForm({ slug }: { slug: string }) {
  const f = useFormState<Form>(slug, "pulse", EMPTY);
  const v = f.value;
  // R8: 수정 불가 — 완료 기록에는 응답 내용을 남기지 않는다
  const send = useSubmit(() => f.markDone(EMPTY));

  const answered = QUESTIONS.filter((_, i) => v.pre[i] && v.now[i]).length;
  const valid = answered === QUESTIONS.length && v.open.trim().length >= 10;

  const pick = (kind: "pre" | "now", i: number, n: number) =>
    f.update((cur) => ({ [kind]: cur[kind].map((x, j) => (j === i ? n : x)) }) as Partial<Form>);

  const go = () =>
    send.submit(() =>
      submitPulse(slug, {
        id: f.submissionId(),
        scores: QUESTIONS.flatMap((_, i) => [v.pre[i]!, v.now[i]!]),
        openText: v.open,
      }),
    );

  if (f.done)
    return (
      <Success title="응답이 제출되었습니다" slug={slug}>
        오늘 하루, 가치체계의 길 위를 함께 걸어주셔서 고맙습니다.<br />이제 마지막 순서로 돌아가 주세요.
      </Success>
    );

  return (
    <>
      <div className="pt-topbar">
        <a className="t" href={`/s/${slug}`}>‹ Pulse Check</a>
        <span className="pt-pcount">{answered}/4 응답</span>
      </div>
      <div className="pt-pad">
        <div className="pt-pulse-intro">
          <b className="head">아래 문항에서 &apos;가치체계&apos;는 다음 두 문장을 말합니다.</b>
          ① 정체성: 공간과 에너지를 잇는 길 위에서, 우리의 기술로 더 나은 삶을 만듭니다.<br />
          ② 미래 사업 방향: 에너지 밸류체인 진화를 이끄는 핵심 역할자.<br /><br />
          각 문항에 대해 <b>워크숍 전의 나</b>와 <b>지금의 나</b>를 각각 표시해 주세요. 응답은 익명이며 차수 단위로만 집계됩니다.
        </div>

        {QUESTIONS.map(([tag, text], i) => (
          <div className="pt-pq" key={tag}>
            <span className="tag">{tag}</span>
            <div className="q">{text}</div>
            <Segment label="워크숍 전의 나" kind="pre" value={v.pre[i]} onPick={(n) => pick("pre", i, n)} />
            <Segment label="지금의 나" kind="now" value={v.now[i]} onPick={(n) => pick("now", i, n)} />
            <div className="pt-scale-hint"><span>전혀 그렇지 않다</span><span>매우 그렇다</span></div>
          </div>
        ))}

        <div className="pt-pq last">
          <span className="tag">주관식 · 필수</span>
          <div className="q">
            오늘 워크숍에서 가장 마음에 남는 것은 무엇이고, 그래서 내 일에서 바꿔볼 한 가지는 무엇인가요?
          </div>
          <textarea className="pt-f-area" maxLength={300} style={{ minHeight: 96 }} aria-label="주관식 응답"
            placeholder="예) 우리 팀이 하는 일을 처음으로 한 문장으로 말해봤다는 게 남습니다. 그래서 후배에게 일을 줄 때 '왜'부터 말해보려 합니다."
            value={v.open} onChange={(e) => f.update({ open: e.target.value })} />
          <div className="pt-count">{v.open.length}/300</div>
        </div>
      </div>
      <div className="pt-cta-wrap">
        <SendNotice state={send.state} slug={slug} onRetry={send.retry} onDismiss={send.dismiss} />
        <button type="button" className="pt-cta" disabled={!valid || send.busy || !f.ready} onClick={go}>
          {send.busy ? <><span className="pt-spinner" />저장 중</> : "응답 제출"}
        </button>
      </div>
    </>
  );
}
