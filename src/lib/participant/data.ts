import "server-only";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import type { Hub, Team } from "./types";

export const DEVICE_COOKIE = "hec_dk";

export async function getHub(slug: string): Promise<Hub | null> {
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(slug)) return null;
  const { data, error } = await createServiceClient().rpc("get_session_hub", { p_slug: slug });
  if (error) throw error;
  return (data?.[0] as Hub | undefined) ?? null;
}

// 팀 명부·Pool은 자주 바뀌지 않는다 → 인스턴스당 60초 메모
type FormData = { teams: Team[]; adj: string[]; noun: string[] };
let memo: { at: number; data: FormData } | null = null;

export async function getFormData(): Promise<FormData> {
  if (memo && Date.now() - memo.at < 60_000) return memo.data;
  const db = createServiceClient();
  const [teams, settings] = await Promise.all([
    db.from("teams").select("id, name, org_name, sil_name").eq("status", "active").order("name"),
    db.from("app_settings").select("key, value").in("key", ["pool_adj", "pool_noun"]),
  ]);
  if (teams.error) throw teams.error;
  if (settings.error) throw settings.error;
  const pool = (k: string) =>
    [...((settings.data.find((r) => r.key === k)?.value as string[] | undefined) ?? [])].sort((a, b) =>
      a.localeCompare(b, "ko"),
    ); // R9 가나다순
  const data = { teams: teams.data as Team[], adj: pool("pool_adj"), noun: pool("pool_noun") };
  memo = { at: Date.now(), data };
  return data;
}

export async function getDeviceKey(): Promise<string | null> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
}
