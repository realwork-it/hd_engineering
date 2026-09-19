"use client";

import type { DashboardData, Pair } from "@/lib/dashboard";

/**
 * 다짐 시각화 — "어떤 태도로(형용사) → 무엇을(명사)"
 *
 * 형용사 50 × 명사 50 = 2,500 조합이라 조합 순위는 전체의 2~17%만 설명하고 표본이 바뀌면 순위가 뒤집힌다.
 * → 안정적인 '단어 단위' 빈도를 양쪽 기둥(막대 길이 = 건수)으로 세우고,
 *   조합은 두 기둥을 잇는 리본(굵기 = 함께 선택된 건수)으로 보여준다. 상위 3개 연결만 금색으로 강조.
 * 데이터가 적을 때는 리본이 가늘 뿐 기둥은 그대로 읽힌다.
 */
const W = 560, H = 336, PAD = 8, GAP = 7, AXIS = 22; // AXIS: 아래 축 라벨 자리
const LX = 196, RX = 364, NODE_W = 7; // 왼쪽·오른쪽 기둥 x

type Node = { w: string; c: number; y: number; h: number; used: number };

function layout(items: Pair[], scale: number): Node[] {
  let y = PAD;
  return items.map(([w, c]) => {
    const h = Math.max(3, c * scale);
    const node = { w, c, y, h, used: 0 };
    y += h + GAP;
    return node;
  });
}

export function PledgeFlow({ flow, combos, total }: { flow: DashboardData["pledge_flow"]; combos: Pair[]; total: number }) {
  const rows = Math.max(flow.adj.length, flow.noun.length, 1);
  const sum = (xs: Pair[]) => xs.reduce((a, x) => a + x[1], 0);
  const scale = (H - AXIS - PAD * 2 - GAP * (rows - 1)) / Math.max(sum(flow.adj), sum(flow.noun), 1);
  const left = layout(flow.adj, scale), right = layout(flow.noun, scale);
  const L = new Map(left.map((n) => [n.w, n])), R = new Map(right.map((n) => [n.w, n]));

  // 리본: 굵은 것부터 각 기둥 안에서 위→아래로 쌓는다
  const ribbons = flow.links
    .filter(([a, n]) => L.has(a) && R.has(n))
    .map(([a, n, c], i) => {
      const s = L.get(a)!, t = R.get(n)!, th = Math.max(1, c * scale);
      const y0 = s.y + s.used + th / 2, y1 = t.y + t.used + th / 2;
      s.used += th;
      t.used += th;
      const mx = (LX + NODE_W + RX) / 2;
      return { key: `${a}|${n}`, a, n, c, th, top: i < 3, d: `M ${LX + NODE_W} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${RX} ${y1}` };
    });

  const cover = (xs: Pair[]) => Math.round((sum(xs) / Math.max(total, 1)) * 100);
  const strong = combos.filter(([, c]) => c >= 3).slice(0, 3); // 3건 미만 조합은 우연일 수 있어 내세우지 않는다

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="db-flow" role="img" aria-label="다짐에서 자주 고른 형용사와 명사, 그리고 함께 선택된 연결">
        <defs>
          {/* userSpaceOnUse: 수평 리본은 bbox 높이가 0이라 기본(objectBoundingBox) 그라디언트가 그려지지 않는다 */}
          <linearGradient id="flowgold" gradientUnits="userSpaceOnUse" x1={LX} y1="0" x2={RX} y2="0">
            <stop offset="0" stopColor="#8A6516" /><stop offset="1" stopColor="#E3B341" />
          </linearGradient>
        </defs>
        {/* 가는 리본 먼저, 강조 리본을 위에 */}
        {[...ribbons].sort((a, b) => Number(a.top) - Number(b.top)).map((r) => (
          <path key={r.key} d={r.d} fill="none" strokeWidth={r.th}
            stroke={r.top ? "url(#flowgold)" : "#6FA8E8"} opacity={r.top ? 0.92 : 0.2}>
            <title>{`${r.a} + ${r.n} — ${r.c}건`}</title>
          </path>
        ))}
        {left.map((n, i) => (
          <g key={n.w}>
            <rect x={LX} y={n.y} width={NODE_W} height={n.h} rx="2" fill="#6FA8E8" />
            <text x={LX - 10} y={n.y + n.h / 2} dy="0.35em" textAnchor="end" className={`db-flow-w${i === 0 ? " db-first" : ""}`}>{n.w}</text>
            <text x={LX - 10} y={n.y + n.h / 2} dy="0.35em" textAnchor="end" className="db-flow-c" dx={-measure(n.w) - 8}>{n.c}</text>
          </g>
        ))}
        {right.map((n, i) => (
          <g key={n.w}>
            <rect x={RX} y={n.y} width={NODE_W} height={n.h} rx="2" fill="#E3B341" />
            <text x={RX + NODE_W + 10} y={n.y + n.h / 2} dy="0.35em" className={`db-flow-w${i === 0 ? " db-first" : ""}`}>{n.w}</text>
            <text x={RX + NODE_W + 10} y={n.y + n.h / 2} dy="0.35em" className="db-flow-c" dx={measure(n.w) + 8}>{n.c}</text>
          </g>
        ))}
        <text x={LX + NODE_W} y={H - 4} textAnchor="end" className="db-flow-axis">어떤 태도로 (형용사)</text>
        <text x={RX} y={H - 4} className="db-flow-axis">무엇을 (명사)</text>
      </svg>

      <div className="db-flow-combos">
        <span className="db-k">가장 많이 이어진 조합</span>
        {strong.length
          ? strong.map(([w, c]) => <span className="db-chip" key={w}>{w}<b>{c}</b></span>)
          : <span className="db-flow-note">아직 뚜렷하게 겹치는 조합이 없습니다 — 다짐이 그만큼 다양합니다</span>}
      </div>
      <div className="db-rank-foot">
        상위 {flow.adj.length}개 단어가 형용사 선택의 {cover(flow.adj)}% · 명사 선택의 {cover(flow.noun)}%를 차지합니다
      </div>
    </div>
  );
}

// SVG 텍스트 폭 근사 (한글 12.5px ≈ 12, 공백·영문 ≈ 6.5) — 건수 라벨을 단어 옆에 붙이기 위함
function measure(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ -~]/.test(ch) ? 6.5 : 12;
  return w;
}
