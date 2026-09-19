"use client";

import type { DashboardData, Pair } from "@/lib/dashboard";
import { useGrow } from "./DashboardView";

/**
 * 인재상 시각화 — 같은 어휘가 Heritage(지켜온 모습)와 Future(나아갈 모습) 중 어디에서 더 불렸는가
 *
 * 인재상은 조 단위(약 400여 건)라 형용사+명사 '조합' 순위는 1위도 2~6건 수준 — 우연에 가깝다.
 * Heritage와 Future는 같은 Pool(형용사 50·명사 50)을 쓰므로, 단어별로 양쪽 건수를 나란히 놓으면
 * "지켜온 것 → 나아갈 것"의 이동이 안정적으로 드러난다.
 *   위쪽 4줄 = Heritage 쪽으로 가장 기운 단어, 아래쪽 4줄 = Future 쪽으로 가장 기운 단어
 *   (기울기 = 각 축 안에서의 비중 차이. 건수가 너무 적은 단어는 제외)
 */
type Word = { w: string; h: number; f: number; lean: number };

function pick(words: DashboardData["hf_words"]): { heritage: Word[]; future: Word[] } {
  const H = Math.max(1, words.reduce((a, x) => a + x[1], 0)), F = Math.max(1, words.reduce((a, x) => a + x[2], 0));
  const min = H + F >= 80 ? 3 : 1; // 데이터가 쌓이면 1~2건짜리 단어는 기울기 계산에서 제외
  const all = words
    .filter(([, h, f]) => h + f >= min)
    .map(([w, h, f]) => ({ w, h, f, lean: h / H - f / F }));
  const heritage = [...all].sort((a, b) => b.lean - a.lean || b.h - a.h).filter((x) => x.lean > 0).slice(0, 4);
  const taken = new Set(heritage.map((x) => x.w));
  const future = [...all].sort((a, b) => a.lean - b.lean || b.f - a.f).filter((x) => x.lean < 0 && !taken.has(x.w)).slice(0, 4);
  return { heritage, future };
}

export function TalentShift({ words, heritage, future }: { words: DashboardData["hf_words"]; heritage: Pair[]; future: Pair[] }) {
  const on = useGrow();
  const groups = pick(words);
  const rows = [...groups.heritage, ...groups.future];
  const max = Math.max(1, ...rows.flatMap((r) => [r.h, r.f]));
  const width = (c: number) => (on ? `${(c / max) * 100}%` : 0);
  const topCombo = (xs: Pair[]) => (xs[0] && xs[0][1] >= 3 ? xs[0] : null);
  const hc = topCombo(heritage), fc = topCombo(future);

  const row = (r: Word) => (
    <div className="db-shift-row" key={r.w}>
      <span className="db-shift-side db-l"><span className="db-v">{r.h || ""}</span><span className="db-bar" style={{ width: width(r.h) }} /></span>
      <span className="db-shift-word">{r.w}</span>
      <span className="db-shift-side db-r"><span className="db-bar" style={{ width: width(r.f) }} /><span className="db-v">{r.f || ""}</span></span>
    </div>
  );

  return (
    <div className="db-shift">
      {groups.heritage.map(row)}
      {groups.heritage.length > 0 && groups.future.length > 0 && <div className="db-shift-sep"><span>지켜온 쪽 ↑</span><span>↓ 나아갈 쪽</span></div>}
      {groups.future.map(row)}
      {(hc || fc) && (
        <div className="db-flow-combos" style={{ marginTop: 12 }}>
          <span className="db-k">최다 조합</span>
          {hc && <span className="db-chip">지켜온 · {hc[0]}<b>{hc[1]}</b></span>}
          {fc && <span className="db-chip">나아갈 · {fc[0]}<b>{fc[1]}</b></span>}
        </div>
      )}
    </div>
  );
}
