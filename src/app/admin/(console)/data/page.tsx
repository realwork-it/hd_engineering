import Link from "next/link";
import { adminDb } from "@/lib/admin";
import { TABS, loadSubmissions, parseFilters, type Tab } from "@/lib/admin-data";
import { sessionLabel } from "@/lib/participant/types";
import { DataTable } from "@/components/admin/DataTable";

export const dynamic = "force-dynamic";
const PAGE = 100;

export default async function DataPage({ searchParams }: PageProps<"/admin/data">) {
  const f = parseFilters(await searchParams);
  const db = await adminDb();
  const [{ rows, total }, { data: sessions }, { data: orgRows }, counts] = await Promise.all([
    loadSubmissions(db, f.tab, f),
    db.from("sessions").select("id, display_no, date").neq("status", "canceled").order("date", { nullsFirst: false }),
    db.from("teams").select("org_name").eq("status", "active"),
    Promise.all((Object.keys(TABS) as Tab[]).map(async (t) => {
      const { count } = await db.from(TABS[t].table).select("*", { count: "exact", head: true }).eq("hidden", false);
      return [t, count ?? 0] as const;
    })),
  ]);
  const sessionOpts = (sessions ?? []).sort((a, b) => Number(a.display_no) - Number(b.display_no));
  const orgs = [...new Set((orgRows ?? []).map((o) => o.org_name))].sort((a, b) => a.localeCompare(b, "ko"));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(f.page, pages);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab: f.tab, session: f.session, org: f.org, q: f.q, hidden: f.hidden ? "1" : undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return p.toString();
  };

  return (
    <>
      <div className="ad-mhead">
        <div><h1>수집 데이터</h1><div className="s">원문 열람·수정·숨김은 여기서만 — 현황판에는 통계만 노출됩니다</div></div>
        <div className="acts">
          <a className="ad-btn pri" href={`/admin/data/export?${qs({})}`}>⬇ 엑셀 다운로드 ({rows.length.toLocaleString()}건)</a>
        </div>
      </div>

      <div className="ad-tabs">
        {counts.map(([t, n]) => (
          <Link key={t} href={`/admin/data?tab=${t}`} className={t === f.tab ? "on" : ""}>
            {TABS[t].label} <span>{n.toLocaleString()}</span>
          </Link>
        ))}
      </div>

      <form className="ad-filters" method="get" action="/admin/data">
        <input type="hidden" name="tab" value={f.tab} />
        <select name="session" defaultValue={f.session ?? ""} aria-label="차수 필터">
          <option value="">전체 차수</option>
          {sessionOpts.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s.display_no)}</option>)}
        </select>
        <select name="org" defaultValue={f.org ?? ""} aria-label="조직 필터">
          <option value="">전체 조직</option>
          {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input name="q" defaultValue={f.q ?? ""} placeholder="팀·키워드·내용 검색" />
        <label className="chk"><input type="checkbox" name="hidden" value="1" defaultChecked={f.hidden} /> 숨김 포함</label>
        <button className="ad-btn sec" type="submit">적용</button>
        {(f.session || f.org || f.q || f.hidden) && <Link className="ad-btn sm sec" href={`/admin/data?tab=${f.tab}`}>초기화</Link>}
      </form>

      <div className="ad-card" style={{ paddingTop: 14 }}>
        <DataTable tab={f.tab} rows={rows.slice((page - 1) * PAGE, page * PAGE)} sessions={sessionOpts.map((s) => ({ id: s.id, no: s.display_no }))} />
        {rows.length === 0 && <div className="ad-empty">{total === 0 ? "아직 제출된 데이터가 없습니다." : "조건에 맞는 데이터가 없습니다."}</div>}
        {pages > 1 && (
          <div className="ad-pager">
            {page > 1 && <Link href={`/admin/data?${qs({ page: String(page - 1) })}`}>‹ 이전</Link>}
            <span>{page} / {pages} 쪽 · 전체 {rows.length.toLocaleString()}건</span>
            {page < pages && <Link href={`/admin/data?${qs({ page: String(page + 1) })}`}>다음 ›</Link>}
          </div>
        )}
        <div className="ad-helper">
          {f.tab === "identity" && "복수 제출 팀은 두 문장을 모두 보존합니다 — 게시용 카드 제작 시 어느 본을 쓸지 고객사와 협의 후 대표본을 지정하세요."}
          {f.tab === "finder" && "점선 칩 = Pool 밖 직접 입력. 자주 등장하는 Pool 밖 단어는 인재상 Pool 보완 후보입니다."}
          {f.tab === "pledge" && "개인다짐은 익명(팀만 기록)입니다. 현황판에는 키워드 집계만 노출됩니다."}
        </div>
      </div>
    </>
  );
}
