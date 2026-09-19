import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Locks } from "@/lib/participant/types";

export type SessionStatus = "tbd" | "confirmed" | "running" | "done" | "canceled";

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

/**
 * 배포 주소 — QR·링크·인쇄 시트에 쓴다.
 *  1) NEXT_PUBLIC_SITE_URL (커스텀 도메인을 쓸 때 직접 지정)
 *  2) Vercel의 프로덕션 도메인 — 운영자가 미리보기(preview) 주소로 콘솔을 열어도 QR은 실제 주소를 가리킨다.
 *     미리보기 주소는 Vercel 로그인 보호가 걸려 참여자가 열 수 없고, 배포마다 바뀐다.
 *  3) 그 밖에는 지금 접속한 주소 (로컬 개발)
 */
export async function siteOrigin(): Promise<string> {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fixed) return fixed;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
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
