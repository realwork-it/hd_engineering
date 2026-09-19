import QRCode from "qrcode";
import { notFound, redirect } from "next/navigation";
import { SESSION_COLUMNS, adminDb, siteOrigin, type SessionRow } from "@/lib/admin";
import { dateLabel, sessionLabel } from "@/lib/participant/types";
import { PrintButton } from "@/components/admin/PrintButton";
import "./print.css";

export const dynamic = "force-dynamic";

// 3방 병행일 QR 혼동 방지: 강의실별 지정 색 테두리
const ROOM_COLORS: Record<string, [color: string, name: string]> = {
  A: ["#E8762C", "주황"], B: ["#1E7A3C", "초록"], C: ["#2E6FD9", "파랑"], D: ["#8E44AD", "보라"],
};
const DEFAULT_COLOR: [string, string] = ["#0F2B5E", "남색"];

/** [id] = 차수 uuid(1장) 또는 d-YYYY-MM-DD(그날 전체, 차수당 1장) */
export default async function PrintPage({ params }: PageProps<"/admin/sessions/[id]/print">) {
  const { id } = await params;
  let db;
  try {
    db = await adminDb();
  } catch {
    redirect("/admin/login");
  }

  const day = id.match(/^d-(\d{4}-\d{2}-\d{2})$/)?.[1];
  const query = db.from("sessions").select(SESSION_COLUMNS).neq("status", "canceled");
  const { data } = day
    ? await query.eq("date", day).order("room").order("display_no")
    : /^[0-9a-f-]{36}$/i.test(id) ? await query.eq("id", id) : { data: [] };
  const sessions = (data ?? []) as SessionRow[];
  if (sessions.length === 0) notFound();

  const origin = await siteOrigin();
  const sheets = await Promise.all(
    sessions.map(async (s) => ({
      s,
      url: `${origin}/s/${s.slug}`,
      svg: await QRCode.toString(`${origin}/s/${s.slug}`, { type: "svg", errorCorrectionLevel: "Q", margin: 0 }),
    })),
  );

  return (
    <div className="pr-root">
      <div className="pr-bar">
        <span>A4 세로 · 여백 &apos;없음&apos; 또는 &apos;최소&apos; · 배경 그래픽 켜기 권장 — {sheets.length}장</span>
        <PrintButton />
      </div>
      {sheets.map(({ s, url, svg }) => {
        const [color, colorName] = ROOM_COLORS[(s.room ?? "").trim().toUpperCase()] ?? DEFAULT_COLOR;
        return (
          <section className="pr-sheet" key={s.id} style={{ borderColor: color }}>
            <div className="pr-band" style={{ background: color }}>
              현대엔지니어링 가치체계 내재화 워크숍
            </div>
            <div className="pr-no">{sessionLabel(s.display_no)}</div>
            <div className="pr-where">
              {[s.location, s.room].filter(Boolean).join(" ") || "장소 미정"}
            </div>
            <div className="pr-date">{dateLabel(s.date) ?? "일정 미정"}</div>
            <div className="pr-qr" style={{ borderColor: color }} dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="pr-guide">휴대폰 카메라로 QR을 비춰 접속하세요</div>
            <div className="pr-url">{url.replace(/^https?:\/\//, "")}</div>
            <div className="pr-foot" style={{ color }}>
              ■ 이 방의 색: {colorName} — 다른 방의 QR과 섞이지 않도록 확인해 주세요
            </div>
          </section>
        );
      })}
    </div>
  );
}
