import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

// 서비스 롤 — RLS 우회. 참여자 제출(Server Action)·현황판 집계 전용. 클라이언트 번들 금지.
export function createServiceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
