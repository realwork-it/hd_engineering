// 하루에 여러 차수를 동시에 돌리는 상황 점검 — 3개 방 병행 + 운영자 동시 조작 + 분할 입과 팀
//   node scripts/multitest.mjs [BASE_URL] [방당 인원=40]
// 임시 차수 3개를 만들고 끝나면 모두 지운다. 운영자 동작은 .env.local의 운영자 계정으로 실제 RLS를 거친다.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminClient } from "./_client.mjs";
import { callAction, cookiesOf, discoverActions } from "./_http.mjs";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const PER_ROOM = Number(process.argv[3] ?? 40);
const svc = adminClient();
const tag = randomUUID().replace(/-/g, "").slice(0, 6);
const rooms = ["A", "B", "C"].map((room) => ({ room, slug: `MT${tag}${room}`, id: null }));
let pass = 0, failed = 0;
const check = (ok, label, detail = "") => {
  if (ok) pass++;
  else failed++;
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))] ?? 0;
const countIn = async (table, sessionId) => (await svc.from(table).select("*", { count: "exact", head: true }).eq("session_id", sessionId)).count;

try {
  for (const r of rooms) {
    const { data, error } = await svc.from("sessions")
      .insert({ slug: r.slug, display_no: `MT${r.room}`, date: "2026-12-30", location: "병행테스트", room: r.room, status: "confirmed", expected: PER_ROOM, note: "다차수 병행 테스트 — 자동 삭제됨" })
      .select("id").single();
    if (error) throw error;
    r.id = data.id;
  }
  // 운영자(실제 RLS 경로)
  const op = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const login = await op.auth.signInWithPassword({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  if (login.error) throw new Error("운영자 로그인 실패: " + login.error.message);
  const { data: teams } = await svc.from("teams").select("id, name").eq("status", "active").order("headcount", { ascending: false }).limit(30);

  console.log(`\n다차수 병행 테스트 — ${BASE} · 3개 방 × ${PER_ROOM}명\n\n[1] 운영자 3명이 각자 방의 활동을 동시에 연다 (방마다 4개 토글을 한꺼번에)`);
  const acts = ["identity", "finder", "pledge", "pulse"];
  const toggled = await Promise.all(rooms.flatMap((r) => acts.map((a) => op.rpc("set_session_lock", { p_id: r.id, p_activity: a, p_open: true }))));
  check(toggled.every((t) => !t.error), "동시 토글 12건 모두 성공", toggled.find((t) => t.error)?.error.message);
  const { data: after } = await svc.from("sessions").select("display_no, locks").in("id", rooms.map((r) => r.id));
  check(after.every((s) => acts.every((a) => s.locks[a] === true)), "어느 토글도 서로를 덮어쓰지 않음 (3개 방 × 4개 활동 전부 열림)");
  await Promise.all(rooms.map((r) => op.from("sessions").update({ status: "running" }).eq("id", r.id)));
  await sleep(2300); // 허브 캐시

  const ids = await discoverActions(BASE, ["identity", "pledge", "pulse"].map((a) => `/s/${rooms[0].slug}/${a}`));
  const lat = [], errors = [];
  const act = async (name, slug, activity, cookie, payload) => {
    const t0 = performance.now();
    try {
      const res = await callAction(BASE, ids[name], `/s/${slug}/${activity}`, cookie, [slug, payload]);
      lat.push(performance.now() - t0);
      return res;
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      return { ok: false, code: "error" };
    }
  };

  console.log(`\n[2] 3개 방에서 ${PER_ROOM * 3}명이 동시에 입장·제출 (10초에 걸쳐 시작, 1인 = 다짐 + Pulse)`);
  const t0 = performance.now();
  await Promise.all(rooms.flatMap((r, ri) => Array.from({ length: PER_ROOM }, async (_, i) => {
    await sleep((10_000 * (ri * PER_ROOM + i)) / (PER_ROOM * 3));
    const hub = await fetch(`${BASE}/s/${r.slug}`);
    await hub.text();
    const cookie = cookiesOf(hub);
    await act("submitPledge", r.slug, "pledge", cookie, { id: randomUUID(), team: { id: teams[i % teams.length].id, name: "x" }, adj: "과감한", noun: "도전", action: `${tag} ${r.room}방 ${i}` });
    await act("submitPulse", r.slug, "pulse", cookie, { id: randomUUID(), scores: [3, 6, 4, 6, 3, 5, 2, 6], openText: `${tag} ${r.room}방 ${i}번 — 열 글자 이상의 응답입니다.` });
  })));
  const wall = (performance.now() - t0) / 1000;
  check(errors.length === 0, `에러 0건 (${lat.length}건 제출 / ${wall.toFixed(1)}초, p95 ${pct(lat, 95).toFixed(0)}ms)`, [...new Set(errors)].slice(0, 3).join(" | "));
  for (const r of rooms) {
    const [pl, pu] = [await countIn("pledges", r.id), await countIn("pulses", r.id)];
    check(pl === PER_ROOM && pu === PER_ROOM, `${r.room}방: 다짐 ${pl}/${PER_ROOM} · Pulse ${pu}/${PER_ROOM} — 방 사이에 섞임·유실 없음`);
  }
  const { data: leak } = await svc.from("pledges").select("action, session_id").like("action", `${tag} %`);
  check(leak.every((p) => p.action.includes(`${rooms.find((r) => r.id === p.session_id)?.room}방`)), "모든 다짐이 자기 방 차수에 귀속 (slug가 유일한 차수 진실)");

  console.log("\n[3] 대형 팀 분할 입과 — 같은 팀이 A·B 두 방에서 각각 정체성 제출 (R5)");
  const big = teams[0];
  const dev = async (slug) => cookiesOf(await fetch(`${BASE}/s/${slug}`));
  const [cA1, cA2, cB] = [await dev(rooms[0].slug), await dev(rooms[0].slug), await dev(rooms[1].slug)];
  const ident = (goal) => ({ id: randomUUID(), team: { id: big.id, name: big.name }, work: `${tag} 설계`, dna: "집요함", goal });
  const race = await Promise.all([act("submitIdentity", rooms[0].slug, "identity", cA1, ident("신뢰")), act("submitIdentity", rooms[0].slug, "identity", cA2, ident("안전"))]);
  const created = race.filter((x) => x.ok).length, exists = race.filter((x) => !x.ok && x.code === "exists").length;
  check(created === 1 && exists === 1 && (await countIn("team_identities", rooms[0].id)) === 1, "같은 방·같은 팀 두 사람이 동시에 첫 제출 → 1건만 생성, 다른 한 명은 '이미 제출됨'", JSON.stringify(race));
  const other = await act("submitIdentity", rooms[1].slug, "identity", cB, ident("내일"));
  check(other.ok && other.status === "created" && (await countIn("team_identities", rooms[1].id)) === 1, "다른 방의 같은 팀 → 별건으로 저장");

  console.log("\n[4] 한 방만 먼저 종료 — 나머지 방은 계속 진행");
  const closed = await op.rpc("close_session", { p_id: rooms[2].id });
  check(!closed.error, "C방 차수 종료(운영자)", closed.error?.message);
  await sleep(2300);
  const late = await act("submitPledge", rooms[2].slug, "pledge", await dev(rooms[2].slug), { id: randomUUID(), team: { id: big.id, name: "x" }, adj: "과감한", noun: "도전", action: `${tag} 종료 후` });
  check(!late.ok && late.code === "locked", "종료된 C방에 뒤늦은 제출 → 서버 거부");
  const still = await act("submitPledge", rooms[0].slug, "pledge", await dev(rooms[0].slug), { id: randomUUID(), team: { id: big.id, name: "x" }, adj: "과감한", noun: "도전", action: `${tag} A방 계속` });
  check(still.ok, "A방은 영향 없이 계속 제출됨");

  console.log("\n[5] 현황판·콘솔 집계");
  const { data: dash } = await svc.rpc("dashboard_data");
  const mine = dash.sessions.filter((s) => s.no.startsWith("MT"));
  check(mine.filter((s) => s.status === "running").length === 2 && mine.filter((s) => s.status === "done").length === 1, "현황판: 진행 중 2개 + 완료 1개로 표시");
  check(mine.every((s) => s.people === PER_ROOM && s.provisional), "실참석 미입력 → 대상 인원으로 잠정 집계(잠정 표시)");
  const { data: stats } = await op.from("session_stats").select("*").in("session_id", rooms.map((r) => r.id));
  check(stats.length === 3 && stats.every((s) => s.pulses === PER_ROOM), "콘솔 차수 관리의 차수별 제출 건수 일치");
} catch (e) {
  failed++;
  console.log(`  ✗ 중단: ${e.message}`);
} finally {
  const sids = rooms.map((r) => r.id).filter(Boolean);
  if (sids.length) {
    const { data: idents } = await svc.from("team_identities").select("id").in("session_id", sids);
    await svc.from("team_identity_revisions").delete().in("identity_id", (idents ?? []).map((x) => x.id));
    for (const t of ["team_identities", "finder_submissions", "pledges", "pulses", "material_views"]) await svc.from(t).delete().in("session_id", sids);
    await svc.from("sessions").delete().in("id", sids);
    const { count } = await svc.from("sessions").select("*", { count: "exact", head: true }).like("slug", `MT${tag}%`);
    console.log(`\n정리 완료 (임시 차수 잔여 ${count}건)`);
  }
  console.log(`\n결과: ${pass}개 통과 · ${failed}개 실패`);
  process.exit(failed ? 1 : 0);
}
