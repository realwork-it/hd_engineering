import "server-only";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import type { SessionStatus } from "@/lib/admin";

/**
 * 일정 엑셀 업로드 — 파일을 '차수 번호(display_no)' 기준으로 기존 차수에 맞춰 넣는다.
 *  · 파일에 있는 열만 반영한다 (열이 없으면 그 항목은 건드리지 않는다)
 *  · 빈 칸은 '모름'으로 보고 기존 값을 그대로 둔다 — FT처럼 조금씩 채워 가며 올려도 앞서 넣은 값이 지워지지 않는다.
 *    (예외: 상태가 tbd(미정)이고 날짜가 빈 칸이면 일정을 비운다. 그 밖에 값을 지우려면 콘솔의 차수 편집에서)
 *  · slug(QR·링크)는 절대 바꾸지 않는다 (R2)
 *  · 이미 진행 중·완료된 차수의 상태는 파일 값으로 되돌리지 않는다
 *  · 파일에 없는 차수는 그대로 둔다. 파일에만 있는 번호는 새 차수로 만든다
 */
export type Field = "date" | "location" | "room" | "capacity" | "expected" | "status" | "ft_name" | "note";
export type ScheduleRow = { display_no: string } & Partial<Record<Field, string | number | null>>;

const HEADERS: Record<string, Field | "display_no"> = {
  display_no: "display_no", "차수": "display_no", "차수번호": "display_no", no: "display_no",
  date: "date", "일정": "date", "날짜": "date", "일자": "date",
  location: "location", "장소": "location",
  room: "room", "강의실": "room", "방": "room",
  capacity: "capacity", "정원": "capacity",
  expected: "expected", "예상": "expected", "예상인원": "expected", "입과인원": "expected",
  status: "status", "상태": "status",
  ft: "ft_name", ft_name: "ft_name", "ft이름": "ft_name", "퍼실리테이터": "ft_name", "강사": "ft_name",
  note: "note", "메모": "note", "비고": "note",
};
const STATUS: Record<string, SessionStatus> = {
  tbd: "tbd", "미정": "tbd", confirmed: "confirmed", "확정": "confirmed", running: "running", "진행중": "running", "진행 중": "running",
  done: "done", "완료": "done", canceled: "canceled", cancelled: "canceled", "취소": "canceled",
};
export const FIELD_LABEL: Record<Field, string> = {
  date: "일정", location: "장소", room: "강의실", capacity: "정원", expected: "예상", status: "상태", ft_name: "FT", note: "메모",
};

const pad = (n: number) => String(n).padStart(2, "0");

function toDate(v: unknown): string | null | undefined {
  if (v == null || v === "") return null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`; // exceljs는 날짜 셀을 UTC 자정으로 준다
  const m = String(v).trim().match(/^(\d{4})[-./]\s?(\d{1,2})[-./]\s?(\d{1,2})\.?$/);
  if (!m) return undefined;
  const iso = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return v.result; // 수식
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
  }
  return v;
}

async function readTable(buffer: ArrayBuffer, filename: string): Promise<unknown[][]> {
  if (/\.csv$/i.test(filename)) {
    const text = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "");
    return parseCsv(text, { skip_empty_lines: true, relax_column_count: true }) as unknown[][];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
    rows.push(values);
  });
  return rows;
}

export async function parseScheduleFile(buffer: ArrayBuffer, filename: string) {
  const errors: string[] = [];
  const table = await readTable(buffer, filename);
  if (table.length < 2) return { rows: [], columns: [] as Field[], errors: ["데이터가 없습니다. 첫 줄은 열 이름, 둘째 줄부터 차수를 넣어 주세요."] };

  const keys = table[0].map((h) => HEADERS[String(h ?? "").trim().toLowerCase().replace(/\s+/g, "")] ?? HEADERS[String(h ?? "").trim()] ?? null);
  const unknown = table[0].filter((h, i) => String(h ?? "").trim() && !keys[i]).map(String);
  if (!keys.includes("display_no")) errors.push("'display_no'(또는 '차수') 열이 필요합니다.");
  const columns = [...new Set(keys.filter((k): k is Field => !!k && k !== "display_no"))];
  const hasRoomColumn = columns.includes("room");

  const rows: ScheduleRow[] = [], seen = new Set<string>();
  table.slice(1).forEach((line, idx) => {
    const n = idx + 2;
    const get = (k: string) => { const i = keys.indexOf(k as Field); return i < 0 ? undefined : line[i]; };
    const no = String(get("display_no") ?? "").trim();
    if (!no) return; // 빈 줄
    if (no.length > 10) return void errors.push(`${n}행: 차수 번호가 너무 깁니다 (${no})`);
    if (seen.has(no)) return void errors.push(`${n}행: 차수 번호 ${no}가 파일에 두 번 나옵니다`);
    seen.add(no);

    const row: ScheduleRow = { display_no: no };
    for (const f of columns) {
      const raw = get(f);
      const text = raw == null ? "" : String(raw).trim();
      if (f === "date") {
        const d = toDate(raw);
        if (d === undefined) errors.push(`${n}행(${no}차수): 날짜를 읽을 수 없습니다 — "${text}" (예: 2026-09-29)`);
        else row.date = d;
      } else if (f === "capacity" || f === "expected") {
        const num = text === "" ? null : Number(text);
        if (num !== null && (!Number.isInteger(num) || num < 0 || num > 2000)) errors.push(`${n}행(${no}차수): ${FIELD_LABEL[f]}은 0~2000 사이 숫자여야 합니다 — "${text}"`);
        else row[f] = num;
      } else if (f === "status") {
        if (text === "") continue; // 빈 상태 = 건드리지 않음
        const st = STATUS[text.toLowerCase()] ?? STATUS[text];
        if (!st) errors.push(`${n}행(${no}차수): 상태를 알 수 없습니다 — "${text}" (confirmed/tbd/canceled 또는 확정/미정/취소)`);
        else row.status = st;
      } else if (f === "location" && !hasRoomColumn) {
        // '대강의실 A' → 장소 '대강의실' + 강의실 'A' (room 열이 따로 없을 때만)
        const [loc, ...rest] = text.split(/\s+/);
        row.location = loc || null;
        row.room = rest.join(" ") || null;
      } else {
        row[f] = text === "" ? null : text.slice(0, f === "note" ? 500 : 40);
      }
    }
    rows.push(row);
  });
  if (columns.includes("location") && !hasRoomColumn) columns.push("room");
  return { rows, columns, errors, unknown };
}

export type Existing = { id: string; display_no: string; status: SessionStatus } & Record<Field, string | number | null>;
export type PlanItem = {
  display_no: string;
  kind: "new" | "change" | "same";
  changes: { field: Field; from: string; to: string }[];
  /** 진행 중·완료 차수라 파일의 상태 값을 무시했는지 */
  statusKept: boolean;
};

const STATUS_KO: Record<string, string> = { tbd: "미정", confirmed: "확정", running: "진행 중", done: "완료", canceled: "취소" };
const show = (v: unknown, f?: Field) => (v == null || v === "" ? "—" : f === "status" ? STATUS_KO[String(v)] ?? String(v) : String(v).slice(0, 40));

/** 파일 내용과 현재 DB를 비교해 무엇이 바뀌는지 계산 (미리보기·적용 공용) */
export function planSchedule(rows: ScheduleRow[], columns: Field[], existing: Existing[]) {
  // 같은 번호가 DB에 여러 개면(취소된 차수 포함) 살아 있는 차수를 우선한다
  const byNo = new Map<string, Existing>();
  for (const e of existing) {
    const cur = byNo.get(e.display_no);
    if (!cur || (cur.status === "canceled" && e.status !== "canceled")) byNo.set(e.display_no, e);
  }
  const items: (PlanItem & { id: string | null; patch: Partial<Record<Field, string | number | null>> })[] = [];
  for (const row of rows) {
    const cur = byNo.get(row.display_no);
    const patch: Partial<Record<Field, string | number | null>> = {};
    const changes: PlanItem["changes"] = [];
    let statusKept = false;
    for (const f of columns) {
      if (!(f in row)) continue;
      let next = row[f] ?? null;
      // 빈 칸 = 기존 값 유지 (새 차수는 그냥 비워 둔다). 예외: 미정(tbd)으로 돌리면서 날짜를 비운 경우
      if (next == null && cur && !(f === "date" && row.status === "tbd")) continue;
      if (f === "status" && cur && (cur.status === "running" || cur.status === "done") && next !== cur.status) {
        statusKept = true;
        continue;
      }
      const prev = cur ? (f === "date" ? (cur.date ? String(cur.date).slice(0, 10) : null) : cur[f]) : null;
      if (f === "date" && next) next = String(next).slice(0, 10);
      if (!cur || (prev ?? null) !== (next ?? null)) {
        patch[f] = next;
        if (cur || next != null) changes.push({ field: f, from: show(prev, f), to: show(next, f) });
      }
    }
    items.push({ id: cur?.id ?? null, display_no: row.display_no, kind: !cur ? "new" : changes.length ? "change" : "same", changes, statusKept, patch });
  }
  const inFile = new Set(rows.map((r) => r.display_no));
  const untouched = existing.filter((e) => e.status !== "canceled" && !inFile.has(e.display_no)).map((e) => e.display_no);
  return { items, untouched };
}
