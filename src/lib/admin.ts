import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Locks } from "@/lib/participant/types";

export type SessionStatus = "pilot" | "tbd" | "confirmed" | "running" | "done" | "canceled";

export type SessionRow = {
  id: string; slug: string; display_no: string; date: string | null;
  location: string | null; room: string | null;
  capacity: number | null; expected: number | null; actual: number | null;
  ft_name: string | null; status: SessionStatus; locks: Locks;
  study_url: string | null; note: string | null;
};

export const SESSION_COLUMNS =
  "id, slug, display_no, date, location, room, capacity, expected, actual, ft_name, status, locks, study_url, note";

/** 운영자 세션의 Supabase 클라이언트. 쓰기·읽기 모두 RLS(is_admin)가 최종 방어선. */
export async function adminDb() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("운영자 권한이 없습니다.");
  return supabase;
}

/** 배포 주소 — QR·링크에 쓴다. NEXT_PUBLIC_SITE_URL이 있으면 우선(커스텀 도메인 고정용). */
export async function siteOrigin(): Promise<string> {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

// 부록 C: 카톡 공지문은 운영팀 초안 대기 — 플레이스홀더 (인사말 + 허브 링크 1개)
export function kakaoNotice(label: string, url: string): string {
  return [
    "[현대엔지니어링 가치체계 내재화 워크숍]",
    `안녕하세요, ${label} 참여자 여러분 😊`,
    "오늘 워크숍의 모든 활동은 아래 링크 하나로 진행됩니다.",
    "진행자 안내에 따라 접속해 주세요.",
    "",
    `▶ ${url}`,
  ].join("\n");
}
