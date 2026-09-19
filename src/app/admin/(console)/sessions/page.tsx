import { SESSION_COLUMNS, adminDb, siteOrigin, type SessionRow } from "@/lib/admin";
import { SessionsTable, type Stats } from "@/components/admin/SessionsTable";

export const dynamic = "force-dynamic";

// 표시 순서: 파일럿 → 정규(번호순). 번호는 라벨일 뿐이라 숫자 아닌 값도 허용한다.
function order(a: SessionRow, b: SessionRow) {
  const key = (s: SessionRow) => {
    const n = Number(s.display_no);
    return Number.isFinite(n) ? n : -1;
  };
  return key(a) - key(b) || a.display_no.localeCompare(b.display_no, "ko", { numeric: true });
}

export default async function SessionsPage() {
  const db = await adminDb();
  const [{ data: rows }, { data: stats }, origin] = await Promise.all([
    db.from("sessions").select(SESSION_COLUMNS),
    db.from("session_stats").select("*"),
    siteOrigin(),
  ]);
  const sessions = ((rows ?? []) as SessionRow[]).sort(order);
  const statMap = Object.fromEntries(((stats ?? []) as Stats[]).map((s) => [s.session_id, s]));

  return (
    <SessionsTable sessions={sessions} stats={statMap} origin={origin} />
  );
}
