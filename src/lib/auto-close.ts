import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 날짜가 지난 '진행 중' 차수를 종료한다 (DB 함수 auto_close_sessions).
 * 1차는 DB 예약 작업(pg_cron, 매일 00:05 KST)이고, 이 호출은 예약이 돌지 않았을 때를 위한 이중 안전장치다.
 * 닫을 차수가 없으면 아무 일도 하지 않으므로 자주 불러도 부담이 없다. 실패해도 화면은 계속 뜬다.
 */
export async function autoCloseSessions(): Promise<void> {
  try {
    const { error } = await createServiceClient().rpc("auto_close_sessions");
    if (error) console.error("[auto_close_sessions]", error.message);
  } catch (e) {
    console.error("[auto_close_sessions]", e);
  }
}
