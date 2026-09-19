import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// M3에서 시각화 5종으로 교체. 지금은 토큰 검증만 (R11: 뷰어는 통계만, 콘솔 접근 불가)
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const k = (await searchParams).k;
  const { data } = await createServiceClient().from("app_settings").select("value").eq("key", "dashboard_token").single();
  const ok = typeof k === "string" && k.length > 0 && k === data?.value;

  return (
    <main className="flex flex-1 items-center justify-center bg-dash-bg p-6 text-center text-white">
      <div>
        <h1 className="text-2xl font-extrabold">가치체계 내재화 여정</h1>
        <p className="mt-3 text-sm text-white/60">
          {ok ? "실시간 현황판을 준비하고 있습니다." : "유효하지 않은 링크입니다. 운영진에게 최신 링크를 요청해 주세요."}
        </p>
      </div>
    </main>
  );
}
