import Link from "next/link";
import { SESSION_COLUMNS, adminDb, kakaoNotice, siteOrigin, todayKST, type SessionRow } from "@/lib/admin";
import { dateLabel, sessionLabel } from "@/lib/participant/types";
import { TodayCard } from "@/components/admin/TodayCard";
import { DashboardShare } from "@/components/admin/DashboardShare";
import { DayPicker } from "@/components/admin/DayPicker";
import { AutoRefresh } from "@/components/admin/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: PageProps<"/admin">) {
  const params = await searchParams;
  const today = todayKST();
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const isToday = date === today;

  const db = await adminDb();
  const [{ data: rows }, { data: next }, { data: token }, origin] = await Promise.all([
    db.from("sessions").select(SESSION_COLUMNS).eq("date", date).neq("status", "canceled").order("room").order("display_no"),
    db.from("sessions").select("date").gt("date", date).neq("status", "canceled").order("date").limit(1),
    db.from("app_settings").select("value").eq("key", "dashboard_token").single(),
    siteOrigin(),
  ]);
  const sessions = (rows ?? []) as SessionRow[];
  const nextDate = next?.[0]?.date as string | undefined;

  const expected = sessions.reduce((a, s) => a + (s.expected ?? 0), 0);
  const places = [...new Set(sessions.map((s) => s.location).filter(Boolean))].join(" · ");
  const missingActual = sessions.filter((s) => s.status === "done" && s.actual == null);

  return (
    <>
      <AutoRefresh seconds={15} />
      <div className="ad-mhead">
        <div>
          <h1>{isToday ? "오늘의 운영" : "운영일 미리보기"} — {dateLabel(date)}</h1>
          <div className="s">
            {sessions.length
              ? `${places || "장소 미정"} · ${sessions.length}개 차수${sessions.length > 1 ? " 병행" : ""} ${expected ? ` · 대상자 ${expected}명` : ""}${sessions.length > 1 ? " · QR은 방 이름과 색으로 구분됩니다" : ""}`
              : "이 날짜에 예정된 차수가 없습니다"}
          </div>
        </div>
        <div className="acts">
          <DayPicker date={date} today={today} />
          {sessions.length > 0 && (
            <a className="ad-btn sec" href={`/admin/sessions/d-${date}/print`} target="_blank" rel="noopener">🖨 QR 시트 인쇄</a>
          )}
        </div>
      </div>

      {missingActual.length > 0 && (
        <div className="ad-alert">
          ⚠️ <span>종료된 차수 중 <b>실참석 인원 미입력</b>: {missingActual.map((s) => sessionLabel(s.display_no)).join(", ")} — 현황판 누적 인원이 대상자 인원으로 잠정 집계됩니다.</span>
        </div>
      )}

      {sessions.length > 0 ? (
        <div className="ad-today-grid">
          {sessions.map((s) => {
            const url = `${origin}/s/${s.slug}`;
            return <TodayCard key={s.id} session={s} hubUrl={url} notice={kakaoNotice(sessionLabel(s.display_no), url)} />;
          })}
        </div>
      ) : (
        <div className="ad-card ad-empty">
          예정된 차수가 없습니다.
          {nextDate && <> 다음 운영일은 <Link href={`/admin?date=${nextDate}`} style={{ color: "var(--navy)", fontWeight: 700 }}>{dateLabel(nextDate)}</Link> 입니다.</>}
        </div>
      )}

      <div className="ad-helper" style={{ margin: "12px 0 22px" }}>
        활동 스위치는 참여자 허브의 잠금과 연동됩니다 — 모듈이 시작될 때 FT가 켜면, 참여자 화면에서 15초 안에 열립니다.
        실참석 인원은 차수 종료 시 입력해 주세요(응답률 계산의 분모가 됩니다).
      </div>

      <DashboardShare url={`${origin}/dashboard?k=${token?.value ?? ""}`} />
    </>
  );
}
