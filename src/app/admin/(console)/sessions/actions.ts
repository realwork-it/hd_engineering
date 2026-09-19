"use server";

import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { adminDb } from "@/lib/admin";
import { parseScheduleFile, planSchedule, type Existing, type Field, type PlanItem, type ScheduleRow } from "@/lib/schedule-import";

const newSlug = customAlphabet("23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", 6);
const FIELDS: Field[] = ["date", "location", "room", "capacity", "expected", "status", "ft_name", "note"];
const EXISTING_COLUMNS = "id, display_no, status, date, location, room, capacity, expected, ft_name, note";

export type Preview =
  | { ok: false; errors: string[] }
  | { ok: true; rows: ScheduleRow[]; columns: Field[]; items: PlanItem[]; untouched: string[]; unknown: string[] };

/** 1단계: 파일을 읽어 무엇이 바뀌는지만 계산한다 (DB는 건드리지 않는다) */
export async function previewSchedule(formData: FormData): Promise<Preview> {
  const db = await adminDb();
  const file = formData.get("file");
  // instanceof File은 런타임(서버 액션 디코더)에 따라 어긋날 수 있어 모양으로 판정한다
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function" || file.size === 0)
    return { ok: false, errors: ["파일을 선택해 주세요."] };
  if (file.size > 900_000) return { ok: false, errors: ["파일이 너무 큽니다 (900KB 이하). 일정 시트만 남겨 저장해 주세요."] };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { ok: false, errors: ["xlsx 또는 csv 파일만 올릴 수 있습니다. (xls는 '다른 이름으로 저장 → xlsx')"] };

  let parsed;
  try {
    parsed = await parseScheduleFile(await file.arrayBuffer(), file.name);
  } catch {
    return { ok: false, errors: ["파일을 읽지 못했습니다. 엑셀에서 다시 저장한 뒤 올려 주세요."] };
  }
  if (parsed.errors.length) return { ok: false, errors: parsed.errors.slice(0, 12) };
  if (parsed.rows.length === 0) return { ok: false, errors: ["차수가 한 줄도 없습니다."] };
  if (parsed.rows.length > 200) return { ok: false, errors: ["차수가 200줄을 넘습니다. 파일을 확인해 주세요."] };

  const { data, error } = await db.from("sessions").select(EXISTING_COLUMNS);
  if (error) return { ok: false, errors: [error.message] };
  const plan = planSchedule(parsed.rows, parsed.columns, (data ?? []) as Existing[]);
  return {
    ok: true, rows: parsed.rows, columns: parsed.columns, untouched: plan.untouched, unknown: parsed.unknown ?? [],
    items: plan.items.map(({ display_no, kind, changes, statusKept }) => ({ display_no, kind, changes, statusKept })),
  };
}

/** 2단계: 반영. 미리보기 이후 DB가 바뀌었을 수 있으므로 현재 상태로 다시 계산해서 적용한다. */
export async function applySchedule(rows: ScheduleRow[], columns: Field[]): Promise<{ ok: true; created: number; updated: number } | { ok: false; message: string }> {
  const db = await adminDb();
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 200) return { ok: false, message: "반영할 내용이 없습니다." };
  const cols = (Array.isArray(columns) ? columns : []).filter((c) => FIELDS.includes(c));
  const clean: ScheduleRow[] = rows.map((r) => ({
    display_no: String(r.display_no ?? "").trim().slice(0, 10),
    ...Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c] ?? null])),
  })).filter((r) => r.display_no);

  const { data, error } = await db.from("sessions").select(EXISTING_COLUMNS);
  if (error) return { ok: false, message: error.message };
  const plan = planSchedule(clean, cols, (data ?? []) as Existing[]);

  let created = 0, updated = 0;
  for (const item of plan.items) {
    if (item.kind === "same") continue;
    if (item.id) {
      const { error: e } = await db.from("sessions").update(item.patch).eq("id", item.id);
      if (e) return { ok: false, message: `${item.display_no}차수: ${e.message} (앞의 ${created + updated}건은 반영됨)` };
      updated++;
    } else {
      const { error: e } = await db.from("sessions").insert({ status: "confirmed", ...item.patch, display_no: item.display_no, slug: newSlug() });
      if (e) return { ok: false, message: `${item.display_no}차수 추가: ${e.message} (앞의 ${created + updated}건은 반영됨)` };
      created++;
    }
  }
  revalidatePath("/admin", "layout");
  return { ok: true, created, updated };
}
