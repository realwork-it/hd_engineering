import "server-only";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import type { Hub, Team } from "./types";

export const DEVICE_COOKIE = "hec_dk";

/**
 * 인스턴스 메모리 캐시 + 진행 중인 요청 합치기.
 * 150명이 동시에 허브를 열거나 15초마다 폴링해도 Supabase 호출은 TTL당 1회로 줄어든다.
 * 표시용 캐시일 뿐이다 — 제출 시 잠금 검증은 매번 DB 함수가 한다(R3).
 */
function cached<T>(ttlMs: number, load: (key: string) => Promise<T>) {
  const store = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = load(key).catch((e) => {
      store.delete(key); // 실패는 캐시하지 않는다
      throw e;
    });
    store.set(key, { at: Date.now(), value });
    if (store.size > 500) for (const [k, v] of store) if (Date.now() - v.at >= ttlMs) store.delete(k);
    return value;
  };
}

// 잠금 해제 반영 지연 = 폴링 15초 + 최대 2초
const loadHub = cached(2_000, async (slug: string): Promise<Hub | null> => {
  const { data, error } = await createServiceClient().rpc("get_session_hub", { p_slug: slug });
  if (error) throw error;
  return (data?.[0] as Hub | undefined) ?? null;
});

export async function getHub(slug: string): Promise<Hub | null> {
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(slug)) return null;
  return loadHub(slug);
}

// 팀 명부·Pool은 자주 바뀌지 않는다 → 인스턴스당 60초 캐시 (명부에 팀을 추가하면 최대 1분 뒤 자동완성에 반영)
type FormData = { teams: Team[]; adj: string[]; noun: string[] };

const loadFormData = cached(60_000, async (): Promise<FormData> => {
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
  return { teams: teams.data as Team[], adj: pool("pool_adj"), noun: pool("pool_noun") };
});

export const getFormData = () => loadFormData("all");

export async function getDeviceKey(): Promise<string | null> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
}
