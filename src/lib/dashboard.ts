import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type Pair = [label: string, count: number];
export type DashSession = {
  no: string; date: string | null; status: string;
  place: string | null; people: number; provisional: boolean;
};
export type DashboardData = {
  sessions: DashSession[];
  people: number; teams_with_identity: number; identities: number;
  pledges: number; pledges_custom: number; finders: number;
  cloud: Pair[]; work_top: Pair[]; dna_top: Pair[];
  ranks: Pair[]; heritage: Pair[]; future: Pair[];
  pledge_flow: { adj: Pair[]; noun: Pair[]; links: [adj: string, noun: string, count: number][] };
  hf_words: [word: string, heritage: number, future: number][];
  pulse: { n: number; q: [pre: number, post: number][] };
};

// R16 분모 (SPEC §0)
export const TOTAL_SESSIONS = 40;
export const TOTAL_PEOPLE = 2659;
export const TOTAL_TEAMS = 164;

/** 뷰어 쿠키(proxy.ts가 발급)가 현재 토큰의 서명과 같거나, 로그인한 운영자이면 열람 가능 */
export async function isViewerAuthorized(): Promise<boolean> {
  const cookie = (await cookies()).get("hec_dash")?.value;
  if (!cookie) return isOperator();
  const { data } = await createServiceClient().from("app_settings").select("value").eq("key", "dashboard_token").single();
  if (typeof data?.value !== "string" || !data.value) return false;
  const expected = createHmac("sha256", process.env.DASHBOARD_TOKEN_SECRET ?? "").update(data.value).digest("hex");
  const a = Buffer.from(cookie), b = Buffer.from(expected);
  return (a.length === b.length && timingSafeEqual(a, b)) || isOperator();
}

// 콘솔 사이드바의 '현황판' 메뉴용 — 운영자는 토큰 링크 없이 바로 본다
async function isOperator(): Promise<boolean> {
  const { data } = await (await createClient()).rpc("is_admin");
  return data === true;
}

export async function getDashboardData(): Promise<DashboardData> {
  const { data, error } = await createServiceClient().rpc("dashboard_data");
  if (error) throw error;
  return data as DashboardData;
}
