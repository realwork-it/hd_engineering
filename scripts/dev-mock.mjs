// 로컬 개발·E2E용 목(mock) Supabase — 실제 키 없이 참여자 화면을 띄운다.
//   npm run dev:mock  →  http://localhost:3000/s/demo01
// supabase/migrations 전체와 시드 CSV를 임베디드 Postgres(PGlite)에 올리고,
// 앱이 쓰는 PostgREST 호출(rpc/*, teams, app_settings)만 흉내 낸다. 운영자 로그인(Auth)은 지원하지 않는다.
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { parse } from "csv-parse/sync";

const PORT = 54399;
const root = fileURLToPath(new URL("..", import.meta.url));
const db = new PGlite();

await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`);
for (const f of readdirSync(`${root}supabase/migrations`).sort())
  await db.exec(readFileSync(`${root}supabase/migrations/${f}`, "utf8").replace("create extension if not exists pgcrypto;", ""));

const teams = parse(readFileSync(`${root}supabase/seed/seed_teams.csv`, "utf8"), { columns: true, bom: true });
for (const t of teams)
  await db.query("insert into teams (name, org_name, sil_name, headcount) values ($1,$2,$3,$4)", [
    t.team_name, t.org_name, t.sil_name === "(본부 직속)" ? null : t.sil_name, Number(t.headcount),
  ]);
const seedJs = readFileSync(`${root}scripts/seed.mjs`, "utf8");
const pool = (name) => JSON.stringify(seedJs.match(new RegExp(`const ${name} = "([^"]+)"`))[1].split(", "));
await db.query("insert into app_settings values ('pool_adj',$1),('pool_noun',$2),('study_default_url',$3)", [
  pool("POOL_ADJ"), pool("POOL_NOUN"), '"https://claude.ai/artifact/QpQj6eAVpJ8TDTT1WQXK3G"',
]);
// demo01: 전부 열림 / demo02: 초기 상태(시험공부만)
await db.exec(`
insert into sessions (slug, display_no, date, location, room, status, locks) values
 ('demo01','7','2026-10-07','대강의실','B','confirmed','{"study":true,"identity":true,"finder":true,"pledge":true,"pulse":true}'),
 ('demo02','14','2026-11-09','대강의실','A','confirmed', default);`);

// 현황판 데모: 40차수(1~13 완료, 14 진행 중) + 가상 제출.  http://localhost:3000/dashboard?k=demo
await db.query("insert into app_settings values ('dashboard_token', '\"demo\"')");
{
  const rows = parse(readFileSync(`${root}supabase/seed/seed_sessions.csv`, "utf8"), { columns: true, bom: true });
  const open = '{"study":true,"identity":true,"finder":true,"pledge":true,"pulse":true}';
  for (const [i, r] of rows.entries()) {
    const [location, ...rest] = r.location.split(" ");
    const status = i < 13 ? "done" : i === 13 ? "running" : r.status;
    await db.query(
      "insert into sessions (slug, display_no, date, location, room, capacity, expected, actual, status, locks) values ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)",
      [`live${String(i + 1).padStart(2, "0")}`, r.display_no, r.date || null, location, rest.join(" ") || null,
       Number(r.capacity), i < 13 ? Math.round(Number(r.capacity) * 0.93) : null, status, i < 14 ? open : '{"study":true,"identity":false,"finder":false,"pledge":false,"pulse":false}'],
    );
  }
  const adj = JSON.parse(pool("POOL_ADJ")), noun = JSON.parse(pool("POOL_NOUN"));
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const skew = (arr) => arr[Math.floor(Math.pow(rnd(), 2.2) * arr.length)]; // 앞쪽 단어가 더 자주
  const goals = ["신뢰", "더 나은 삶", "안전한 현장", "에너지의 미래", "자부심", "기본", "사람", "완성", "가능성", "품질", "상생", "도전", "성장", "연결", "내일", "길"];
  const works = ["설계", "현장", "구매 조달", "견적", "안전", "기획"], dnas = ["끝까지", "치밀함", "현장 감각", "책임", "집요함"];
  const sess = (await db.query("select id from sessions where slug like 'live%' and status in ('done','running') order by slug")).rows;
  const tms = (await db.query("select id from teams order by headcount desc limit 90")).rows;
  for (const [i, t] of tms.entries())
    await db.query("insert into team_identities (id, session_id, team_id, work, dna, goal) values (gen_random_uuid(),$1,$2,$3,$4,$5)",
      [sess[i % sess.length].id, t.id, skew(works), skew(dnas) + "의 DNA", skew(goals)]);
  for (let i = 0; i < 80; i++)
    await db.query("insert into finder_submissions (id, session_id, team_id, h_adj, h_noun, f_adj, f_noun) values (gen_random_uuid(),$1,$2,$3,$4,$5,$6) on conflict do nothing",
      [sess[i % sess.length].id, tms[(i * 7) % tms.length].id, skew(adj.slice(0, 6)), skew(noun.slice(0, 5)), skew(adj.slice(20, 26)), skew(noun.slice(9, 14))]);
  for (let i = 0; i < 600; i++) {
    const custom = rnd() < 0.12;
    await db.query("insert into pledges (id, session_id, team_id, adj, adj_custom, noun, action) values (gen_random_uuid(),$1,$2,$3,$4,$5,'데모 실천')",
      [sess[i % sess.length].id, tms[i % tms.length].id, custom ? "타협 없는" : skew(adj.slice(0, 12)), custom, skew(noun.slice(0, 10))]);
    const pre = () => 2 + Math.floor(rnd() * 3), post = () => 5 + Math.floor(rnd() * 3);
    if (i % 10 < 9) await db.query("insert into pulses values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,'데모 주관식 응답입니다. 열 글자 이상.')",
      [sess[i % sess.length].id, pre(), post(), pre() + 1, post(), pre(), post(), pre(), post()]);
  }
}

const SET_RETURNING = new Set(["get_session_hub"]);
const lit = (v) => (Array.isArray(v) ? `{${v.join(",")}}` : v);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  for await (const c of req) body += c;
  const send = (code, json) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(json));
  };
  try {
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (rpc) {
      const args = body ? JSON.parse(body) : {};
      const names = Object.keys(args);
      const call = `${rpc[1]}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`;
      const params = names.map((n) => lit(args[n]));
      if (SET_RETURNING.has(rpc[1])) return send(200, (await db.query(`select * from ${call}`, params)).rows);
      return send(200, (await db.query(`select ${call} as r`, params)).rows[0].r);
    }
    if (url.pathname === "/rest/v1/teams")
      return send(200, (await db.query("select id, name, org_name, sil_name from teams where status='active' order by name")).rows);
    if (url.pathname === "/rest/v1/app_settings") {
      const eq = url.searchParams.get("key")?.match(/^eq.(.+)$/)?.[1];
      const rows = (await db.query("select key, value from app_settings")).rows
        .filter((r) => (eq ? r.key === eq : ["pool_adj", "pool_noun"].includes(r.key)));
      return send(200, req.headers.accept?.includes("pgrst.object") ? rows[0] : rows);
    }
    // 개발 편의: 잠금 토글  POST /_dev/locks/demo02  {"identity":true}
    const lock = url.pathname.match(/^\/_dev\/locks\/(\w+)$/);
    if (lock) {
      await db.query("update sessions set locks = locks || $1::jsonb where slug = $2", [body, lock[1]]);
      return send(200, (await db.query("select locks from sessions where slug=$1", [lock[1]])).rows[0]);
    }
    // 개발 편의: 테이블 덤프  GET /_dev/table/pledges
    const table = url.pathname.match(/^\/_dev\/table\/(\w+)$/);
    if (table) return send(200, (await db.query(`select * from ${table[1]}`)).rows);
    send(404, { message: `mock: unsupported ${req.method} ${url.pathname}` });
  } catch (e) {
    console.error("[mock]", e.message);
    send(400, { message: e.message });
  }
});
server.listen(PORT, () => console.log(`[mock] Supabase on :${PORT} — /s/demo01 (전부 열림), /s/demo02 (초기 잠금)`));

if (!process.argv.includes("--no-next")) {
  const next = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
    cwd: root, stdio: "inherit", shell: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${PORT}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon",
      SUPABASE_SERVICE_ROLE_KEY: "mock-service",
    },
  });
  next.on("exit", (code) => process.exit(code ?? 0));
}
