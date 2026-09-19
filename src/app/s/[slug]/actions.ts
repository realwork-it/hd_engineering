"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getDeviceKey } from "@/lib/participant/data";
import type { SubmitResult, TeamPick } from "@/lib/participant/types";

// 모든 검증은 서버에서 다시 한다 (SPEC §4). 잠금·중복·Pool 외 판정은 DB 함수가 처리.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID: SubmitResult = { ok: false, code: "invalid" };

function text(v: unknown, max: number, min = 1): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}
function optional(v: unknown, max: number): string | null | undefined {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  return text(v, max) ?? undefined; // undefined = 길이 초과
}
function team(v: unknown): { id: string | null; raw: string | null } | null {
  if (!v || typeof v !== "object") return null;
  const t = v as TeamPick;
  if (t.id != null) return UUID.test(t.id) ? { id: t.id, raw: null } : null;
  const raw = text(t.name, 60, 2);
  return raw ? { id: null, raw } : null;
}

async function call(fn: string, args: Record<string, unknown>): Promise<SubmitResult> {
  const { data, error } = await createServiceClient().rpc(fn, args);
  if (error) {
    console.error(`[${fn}]`, error.message);
    return { ok: false, code: "error" };
  }
  const status = (data as { status: string }).status;
  if (status === "created" || status === "updated") return { ok: true, status };
  if (status === "locked" || status === "not_found" || status === "exists") return { ok: false, code: status };
  return INVALID;
}

export async function submitIdentity(
  slug: string,
  p: { id: string; team: TeamPick; work: string; dna: string; goal: string; overwrite?: boolean },
): Promise<SubmitResult> {
  const t = team(p?.team);
  const work = text(p?.work, 100), dna = text(p?.dna, 100), goal = text(p?.goal, 100);
  if (!UUID.test(p?.id) || !t || !work || !dna || !goal) return INVALID;
  return call("submit_identity", {
    p_id: p.id, p_slug: slug, p_team_id: t.id, p_team_raw: t.raw,
    p_work: work, p_dna: dna, p_goal: goal,
    p_device_key: await getDeviceKey(), p_overwrite: p.overwrite === true,
  });
}

export async function submitFinder(
  slug: string,
  p: {
    id: string; team: TeamPick;
    hAdj: string; hNoun: string; fAdj: string; fNoun: string;
    whyHeritage: string; whyFuture: string; overwrite?: boolean;
  },
): Promise<SubmitResult> {
  const t = team(p?.team);
  const hAdj = text(p?.hAdj, 30), hNoun = text(p?.hNoun, 30), fAdj = text(p?.fAdj, 30), fNoun = text(p?.fNoun, 30);
  const whyH = optional(p?.whyHeritage, 300), whyF = optional(p?.whyFuture, 300);
  if (!UUID.test(p?.id) || !t || !hAdj || !hNoun || !fAdj || !fNoun || whyH === undefined || whyF === undefined)
    return INVALID;
  return call("submit_finder", {
    p_id: p.id, p_slug: slug, p_team_id: t.id, p_team_raw: t.raw,
    p_h_adj: hAdj, p_h_noun: hNoun, p_f_adj: fAdj, p_f_noun: fNoun,
    p_why_heritage: whyH, p_why_future: whyF,
    p_device_key: await getDeviceKey(), p_overwrite: p.overwrite === true,
  });
}

// 팀 실천약속: 3개 카테고리 모두 필수, 자유 문장(각 100자). 재제출 규칙은 팀 정체성과 같다.
export async function submitPromise(
  slug: string,
  p: { id: string; team: TeamPick; leader: string; member: string; routine: string; overwrite?: boolean },
): Promise<SubmitResult> {
  const t = team(p?.team);
  const leader = text(p?.leader, 100), member = text(p?.member, 100), routine = text(p?.routine, 100);
  if (!UUID.test(p?.id) || !t || !leader || !member || !routine) return INVALID;
  return call("submit_promise", {
    p_id: p.id, p_slug: slug, p_team_id: t.id, p_team_raw: t.raw,
    p_leader: leader, p_member: member, p_routine: routine,
    p_device_key: await getDeviceKey(), p_overwrite: p.overwrite === true,
  });
}

// R8: 팀·기기 식별자를 받지도, 넘기지도 않는다.
export async function submitPulse(
  slug: string,
  p: { id: string; scores: number[]; openText: string },
): Promise<SubmitResult> {
  const open = text(p?.openText, 300, 10);
  const scores = Array.isArray(p?.scores) ? p.scores : [];
  const valid = scores.length === 8 && scores.every((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  if (!UUID.test(p?.id) || !open || !valid) return INVALID;
  return call("submit_pulse", { p_id: p.id, p_slug: slug, p_scores: scores, p_open_text: open });
}
