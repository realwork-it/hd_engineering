// dev-mock 전용: PostgREST(테이블 조회·수정)와 Auth를 필요한 만큼만 흉내 낸다.
export const MOCK_USER = {
  id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "demo@mock.local",
  app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z",
};
export const REST_TABLES = new Set([
  "sessions", "session_stats", "teams", "team_identities", "team_identity_revisions",
  "finder_submissions", "pledges", "pulses", "material_views", "admin_emails",
]);
const FK = { sessions: "session_id", teams: "team_id" };
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

// PGlite는 date를 Date 객체로 준다 → 실제 PostgREST처럼 'YYYY-MM-DD'
const clean = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "date" && v instanceof Date ? v.toISOString().slice(0, 10) : v])));
const json = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
const arr = (list) => "{" + list.map((x) => JSON.stringify(String(x))).join(",") + "}";

function whereOf(url, params) {
  const conds = [];
  for (const [k, v] of url.searchParams) {
    if (RESERVED.has(k) || !/^\w+$/.test(k)) continue;
    const dot = v.indexOf("."), op = v.slice(0, dot), val = v.slice(dot + 1);
    if (op === "is") conds.push(k + " is " + (val === "null" ? "null" : val === "true" ? "true" : "false"));
    else if (op === "in") conds.push(k + "::text = any($" + params.push(arr(val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")))) + "::text[])");
    else if (OPS[op]) conds.push(k + " " + OPS[op] + " $" + params.push(val));
  }
  return conds.length ? " where " + conds.join(" and ") : "";
}

export function loginResponse(res) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
  const session = {
    access_token: b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: MOCK_USER.id, email: MOCK_USER.email, role: "authenticated", exp }) + ".mock",
    token_type: "bearer", expires_in: 86400 * 30, expires_at: exp, refresh_token: "mock-refresh", user: MOCK_USER,
  };
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  res.writeHead(302, { "Set-Cookie": "sb-localhost-auth-token=" + value + "; Path=/; Max-Age=2592000; SameSite=Lax", Location: "http://localhost:3000/admin" });
  res.end();
}

export async function restTable(db, table, req, url, body, res) {
  const params = [], where = whereOf(url, params);
  const single = req.headers.accept?.includes("pgrst.object");
  const reply = (code, rows, extra = {}) => {
    res.writeHead(code, { "content-type": "application/json", ...extra });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(single ? rows[0] ?? null : rows));
  };

  if (req.method === "PATCH") {
    const patch = JSON.parse(body);
    const sets = Object.keys(patch).map((k) => k + " = $" + params.push(json(patch[k]))).join(", ");
    return reply(200, clean((await db.query("update " + table + " set " + sets + where + " returning *", params)).rows));
  }
  if (req.method === "POST") {
    const out = [];
    for (const row of [].concat(JSON.parse(body))) {
      const keys = Object.keys(row);
      const sql = "insert into " + table + " (" + keys.join(",") + ") values (" + keys.map((_, i) => "$" + (i + 1)).join(",") + ") returning *";
      out.push(...(await db.query(sql, keys.map((k) => json(row[k])))).rows);
    }
    return reply(201, clean(out));
  }

  const order = (url.searchParams.get("order") ?? "").split(",").filter(Boolean).map((o) => {
    const [col, ...mods] = o.split(".");
    if (!/^\w+$/.test(col)) return null;
    return col + (mods.includes("desc") ? " desc" : " asc") + (mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "");
  }).filter(Boolean);
  const total = (await db.query("select count(*)::int c from " + table + where, params)).rows[0].c;
  const limit = Number(url.searchParams.get("limit") ?? 1000), offset = Number(url.searchParams.get("offset") ?? 0);
  let rows = req.method === "HEAD" ? [] : clean((await db.query(
    "select * from " + table + where + (order.length ? " order by " + order.join(", ") : "") + " limit " + limit + " offset " + offset, params)).rows);

  // FK 임베드: select=...,sessions(display_no),teams(name, ...)
  for (const m of (url.searchParams.get("select") ?? "").matchAll(/(\w+)(?:!inner)?\(([^)]*)\)/g)) {
    const fk = FK[m[1]];
    if (!fk || !rows.length) continue;
    const ids = [...new Set(rows.map((r) => r[fk]).filter(Boolean))];
    const found = ids.length ? clean((await db.query("select * from " + m[1] + " where id::text = any($1::text[])", [arr(ids)])).rows) : [];
    const byId = new Map(found.map((f) => [f.id, f]));
    rows = rows.map((r) => ({ ...r, [m[1]]: byId.get(r[fk]) ?? null }));
  }
  reply(single && rows.length !== 1 && req.method !== "HEAD" ? 406 : 200, rows,
    { "content-range": offset + "-" + (offset + Math.max(rows.length - 1, 0)) + "/" + total });
}

/** 시각 점검용: 긴 문장·미등록 팀·복수 제출·숨김·Pulse 경보가 섞인 데이터 */
export async function seedVisualCases(db) {
  const id = async (sql) => (await db.query(sql)).rows[0].id;
  const s14 = await id("select id from sessions where slug='live14'"), s03 = await id("select id from sessions where slug='live03'");
  const big = await id("select id from teams order by headcount desc limit 1");
  await db.query("insert into admin_emails values ('demo@mock.local')");
  await db.query("insert into teams (name, org_name, status) values ('플랜트PM팀','(미등록)','pending'),('신재생TF','(미등록)','pending')");
  const pm = await id("select id from teams where name='플랜트PM팀'");
  await db.query("insert into team_identities (id, session_id, team_id, work, dna, goal) values (gen_random_uuid(),$1,$2,$3,$4,$5) on conflict do nothing",
    [s03, big, "공간의 뼈대를 세우고 설비의 숨길을 설계하는", "도면 한 장에도 끝까지 책임을 담는 집요한 DNA", "어떤 환경에서도 무너지지 않는 안전한 일상"]);
  await db.query("insert into team_identities (id, session_id, team_id, team_name_raw, work, dna, goal, hidden) values (gen_random_uuid(),$1,$2,'플랜트PM팀','ㅋㅋㅋㅋ','ㅋㅋ','ㅋㅋㅋ',true)", [s14, pm]);
  await db.query("insert into pledges (id, session_id, team_id, team_name_raw, adj, noun, action) values (gen_random_uuid(),$1,$2,'플랜트PM팀','신속한','소통','협력사 문의에 24시간 안에 회신')", [s14, pm]);
  await db.query("update finder_submissions set why_heritage='한 번의 실수가 큰 사고로 이어질 수 있는 일이기에, 끝까지 확인하는 집요함이 우리를 지켜왔습니다. 도면과 현장이 다를 때 다시 가서 확인하는 사람이 결국 회사를 지켰습니다.', why_future='에너지 전환의 길에서는 익숙한 방식 너머로 나아가는 사람이 필요합니다.', f_adj='데이터에 밝은', f_adj_custom=true where id in (select id from finder_submissions limit 3)");
  await db.query("update sessions set ft_name = (array['김OO','박OO','이OO'])[1 + (substr(slug,5)::int % 3)] where slug like 'live%'");
  await db.query("update pulses set q1_post=3, q2_post=4, q3_post=3, q4_post=3 where session_id=(select id from sessions where slug='live09')");
}
