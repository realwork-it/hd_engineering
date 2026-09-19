import ExcelJS from "exceljs";
import { adminDb, todayKST } from "@/lib/admin";
import { styleHeader, xlsxResponse } from "@/lib/admin-data";

// 현재 차수표 내려받기 = 일정 업로드 양식. 이 파일을 고쳐서 그대로 다시 올리면 된다.
export async function GET() {
  let db;
  try {
    db = await adminDb();
  } catch {
    return new Response("forbidden", { status: 403 });
  }
  const { data } = await db.from("sessions")
    .select("display_no, date, location, room, capacity, expected, status, ft_name, note")
    .neq("status", "canceled");
  const rows = (data ?? []).sort((a, b) => (Number(a.display_no) || 0) - (Number(b.display_no) || 0) || a.display_no.localeCompare(b.display_no));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("일정");
  ws.columns = [
    { header: "display_no", key: "display_no", width: 12 }, { header: "date", key: "date", width: 14 },
    { header: "location", key: "location", width: 16 }, { header: "room", key: "room", width: 8 },
    { header: "capacity", key: "capacity", width: 10 }, { header: "expected", key: "expected", width: 10 },
    { header: "status", key: "status", width: 12 }, { header: "FT", key: "ft_name", width: 14 }, { header: "note", key: "note", width: 40 },
  ];
  for (const r of rows) ws.addRow({ ...r, date: r.date ? String(r.date).slice(0, 10) : null });
  styleHeader(ws);

  const guide = wb.addWorksheet("작성 안내");
  guide.columns = [{ header: "열", key: "c", width: 14 }, { header: "설명", key: "d", width: 90 }];
  for (const [c, d] of [
    ["display_no", "차수 번호 (필수). 이 번호로 기존 차수를 찾는다. 없는 번호는 새 차수로 추가되고 QR이 새로 발급된다."],
    ["date", "2026-09-29 형식 또는 엑셀 날짜 셀. 비우면 '미정'."],
    ["location / room", "장소와 강의실. room 열을 지우고 location에 '대강의실 A'처럼 써도 자동으로 나눈다."],
    ["capacity / expected", "정원 / 예상 인원 (숫자). 현황판 인원은 실참석 → 예상 → 정원 순으로 잠정 집계된다."],
    ["status", "confirmed(확정) · tbd(미정) · canceled(취소). 한글도 된다. 이미 진행 중·완료된 차수의 상태는 바뀌지 않는다."],
    ["FT", "진행자 이름."],
    ["", "· 파일에 있는 열만 반영된다 — 열을 지우면 그 항목은 건드리지 않는다."],
    ["", "· 빈 칸은 기존 값을 그대로 둔다(지우지 않는다). 값을 지우려면 콘솔의 차수 편집에서. 단, status가 tbd이고 date가 비어 있으면 일정을 '미정'으로 비운다."],
    ["", "· 파일에 없는 차수는 그대로 둔다. 차수 번호·일정을 바꿔도 이미 인쇄한 QR은 그대로 유효하다."],
    ["", "· 올리면 먼저 '무엇이 바뀌는지' 미리보기가 나오고, 확인을 눌러야 반영된다."],
  ]) guide.addRow({ c, d });
  styleHeader(guide);

  return xlsxResponse(Buffer.from(await wb.xlsx.writeBuffer()), `HEC워크숍_차수일정_${todayKST()}.xlsx`);
}
