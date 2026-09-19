"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/admin";
import { TABS, type Tab } from "@/lib/admin-data";

type Result = { ok: true; message?: string } | { ok: false; message: string };
const fail = (message: string): Result => ({ ok: false, message });
const isTab = (t: string): t is Tab => t in TABS;

function refresh() {
  revalidatePath("/admin", "layout");
}

/** R14: 숨김(soft delete) · 복원 — 삭제는 없다 */
export async function setHidden(tab: string, id: string, hidden: boolean): Promise<Result> {
  if (!isTab(tab)) return fail("알 수 없는 탭입니다.");
  const db = await adminDb();
  const { error } = await db.from(TABS[tab].table).update({ hidden }).eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

/** R14: 차수 재지정 */
export async function reassignSession(tab: string, id: string, sessionId: string): Promise<Result> {
  if (!isTab(tab)) return fail("알 수 없는 탭입니다.");
  const db = await adminDb();
  const { error } = await db.from(TABS[tab].table).update({ session_id: sessionId }).eq("id", id);
  if (error)
    return fail(error.code === "23505" ? "옮기려는 차수에 이 팀의 제출이 이미 있습니다. 한쪽을 먼저 숨김 처리해 주세요." : error.message);
  refresh();
  return { ok: true };
}

const LIMITS: Record<Tab, Record<string, number>> = {
  identity: { work: 100, dna: 100, goal: 100 },
  finder: { h_adj: 30, h_noun: 30, f_adj: 30, f_noun: 30, why_heritage: 300, why_future: 300 },
  promise: { leader: 100, member: 100, routine: 100 },
};
const OPTIONAL = new Set(["why_heritage", "why_future"]);
const POOL_OF: Record<string, "pool_adj" | "pool_noun"> = {
  h_adj: "pool_adj", f_adj: "pool_adj", adj: "pool_adj", h_noun: "pool_noun", f_noun: "pool_noun", noun: "pool_noun",
};

export async function editSubmission(tab: string, id: string, input: Record<string, string>): Promise<Result> {
  if (!isTab(tab)) return fail("알 수 없는 탭입니다.");
  const patch: Record<string, string | boolean | null> = {};
  for (const [key, max] of Object.entries(LIMITS[tab])) {
    const v = (input[key] ?? "").trim();
    if (!v && !OPTIONAL.has(key)) return fail("빈 항목이 있습니다.");
    if (v.length > max) return fail(`글자 수를 확인해 주세요 (${key} ≤ ${max}자).`);
    patch[key] = v || null;
  }

  const db = await adminDb();
  // Pool 외 플래그 재계산 (R9)
  const { data: pools } = await db.from("app_settings").select("key, value").in("key", ["pool_adj", "pool_noun"]);
  for (const [key, poolKey] of Object.entries(POOL_OF))
    if (key in patch) {
      const pool = (pools?.find((p) => p.key === poolKey)?.value as string[] | undefined) ?? [];
      patch[`${key}_custom`] = !pool.includes(patch[key] as string);
    }

  if (tab === "promise") {
    const { data: cur } = await db.from("team_promises").select("leader, member, routine").eq("id", id).single();
    if (cur && (cur.leader !== patch.leader || cur.member !== patch.member || cur.routine !== patch.routine)) {
      const { error: revErr } = await db.from("team_promise_revisions").insert({ promise_id: id, ...cur });
      if (revErr) return fail(revErr.message);
    }
  }
  if (tab === "identity") {
    // 운영자 수정도 이력에 남긴다 (R5)
    const { data: cur } = await db.from("team_identities").select("work, dna, goal").eq("id", id).single();
    if (cur && (cur.work !== patch.work || cur.dna !== patch.dna || cur.goal !== patch.goal)) {
      const { error: revErr } = await db.from("team_identity_revisions").insert({ identity_id: id, ...cur });
      if (revErr) return fail(revErr.message);
    }
  }
  const { error } = await db.from(TABS[tab].table).update(patch).eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

/* ---------- 팀 명부 ---------- */
type TeamInput = { name?: string; org_name: string; sil_name: string; headcount: string };

function teamRow(input: TeamInput) {
  const org_name = input.org_name.trim();
  if (!org_name || org_name.length > 40) return null;
  const head = input.headcount.trim() === "" ? null : Number(input.headcount);
  if (head !== null && (!Number.isInteger(head) || head < 0 || head > 5000)) return null;
  return { org_name, sil_name: input.sil_name.trim().slice(0, 40) || null, headcount: head };
}

/** 미등록 큐: 명부에 추가 (pending → active) */
export async function approveTeam(id: string, input: TeamInput): Promise<Result> {
  const row = teamRow(input);
  if (!row) return fail("조직명과 인원을 확인해 주세요.");
  const db = await adminDb();
  const { error } = await db.from("teams").update({ ...row, status: "active" }).eq("id", id).eq("status", "pending");
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

/** 미등록 큐: 기존 팀에 병합 */
export async function mergeTeam(fromId: string, toId: string): Promise<Result> {
  const db = await adminDb();
  const { data, error } = await db.rpc("merge_team", { p_from: fromId, p_to: toId });
  if (error) return fail(error.message);
  refresh();
  const r = data as { moved: number; conflicts: number };
  return { ok: true, message: `제출 ${r.moved}건을 옮겼습니다${r.conflicts ? ` · 같은 차수 중복 ${r.conflicts}건은 숨김 처리` : ""}` };
}

export async function addTeam(input: TeamInput): Promise<Result> {
  const name = (input.name ?? "").trim();
  const row = teamRow(input);
  if (name.length < 2 || name.length > 60 || !row) return fail("팀 이름(2자 이상)·조직명·인원을 확인해 주세요.");
  const db = await adminDb();
  const { error } = await db.from("teams").insert({ name, ...row, status: "active" });
  if (error) return fail(error.code === "23505" ? "같은 이름의 팀이 이미 있습니다." : error.message);
  refresh();
  return { ok: true };
}
