// 전체 데이터 로컬 백업 — Supabase 요금제와 무관하게 동작 (Free 플랜은 자동 백업이 없다)
//   npm run backup            → backups/2026-09-29_1830/ 에 테이블별 JSON + 한 권의 엑셀
// 운영일마다 종료 직후 1회 실행을 권장. backups/ 는 원문이 들어 있으므로 git에 올리지 않는다(.gitignore).
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { adminClient } from "./_client.mjs";

const TABLES = [
  "sessions", "teams", "team_identities", "team_identity_revisions",
  "finder_submissions", "team_promises", "team_promise_revisions", "pulses", "material_views", "admin_emails",
];
// app_settings에는 현황판 토큰이 있어 JSON에만 남기고 엑셀에는 넣지 않는다
const db = adminClient();

async function dump(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })
  .format(new Date()).replace(" ", "_").replace(":", "");
const dir = fileURLToPath(new URL(`../backups/${stamp}/`, import.meta.url));
mkdirSync(dir, { recursive: true });

const wb = new ExcelJS.Workbook();
const summary = [];
for (const table of [...TABLES, "app_settings"]) {
  const rows = await dump(table);
  writeFileSync(`${dir}${table}.json`, JSON.stringify(rows, null, 1), "utf8");
  // 검증: 서버가 말하는 행 수와 받은 행 수가 같아야 한다
  const { count } = await db.from(table).select("*", { count: "exact", head: true });
  if (count !== rows.length) throw new Error(`${table}: 행 수 불일치 (DB ${count} ≠ 백업 ${rows.length})`);
  summary.push([table, rows.length]);
  if (table === "app_settings" || rows.length === 0) continue;
  const ws = wb.addWorksheet(table.slice(0, 31));
  ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 22 }));
  for (const r of rows) ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
await wb.xlsx.writeFile(`${dir}HEC워크숍_전체백업_${stamp}.xlsx`);

console.log(`백업 완료 → ${dir}`);
for (const [t, n] of summary) console.log(`  ${t.padEnd(26)} ${String(n).padStart(6)}행  ✓ 행 수 검증`);
