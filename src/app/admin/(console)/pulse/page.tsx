import Link from "next/link";
import { ALERT_GAP, ALERT_MIN_N, loadPulse, type PulseSession } from "@/lib/admin-pulse";
import { dateLabel, sessionLabel } from "@/lib/participant/types";

export const dynamic = "force-dynamic";
const PAGE = 50;
const sign = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`;

function Trend({ sessions, overall }: { sessions: PulseSession[]; overall: number }) {
  const W = 640, H = 230, pl = 40, pr = 16, pt = 18, pb = 30;
  const lo = Math.min(0, ...sessions.map((s) => s.delta)) - 0.2, hi = Math.max(3.5, ...sessions.map((s) => s.delta)) + 0.2;
  const x = (i: number) => pl + (W - pl - pr) * (sessions.length > 1 ? i / (sessions.length - 1) : 0.5);
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
  const grid = [0, 1, 2, 3].filter((v) => v > lo && v < hi);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="차수별 평균 상승폭 추이">
      {grid.map((v) => (
        <g key={v}>
          <line x1={pl} y1={y(v)} x2={W - pr} y2={y(v)} stroke="#EDF0F5" />
          <text x={pl - 8} y={y(v) + 4} fontSize="10" fill="#8A93A3" textAnchor="end">{sign(v)}</text>
        </g>
      ))}
      <line x1={pl} y1={y(overall)} x2={W - pr} y2={y(overall)} stroke="#C79A2A" strokeWidth="1.2" strokeDasharray="4 4" />
      <text x={W - pr} y={y(overall) - 6} fontSize="10" fill="#C79A2A" textAnchor="end">전체 평균 {sign(overall)}</text>
      {sessions.length > 1 && (
        <polyline fill="none" stroke="#0F2B5E" strokeWidth="2.5" strokeLinejoin="round" points={sessions.map((s, i) => `${x(i)},${y(s.delta)}`).join(" ")} />
      )}
      {sessions.map((s, i) => (
        <g key={s.id}>
          <circle cx={x(i)} cy={y(s.delta)} r={s.alert ? 6 : 4} fill={s.alert ? "#C0392B" : s.lowN ? "#fff" : "#0F2B5E"}
            stroke={s.lowN ? "#8A93A3" : "#fff"} strokeWidth="1.6" strokeDasharray={s.lowN ? "2 2" : undefined}>
            <title>{`${sessionLabel(s.no)} ${sign(s.delta)} (응답 ${s.n}명)`}</title>
          </circle>
          <text x={x(i)} y={H - 10} fontSize="10" fill="#8A93A3" textAnchor="middle">{s.no}</text>
          {s.alert && <text x={x(i)} y={y(s.delta) - 12} fontSize="11" fontWeight="800" fill="#C0392B" textAnchor="middle">{sign(s.delta)}</text>}
        </g>
      ))}
    </svg>
  );
}

export default async function PulsePage({ searchParams }: PageProps<"/admin/pulse">) {
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const session = one("session"), q = one("q").trim().toLowerCase(), page = Math.max(1, Number(one("page")) || 1);

  const p = await loadPulse();
  const texts = p.texts.filter((t) => (!session || t.session_id === session) && (!q || t.text.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(texts.length / PAGE));
  const cur = Math.min(page, pages);
  const qs = (over: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ session, q: one("q"), ...over })) if (v) u.set(k, v);
    return u.toString();
  };
  const alerts = p.sessions.filter((s) => s.alert);

  return (
    <>
      <div className="ad-mhead">
        <div><h1>Pulse 분석</h1><div className="s">보고용 결과와 운영 품질관리를 한 화면에서</div></div>
      </div>

      {p.n === 0 ? (
        <div className="ad-card ad-empty">아직 Pulse 응답이 없습니다.</div>
      ) : (
        <>
          <div className="ad-pulse-grid">
            <div className="ad-card">
              <div className="hd"><div><h2>차수별 평균 상승폭 추이</h2><div className="cap">4문항 평균 델타(지금의 나 − 워크숍 전의 나) — 차수별 운영 품질 비교 · &apos;평균 대비 낮음&apos; 표시는 응답 {ALERT_MIN_N}건 이상인 차수만</div></div></div>
              <div className="ad-chartbox"><Trend sessions={p.sessions} overall={p.overall} /></div>
              {alerts.map((s) => (
                <div className="ad-alert" key={s.id} style={{ marginTop: 12, marginBottom: 0 }}>
                  <span className="ad-badge flag" style={{ flexShrink: 0 }}>평균 대비 낮음</span> <span><b>{sessionLabel(s.no)}({dateLabel(s.date) ?? "일정 미정"}) 상승폭 {sign(s.delta)}</b> — 평균({sign(p.overall)}) 대비 {ALERT_GAP.toFixed(1)} 이상 낮습니다.
                    {s.place && ` ${s.place}`}{s.people ? ` · ${s.people}명` : ""}{s.ft ? ` · FT ${s.ft}` : ""}. 운영 리뷰를 권합니다.</span>
                </div>
              ))}
              {p.sessions.some((x) => x.lowN) && (
                <div className="ad-helper">
                  점선 원 = 평균은 낮지만 응답이 {ALERT_MIN_N}건 미만이라 &apos;평균 대비 낮음&apos; 표시를 보류한 차수({p.sessions.filter((x) => x.lowN).map((x) => `${sessionLabel(x.no)} ${x.n}건`).join(", ")}).
                </div>
              )}
            </div>
            <div className="ad-card">
              <div className="hd"><div><h2>문항별 결과 (누적)</h2><div className="cap">응답 {p.n.toLocaleString()}명{p.responseRate !== null && ` · 응답률 ${p.responseRate}%`}</div></div></div>
              <table>
                <thead><tr><th>문항</th><th>전 → 직후</th><th /><th>Δ</th></tr></thead>
                <tbody>
                  {p.questions.map((x) => {
                    const l = ((Math.min(x.pre, x.post) - 1) / 6) * 100, r = ((Math.max(x.pre, x.post) - 1) / 6) * 100;
                    return (
                      <tr key={x.label}>
                        <td style={{ fontWeight: 700 }}>{x.label}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{x.pre.toFixed(1)} → <b style={{ color: "var(--gold)" }}>{x.post.toFixed(1)}</b></td>
                        <td><div className="ad-mini"><span className="ln" style={{ left: `${l}%`, width: `${r - l}%` }} /><span className="p1" style={{ left: `${((x.pre - 1) / 6) * 100}%` }} /><span className="p2" style={{ left: `${((x.post - 1) / 6) * 100}%` }} /></div></td>
                        <td className={`ad-delta${x.post < x.pre ? " neg" : ""}`}>{sign(x.post - x.pre)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="ad-helper">응답 라벨 원문 &quot;워크숍 전의 나 / 지금의 나&quot; · 익명 · 차수 단위 집계 · 7점 척도</div>
            </div>
          </div>

          <div className="ad-card">
            <div className="hd">
              <div><h2>주관식 — 소감 · 1 Change</h2><div className="cap">필수 응답 {p.texts.length.toLocaleString()}건 · 카테고리 코딩은 엑셀로 내려받아 진행합니다</div></div>
              <a className="ad-btn sec sm" href={`/admin/pulse/export?${qs({})}`}>⬇ 엑셀 ({texts.length.toLocaleString()}건)</a>
            </div>
            <form className="ad-filters" method="get" action="/admin/pulse">
              <select name="session" defaultValue={session} aria-label="차수 필터">
                <option value="">전체 차수</option>
                {p.sessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s.no)} ({s.n})</option>)}
              </select>
              <input name="q" defaultValue={one("q")} placeholder="내용 검색" />
              <button className="ad-btn sec" type="submit">적용</button>
            </form>
            <table><tbody>
              {texts.slice((cur - 1) * PAGE, cur * PAGE).map((t, i) => (
                <tr key={i}><td className="sub" style={{ width: 70, whiteSpace: "nowrap" }}>{sessionLabel(t.session_no)}</td><td>{t.text}</td></tr>
              ))}
            </tbody></table>
            {texts.length === 0 && <div className="ad-empty">조건에 맞는 응답이 없습니다.</div>}
            {pages > 1 && (
              <div className="ad-pager">
                {cur > 1 && <Link href={`/admin/pulse?${qs({ page: String(cur - 1) })}`}>‹ 이전</Link>}
                <span>{cur} / {pages} 쪽</span>
                {cur < pages && <Link href={`/admin/pulse?${qs({ page: String(cur + 1) })}`}>다음 ›</Link>}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
