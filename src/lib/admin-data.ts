import "server-only";
import ExcelJS from "exceljs";
import { identitySentence } from "@/lib/josa";
import { adminDb } from "@/lib/admin";

export type Tab = "identity" | "finder" | "pledge";
export const TABS: Record<Tab, { table: string; label: string }> = {
  identity: { table: "team_identities", label: "팀 정체성" },
  finder: { table: "finder_submissions", label: "인재상" },
  pledge: { table: "pledges", label: "개인다짐" },
};

export type Submission = {
  id: string; tab: Tab; hidden: boolean; created_at: string; updated_at: string;
  session_id: string; session_no: string;
  team_id: string | null; team_name: string; team_pending: boolean; org: string; sil: string;
  /** 같은 팀이 제출한 다른 차수 번호들 (R5 복수 제출 플래그) */
  multi: string[];
  f: Record<string, string | boolean | null>;
};

export type Filters = { session?: string; org?: string; q?: string; hidden?: boolean };

type Db = Awaited<ReturnType<typeof adminDb>>;

/** PostgREST는 요청당 1,000행 제한 → 끝까지 이어 받는다 */
export async function fetchAll<T>(db: Db, table: string, select: string, order = "created_at"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).order(order, { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

const FIELDS: Record<Tab, string> = {
  identity: "work, dna, goal",
  finder: "h_adj, h_adj_custom, h_noun, h_noun_custom, f_adj, f_adj_custom, f_noun, f_noun_custom, why_heritage, why_future",
  pledge: "adj, adj_custom, noun, noun_custom, action",
};

type Raw = Record<string, unknown> & {
  id: string; hidden: boolean; created_at: string; updated_at: string; session_id: string; team_id: string | null;
  team_name_raw: string | null;
  sessions: { display_no: string } | null;
  teams: { name: string; org_name: string; sil_name: string | null; status: string } | null;
};

export async function loadSubmissions(db: Db, tab: Tab, filters: Filters): Promise<{ rows: Submission[]; total: number }> {
  const raw = await fetchAll<Raw>(
    db, TABS[tab].table,
    `id, hidden, created_at, updated_at, session_id, team_id, team_name_raw, ${FIELDS[tab]}, sessions(display_no), teams(name, org_name, sil_name, status)`,
  );

  // 복수 제출: 숨기지 않은 제출 기준으로 같은 팀이 2개 이상 차수에 있는 경우
  const byTeam = new Map<string, Set<string>>();
  if (tab === "identity")
    for (const r of raw)
      if (r.team_id && !r.hidden) (byTeam.get(r.team_id) ?? byTeam.set(r.team_id, new Set()).get(r.team_id)!).add(r.sessions?.display_no ?? "?");

  const fieldKeys = FIELDS[tab].split(", ");
  const all: Submission[] = raw.map((r) => ({
    id: r.id, tab, hidden: r.hidden, created_at: r.created_at, updated_at: r.updated_at,
    session_id: r.session_id, session_no: r.sessions?.display_no ?? "?",
    team_id: r.team_id, team_name: r.teams?.name ?? r.team_name_raw ?? "—", team_pending: r.teams?.status === "pending",
    org: r.teams?.org_name ?? "", sil: r.teams?.sil_name ?? "",
    multi: r.team_id && (byTeam.get(r.team_id)?.size ?? 0) > 1
      ? [...byTeam.get(r.team_id)!].filter((n) => n !== r.sessions?.display_no) : [],
    f: Object.fromEntries(fieldKeys.map((k) => [k, (r[k] ?? null) as string | boolean | null])),
  }));

  const q = filters.q?.trim().toLowerCase();
  const rows = all.filter((r) =>
    (filters.hidden || !r.hidden) &&
    (!filters.session || r.session_id === filters.session) &&
    (!filters.org || r.org === filters.org) &&
    (!q || [r.team_name, r.org, r.sil, ...Object.values(r.f).filter((v) => typeof v === "string")].join(" ").toLowerCase().includes(q)),
  );
  return { rows, total: all.filter((r) => !r.hidden).length };
}

export function parseFilters(params: Record<string, string | string[] | undefined>): Filters & { tab: Tab; page: number } {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const tab = one("tab");
  return {
    tab: tab === "finder" || tab === "pledge" ? tab : "identity",
    session: one("session") || undefined, org: one("org") || undefined, q: one("q") || undefined,
    hidden: one("hidden") === "1", page: Math.max(1, Number(one("page")) || 1),
  };
}

const kst = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

/** 현재 필터 기준 엑셀 (전 컬럼 + 조직·실 조인) */
export async function submissionsWorkbook(tab: Tab, rows: Submission[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(TABS[tab].label);
  const common = [
    { header: "차수", key: "session_no", width: 8 }, { header: "팀", key: "team_name", width: 26 },
    { header: "조직", key: "org", width: 18 }, { header: "실", key: "sil", width: 20 },
  ];
  const tail = [
    { header: "미등록 팀", key: "pending", width: 10 }, { header: "숨김", key: "hidden", width: 8 },
    { header: "제출 시각", key: "created", width: 20 }, { header: "수정 시각", key: "updated", width: 20 }, { header: "ID", key: "id", width: 38 },
  ];
  const specific = {
    identity: [
      { header: "고유업", key: "work", width: 30 }, { header: "고유성", key: "dna", width: 30 }, { header: "지향점", key: "goal", width: 30 },
      { header: "완성 문장", key: "sentence", width: 80 }, { header: "복수 제출(다른 차수)", key: "multi", width: 18 },
    ],
    finder: [
      { header: "Heritage 형용사", key: "h_adj", width: 18 }, { header: "H형 Pool외", key: "h_adj_custom", width: 10 },
      { header: "Heritage 명사", key: "h_noun", width: 16 }, { header: "H명 Pool외", key: "h_noun_custom", width: 10 },
      { header: "Future 형용사", key: "f_adj", width: 18 }, { header: "F형 Pool외", key: "f_adj_custom", width: 10 },
      { header: "Future 명사", key: "f_noun", width: 16 }, { header: "F명 Pool외", key: "f_noun_custom", width: 10 },
      { header: "Heritage 선정 이유", key: "why_heritage", width: 60 }, { header: "Future 선정 이유", key: "why_future", width: 60 },
    ],
    pledge: [
      { header: "형용사", key: "adj", width: 18 }, { header: "형 Pool외", key: "adj_custom", width: 10 },
      { header: "명사", key: "noun", width: 16 }, { header: "명 Pool외", key: "noun_custom", width: 10 },
      { header: "실천 내용", key: "action", width: 60 },
    ],
  }[tab];
  ws.columns = [...common, ...specific, ...tail];
  const yn = (v: unknown) => (v === true ? "Y" : v === false ? "" : v);
  for (const r of rows)
    ws.addRow({
      ...Object.fromEntries(Object.entries(r.f).map(([k, v]) => [k, yn(v)])),
      session_no: r.session_no, team_name: r.team_name, org: r.org, sil: r.sil,
      sentence: tab === "identity" ? identitySentence(String(r.f.work), String(r.f.dna), String(r.f.goal)) : undefined,
      multi: r.multi.join(", "), pending: r.team_pending ? "Y" : "", hidden: r.hidden ? "Y" : "",
      created: kst(r.created_at), updated: kst(r.updated_at), id: r.id,
    });
  styleHeader(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function styleHeader(ws: ExcelJS.Worksheet) {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2B5E" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: "top", wrapText: true }; });
}

export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // 한글 파일명: RFC 5987
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
