"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DashboardData, DashSession, Pair } from "@/lib/dashboard";
import { PromiseWords } from "./PromiseWords";
import { TalentShift } from "./TalentShift";

// R16 분모
const TOTAL_PEOPLE = 2659, TOTAL_TEAMS = 164; // 총 차수는 일정에 따라 바뀌므로 데이터에서 센다
const POLL_MS = 30_000;
const ROAD_D = "M 20 108 C 240 30, 420 138, 650 84 S 1060 26, 1280 96";
const PULSE_LABELS = ["가치체계 이해", "가치체계 공감", "팀 연결", "실천 의지"];

const two = (n: number) => String(n).padStart(2, "0");
const md = (date: string | null) => (date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : "미정");
const label = (s: DashSession) => `${s.no}차수`;

export function DashboardView({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial);
  const [denied, setDenied] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    // 서버 렌더와 시각이 달라 hydration이 어긋나지 않도록 마운트 직후에 채운다
    const first = setTimeout(() => {
      tick();
      setUpdated(new Date());
    }, 0);
    const clock = setInterval(tick, 1000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/dashboard/data", { cache: "no-store" });
        if (res.status === 401) return setDenied(true); // 토큰 재발급됨
        if (!res.ok) return;
        setData(await res.json());
        setUpdated(new Date());
      } catch {
        // 일시적 네트워크 오류 — 다음 주기에 재시도
      }
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(clock);
      clearInterval(poll);
    };
  }, []);

  const regular = data.sessions;
  const TOTAL_SESSIONS = Math.max(1, regular.length);
  const done = regular.filter((s) => s.status === "done").length;
  const running = data.sessions.filter((s) => s.status === "running");
  const pct = (n: number, total: number) => Math.min(100, Math.round((n / total) * 100));
  const responseRate = data.pulse.people ? Math.min(100, Math.round((data.pulse.n / data.pulse.people) * 100)) : null;

  if (denied)
    return (
      <main className="db-root db-deny">
        <div><h1>가치체계 내재화 여정</h1><p>링크가 만료되었습니다.<br />운영진에게 최신 현황판 링크를 요청해 주세요.</p></div>
      </main>
    );

  return (
    <div className="db-root">
      <div className="db-wrap">
        <header className="db-header">
          <div className="db-t">
            <h1>가치체계 내재화 여정</h1>
            <div className="db-s">현대엔지니어링 × REALWORK — 공간과 에너지를 잇는 길 위에서</div>
          </div>
          <div className="db-r">
            <span className="db-pill">
              {now ? `${now.getFullYear()}. ${two(now.getMonth() + 1)}. ${two(now.getDate())}  ${two(now.getHours())}:${two(now.getMinutes())}` : "—"}
            </span>
            <span className="db-pill db-live">실시간 집계 중</span>
          </div>
        </header>

        <div className="db-grid">
          <section className="db-card db-hero">
            <div className="db-hero-top">
              <div className="db-hero-title">
                <h2>{regular.length}차수의 길</h2>
                <div className="db-cap">이정표 하나가 워크숍 한 차수입니다 — 마우스를 올려보세요</div>
              </div>
              <div className="db-counters">
                <Counter value={done} suffix="차수">
                  완료 <b>{pct(done, TOTAL_SESSIONS)}%</b>{running.length > 0 && <> · 진행중 {running.map((s) => s.no).join("·")}차수</>}
                </Counter>
                <Counter value={data.people} suffix="명">
                  누적 참여 인원 <b>{pct(data.people, TOTAL_PEOPLE)}%</b> (전체 {TOTAL_PEOPLE.toLocaleString()}명)
                </Counter>
                <Counter value={data.teams_with_identity} suffix="팀">팀 정체성 (전체 {TOTAL_TEAMS}팀)</Counter>
                <Counter value={data.teams_with_promise} suffix="팀" gold>팀 실천약속 (전체 {TOTAL_TEAMS}팀)</Counter>
              </div>
            </div>
            <Road sessions={data.sessions} />
            <div className="db-roadmeta">
              <span>{md(regular[0]?.date ?? null)} 마북캠퍼스에서 출발</span>
              <span>
                {running.length > 0 ? (
                  <>지금 <b>{running.map(label).join(" · ")}</b> 진행 중{running.length === 1 && running[0].place ? ` — ${running[0].place}` : ""}
                    {running.reduce((a, s) => a + s.people, 0) > 0 && ` · ${running.reduce((a, s) => a + s.people, 0)}명`}</>
                ) : done >= TOTAL_SESSIONS ? <b>{regular.length}차수 완주</b> : "다음 차수를 준비하고 있습니다"}
              </span>
              <span>완주까지 <b>{Math.max(0, TOTAL_SESSIONS - done)}차수</b></span>
            </div>
          </section>

          <section className="db-card db-cloud-card">
            <div className="db-hd">
              <div>
                <h2>우리는 무엇을 만드는 팀인가</h2>
                <div className="db-cap">{data.identities}개 팀 정체성의 &apos;지향점&apos; 단어 — 자주 등장할수록 크게</div>
              </div>
              <span className="db-note">원문은 운영 페이지에서</span>
            </div>
            <Cloud words={data.cloud} />
            <div className="db-subslots">
              <SubSlot title="고유업에 가장 많이 쓰인 말" words={data.work_top} />
              <SubSlot title="고유성에 가장 많이 쓰인 말" words={data.dna_top} />
            </div>
          </section>

          <section className="db-card db-rank-card">
            <div className="db-hd">
              <div>
                <h2>현장으로 가져가는 약속</h2>
                <div className="db-cap">{data.teams_with_promise}개 팀의 실천약속 — 리더 · 팀원 · 팀루틴에서 자주 나온 말</div>
              </div>
            </div>
            {data.promises ? <PromiseWords words={data.promise_words} teams={data.teams_with_promise} /> : <div className="db-empty">첫 실천약속을 기다리고 있습니다</div>}
            <div className="db-rank-foot">숫자 = 그 단어를 약속에 쓴 팀 수 · 약속 원문은 운영 페이지에서</div>
          </section>

          <section className="db-card db-pulse-card">
            <div className="db-hd">
              <div>
                <h2>워크숍은 무엇을 바꿨나</h2>
                <div className="db-cap">
                  Pulse Check 4문항, 7점 척도 — 응답 {data.pulse.n.toLocaleString()}명{responseRate !== null && ` (응답률 ${responseRate}%)`}
                </div>
              </div>
              <div className="db-legend">
                <span><span className="db-sw" style={{ background: "var(--pre)" }} />워크숍 전</span>
                <span><span className="db-sw" style={{ background: "var(--gold)" }} />직후</span>
              </div>
            </div>
            {data.pulse.n ? <Dumbbell q={data.pulse.q} /> : <div className="db-empty" style={{ minHeight: 188 }}>첫 응답을 기다리고 있습니다</div>}
            <div className="db-paxis"><span>1 전혀 그렇지 않다</span><span>4</span><span>7 매우 그렇다</span></div>
            <div className="db-pulse-foot">
              회고식 사전-사후(retrospective pretest) — 응답 라벨 원문: &quot;워크숍 전의 나 / 지금의 나&quot; · 익명, 차수 단위 집계
            </div>
          </section>

          <section className="db-card db-bf-card">
            <div className="db-hd">
              <div>
                <h2>이 길에 필요한 사람</h2>
                <div className="db-cap">인재상 키워드 {data.finders * 2}건 — 같은 단어가 &apos;지켜온 모습&apos;과 &apos;나아갈 모습&apos; 중 어디에서 더 불렸나</div>
              </div>
            </div>
            <div className="db-bf-head"><span className="db-h">← 지켜온 모습 (Heritage)</span><span className="db-f">나아갈 모습 (Future) →</span></div>
            {data.finders ? <TalentShift words={data.hf_words} heritage={data.heritage} future={data.future} /> : <div className="db-empty">첫 키워드를 기다리고 있습니다</div>}
            <div className="db-bf-foot">전 차수 취합 후 인재상 도출의 원천 데이터가 됩니다</div>
          </section>
        </div>

        <footer className="db-footer">
          <span><b>REALWORK</b> Workshop Operations</span>
          <span>30초마다 자동 갱신 · 마지막 갱신 {updated ? `${two(updated.getHours())}:${two(updated.getMinutes())}:${two(updated.getSeconds())}` : "—"}</span>
        </footer>
      </div>
    </div>
  );
}

/* ---------- counters: 값이 바뀔 때마다 이전 값에서 새 값으로 ---------- */
function Counter({ value, suffix, gold, children }: { value: number; suffix: string; gold?: boolean; children: React.ReactNode }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 1300;
    const start = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (value - start) * e);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div className={`db-counter${gold ? " db-gold" : ""}`}>
      <div className="db-n">{shown.toLocaleString()}<span className="db-u">{suffix}</span></div>
      <div className="db-l">{children}</div>
    </div>
  );
}

/* ---------- journey road ---------- */
function Road({ sessions }: { sessions: DashSession[] }) {
  const pathRef = useRef<SVGPathElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ pts: { x: number; y: number }[]; len: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; s: DashSession } | null>(null);
  const n = sessions.length;

  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!path || n === 0) return;
    const L = path.getTotalLength();
    setGeo({
      len: L,
      pts: sessions.map((_, i) => {
        const p = path.getPointAtLength(L * (n > 1 ? i / (n - 1) : 0) * 0.985 + L * 0.007);
        return { x: p.x, y: p.y };
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  // 금색 구간: 마지막으로 완료·진행 중인 이정표까지
  const reach = sessions.reduce((a, s, i) => (s.status === "done" || s.status === "running" ? i : a), -1);
  const doneLen = geo && reach >= 0 ? geo.len * (n > 1 ? reach / (n - 1) : 0) * 0.985 + geo.len * 0.007 : 0;

  return (
    <div className="db-roadbox" ref={boxRef}>
      <svg viewBox="0 0 1300 150" preserveAspectRatio="none" role="img" aria-label={`${n}개 차수의 진행 경로`}>
        <defs>
          <linearGradient id="goldgrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8A6516" /><stop offset="1" stopColor="#E3B341" />
          </linearGradient>
        </defs>
        <path ref={pathRef} className="db-road-base" d={ROAD_D} />
        {geo && (
          <path className="db-road-done" d={ROAD_D}
            style={{ strokeDasharray: `${doneLen} ${geo.len}`, transition: "stroke-dasharray 1.6s cubic-bezier(.3,.6,.3,1)" }} />
        )}
        <g>
          {geo?.pts.map((p, i) => {
            const s = sessions[i];
            const st = s.status === "done" ? "done" : s.status === "running" ? "now" : "todo";
            return (
              <g key={`${s.no}-${i}`}
                onMouseMove={(e) => {
                  const box = boxRef.current!.getBoundingClientRect();
                  setTip({ x: e.clientX - box.left + 14, y: e.clientY - box.top - 14, s });
                }}
                onMouseLeave={() => setTip(null)}>
                {st === "now" && <circle cx={p.x} cy={p.y} r={9} className="db-ring" style={{ transformOrigin: `${p.x}px ${p.y}px` }} />}
                <circle cx={p.x} cy={p.y} r={st === "now" ? 7.5 : st === "done" ? 6 : 4.5}
                  className={`db-node${st === "done" ? " db-done" : st === "now" ? " db-now" : ""}`} />
                <circle cx={p.x} cy={p.y} r={13} fill="transparent" />
              </g>
            );
          })}
        </g>
      </svg>
      {tip && (
        <div className="db-tip" style={{ left: tip.x, top: tip.y, opacity: 1 }}>
          <b>{label(tip.s)}</b> · {md(tip.s.date)}
          <div className="db-d">
            {tip.s.status === "done" ? `완료${tip.s.people ? ` · ${tip.s.people}명 참여${tip.s.provisional ? "(잠정)" : ""}` : ""}`
              : tip.s.status === "running" ? `진행 중${tip.s.people ? ` · ${tip.s.people}명` : ""}` : "예정"}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- word cloud: 나선 배치 + 충돌 회피 (프로토타입 알고리즘) ---------- */
const CLOUD_COLORS = ["#E3B341", "#F2F5FB", "#8FA2C8", "#C9D6F0", "#E8762C"];
type Placed = { w: string; x: number; y: number; size: number; color: string; opacity: number };

function Cloud({ words }: { words: Pair[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const key = useMemo(() => JSON.stringify(words), [words]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const layout = () => {
      if (!words.length) return setPlaced([]);
      const W = el.clientWidth || 620, H = el.clientHeight || 296, cx = W / 2, cy = H / 2; // TV 레이아웃에서는 카드 높이에 맞춰 늘어난다
      const ctx = document.createElement("canvas").getContext("2d")!;
      const boxes: { x: number; y: number; tw: number; th: number }[] = [];
      const max = words[0][1], min = words[words.length - 1][1];
      const stretch = Math.sqrt(W / H / (620 / 296));
      const norm = (f: number) => (max === min ? 0.5 : (f - min) / (max - min));
      const out: Placed[] = [];
      words.forEach(([w, f], i) => {
        const k = Math.min(2, Math.max(1, Math.sqrt((W * H) / (620 * 296)))); // 큰 화면(TV)에서는 무대 넓이에 비례해 키운다
        const size = (16 + Math.pow(norm(f), 0.8) * 32) * k;
        ctx.font = `800 ${size}px Pretendard, sans-serif`;
        const tw = ctx.measureText(w).width + 14 * k, th = size * 1.15;
        let x = cx, y = cy, ok = false;
        for (let t = 0; t < 3000 && !ok; t++) {
          const a = 0.35 * t, r = 2.2 * k * Math.sqrt(t);
          x = cx + r * Math.cos(a) * 1.55 * stretch; // 나선의 가로·세로 비를 무대 비율에 맞춘다
          y = cy + (r * Math.sin(a) * 0.72) / stretch;
          if (x - tw / 2 < 4 || x + tw / 2 > W - 4 || y - th / 2 < 4 || y + th / 2 > H - 4) continue;
          ok = boxes.every((p) => Math.abs(p.x - x) > (p.tw + tw) / 2 || Math.abs(p.y - y) > (p.th + th) / 2);
        }
        if (!ok) return;
        boxes.push({ x, y, tw, th });
        out.push({ w, x, y, size, color: i === 0 ? CLOUD_COLORS[0] : CLOUD_COLORS[i % CLOUD_COLORS.length], opacity: i === 0 ? 1 : 0.62 + 0.38 * norm(f) });
      });
      setPlaced(out);
    };
    // 폰트가 로드된 뒤 측정해야 겹치지 않는다
    void document.fonts.ready.then(layout);
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="db-cloud-stage" ref={stage}>
      {words.length === 0 && <div className="db-empty">첫 팀 정체성을 기다리고 있습니다</div>}
      {placed.map((p) => (
        <span key={p.w} className="db-cloud-word"
          style={{ left: p.x, top: p.y, fontSize: p.size, color: p.color, opacity: p.opacity, transition: "left .8s, top .8s, font-size .8s" }}>
          {p.w}
        </span>
      ))}
    </div>
  );
}

function SubSlot({ title, words }: { title: string; words: Pair[] }) {
  return (
    <div className="db-subslot">
      <div className="db-k">{title}</div>
      <div className="db-chips">
        {words.length ? words.map(([w, c]) => <span className="db-chip" key={w}>{w}<b>{c}</b></span>) : <span className="db-chip">—</span>}
      </div>
    </div>
  );
}

/* 막대는 첫 페인트 뒤에 폭을 줘서 0 → 값으로 자란다 */
export function useGrow() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

function Dumbbell({ q }: { q: [number, number][] }) {
  const on = useGrow();
  const scale = (v: number) => ((v - 1) / 6) * 100;
  return (
    <div className="db-dumb">
      {q.map(([a, b], i) => {
        const l = scale(Math.min(a, b)), r = scale(Math.max(a, b)), d = b - a;
        return (
          <div className="db-drow" key={PULSE_LABELS[i]}>
            <span className="db-q">{PULSE_LABELS[i]}</span>
            <span className="db-track">
              <span className="db-dline" style={{ left: `${l}%`, width: on ? `${r - l}%` : 0 }} />
              <span className="db-dot db-pre" style={{ left: `${scale(a)}%` }} />
              <span className="db-dval" style={{ left: `${scale(a)}%` }}>{a.toFixed(1)}</span>
              <span className="db-dot db-post" style={{ left: `${scale(b)}%` }} />
              <span className="db-dval db-post" style={{ left: `${scale(b)}%` }}>{b.toFixed(1)}</span>
            </span>
            <span className="db-delta">{d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}
