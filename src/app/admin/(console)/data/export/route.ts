import { adminDb, todayKST } from "@/lib/admin";
import { TABS, loadSubmissions, parseFilters, submissionsWorkbook, xlsxResponse } from "@/lib/admin-data";

// 현재 필터 기준 엑셀 다운로드 (DoD 10) — 화면과 같은 loadSubmissions를 쓴다
export async function GET(request: Request) {
  let db;
  try {
    db = await adminDb();
  } catch {
    return new Response("forbidden", { status: 403 });
  }
  const f = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  const { rows } = await loadSubmissions(db, f.tab, f);
  return xlsxResponse(await submissionsWorkbook(f.tab, rows), `HEC워크숍_${TABS[f.tab].label}_${todayKST()}.xlsx`);
}
