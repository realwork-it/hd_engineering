import "./dashboard.css";
import { getDashboardData, isViewerAuthorized } from "@/lib/dashboard";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { autoCloseSessions } from "@/lib/auto-close";

export const dynamic = "force-dynamic";
export const metadata = { title: "가치체계 내재화 여정 — 실시간 현황판" };

export default async function DashboardPage() {
  if (!(await isViewerAuthorized()))
    return (
      <main className="db-root db-deny">
        <div>
          <h1>가치체계 내재화 여정</h1>
          <p>유효하지 않거나 만료된 링크입니다.<br />운영진에게 최신 현황판 링크를 요청해 주세요.</p>
        </div>
      </main>
    );
  await autoCloseSessions(); // 현황판을 여는 순간에도 지난 차수를 정리 (밤새 켜 둔 TV는 예약 작업이 처리)
  return <DashboardView initial={await getDashboardData()} />;
}
