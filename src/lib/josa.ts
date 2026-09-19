// R10 조사 자동 처리 — 프로토타입 jEul / jRo / idSegs 이식
// 받침 유무로 을/를, 으로/로 선택. ㄹ받침 → 로. 한글 외 문자로 끝나면 를/로.

function jong(w: string): number | null {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return null;
  return (c - 0xac00) % 28;
}

export function jEul(w: string): "을" | "를" {
  const j = jong(w);
  return j === null || j === 0 ? "를" : "을";
}

export function jRo(w: string): "으로" | "로" {
  const j = jong(w);
  return j === null || j === 0 || j === 8 ? "로" : "으로";
}

export type Seg = { slot: string; tail: string };

// 고유업이 '는/은'으로 끝나면 "을 하는"을 생략하고 "○○ 우리는"으로 연결
export function idSegs(work: string, dna: string, goal: string): [Seg | null, Seg | null, Seg | null] {
  const w = work
    ? work.endsWith("는") || work.endsWith("은")
      ? { slot: work, tail: "우리는," }
      : { slot: `${work}${jEul(work)} 하는`, tail: "우리는," }
    : null;
  const d = dna ? { slot: `${dna}${jRo(dna)}`, tail: "일하며," } : null;
  const g = goal ? { slot: `${goal}${jEul(goal)}`, tail: "만든다." } : null;
  return [w, d, g];
}

export function identitySentence(work: string, dna: string, goal: string): string {
  return idSegs(work, dna, goal)
    .map((s) => (s ? `${s.slot} ${s.tail}` : ""))
    .join(" ")
    .trim();
}
