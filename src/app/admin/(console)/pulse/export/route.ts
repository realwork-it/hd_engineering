import ExcelJS from "exceljs";
import { todayKST } from "@/lib/admin";
import { styleHeader, xlsxResponse } from "@/lib/admin-data";
import { loadPulse } from "@/lib/admin-pulse";

// 주관식 목록 엑셀 (차수·검색 필터 반영) + 차수별 요약 시트. Pulse에는 식별자가 없다(R8).
export async function GET(request: Request) {
  let p;
  try {
    p = await loadPulse();
  } catch {
    return new Response("forbidden", { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const session = params.get("session") ?? "", q = (params.get("q") ?? "").trim().toLowerCase();
  const texts = p.texts.filter((t) => (!session || t.session_id === session) && (!q || t.text.toLowerCase().includes(q)));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("주관식");
  ws.columns = [
    { header: "차수", key: "no", width: 8 }, { header: "응답", key: "text", width: 100 },
    { header: "소감 코드", key: "c1", width: 16 }, { header: "1 Change 코드", key: "c2", width: 16 },
    { header: "제출 시각", key: "at", width: 20 },
  ];
  for (const t of texts)
    ws.addRow({ no: t.session_no, text: t.text, at: new Date(t.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) });
  styleHeader(ws);

  const sum = wb.addWorksheet("차수별 요약");
  sum.columns = [
    { header: "차수", key: "no", width: 8 }, { header: "일정", key: "date", width: 12 }, { header: "장소", key: "place", width: 16 },
    { header: "FT", key: "ft", width: 12 }, { header: "인원", key: "people", width: 8 }, { header: "응답 수", key: "n", width: 8 },
    { header: "평균 상승폭", key: "delta", width: 12 },
  ];
  for (const s of p.sessions)
    sum.addRow({ no: s.no, date: s.date?.slice(0, 10), place: s.place, ft: s.ft, people: s.people, n: s.n, delta: Number(s.delta.toFixed(2)) });
  styleHeader(sum);

  return xlsxResponse(Buffer.from(await wb.xlsx.writeBuffer()), `HEC워크숍_Pulse주관식_${todayKST()}.xlsx`);
}
