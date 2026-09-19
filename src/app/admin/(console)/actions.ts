"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { adminDb, type SessionStatus } from "@/lib/admin";
import type { Activity } from "@/lib/participant/types";

type Result = { ok: true } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });

const ACTIVITIES: Activity[] = ["study", "identity", "finder", "pledge", "pulse"];
const STATUSES: SessionStatus[] = ["tbd", "confirmed", "running", "done", "canceled"];
// 혼동 문자(0O1lI) 제외 — scripts/seed.mjs와 동일
const newSlug = customAlphabet("23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", 6);

function refresh() {
  revalidatePath("/admin", "layout");
}

/** 활동 토글 → 참여자 허브 잠금 (R3) */
export async function setLock(id: string, activity: Activity, open: boolean): Promise<Result> {
  if (!ACTIVITIES.includes(activity)) return fail("알 수 없는 활동입니다.");
  const db = await adminDb();
  const { data: cur, error: readErr } = await db.from("sessions").select("locks").eq("id", id).single();
  if (readErr || !cur) return fail("차수를 찾을 수 없습니다.");
  const { error } = await db.from("sessions").update({ locks: { ...cur.locks, [activity]: open } }).eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

/** 실참석 인원 (R13) */
export async function setActual(id: string, actual: number | null): Promise<Result> {
  if (actual !== null && (!Number.isInteger(actual) || actual < 0 || actual > 2000)) return fail("인원을 확인해 주세요.");
  const db = await adminDb();
  const { error } = await db.from("sessions").update({ actual }).eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

export async function setStatus(id: string, status: SessionStatus): Promise<Result> {
  if (!STATUSES.includes(status)) return fail("알 수 없는 상태입니다.");
  const db = await adminDb();
  const { error } = await db.from("sessions").update({ status }).eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

export type SessionInput = {
  display_no: string; date: string; location: string; room: string;
  capacity: string; expected: string; actual: string;
  ft_name: string; status: string; study_url: string; note: string;
};

/** 차수 추가(id=null)·수정. slug는 생성 시 1회 발급 후 불변 (R2). */
export async function saveSession(id: string | null, input: SessionInput): Promise<Result> {
  const str = (v: string, max: number) => v.trim().slice(0, max) || null;
  const int = (v: string) => (v.trim() === "" ? null : Number(v));

  const display_no = input.display_no.trim();
  if (!display_no || display_no.length > 10) return fail("차수 번호를 입력해 주세요.");
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return fail("날짜 형식을 확인해 주세요.");
  if (!STATUSES.includes(input.status as SessionStatus)) return fail("상태를 선택해 주세요.");
  const nums = { capacity: int(input.capacity), expected: int(input.expected), actual: int(input.actual) };
  for (const n of Object.values(nums))
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 2000)) return fail("인원은 0~2000 사이 숫자로 입력해 주세요.");
  const study_url = str(input.study_url, 500);
  if (study_url && !/^https?:\/\//.test(study_url)) return fail("학습자료 URL은 http(s)://로 시작해야 합니다.");

  const row = {
    display_no, date: input.date || null,
    location: str(input.location, 40), room: str(input.room, 20),
    ...nums, ft_name: str(input.ft_name, 40),
    status: input.status as SessionStatus, study_url, note: str(input.note, 500),
  };

  const db = await adminDb();
  const { error } = id
    ? await db.from("sessions").update(row).eq("id", id)
    : await db.from("sessions").insert({ ...row, slug: newSlug() });
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

/** 현황판 토큰 재발급 — 기존 공유 링크는 즉시 만료 */
export async function rotateDashboardToken(): Promise<Result> {
  const db = await adminDb();
  const { error } = await db
    .from("app_settings")
    .upsert({ key: "dashboard_token", value: randomBytes(24).toString("base64url") }, { onConflict: "key" });
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}
