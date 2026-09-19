// SPEC §8 인수 기준 1·2 — 동시 제출 부하 테스트 (실제 브라우저와 같은 경로: 페이지 GET → Server Action POST)
//
//   node scripts/loadtest.mjs                          # http://localhost:3000 (npm run build && npm start)
//   node scripts/loadtest.mjs https://배포주소 150      # 배포 서버, 가상 사용자 150명
//   node scripts/loadtest.mjs http://localhost:3000 150 0   # 3번째 인자 = 출발 분산(초). 0 = 전원이 같은 순간에 시작(최악)
//                                                       기본 10초: FT 안내 후 150명이 10초 안에 모두 제출을 시작하는 상황
//
// 임시 차수(LT)를 만들어 제출하고, 끝나면 테스트 데이터와 차수를 모두 지운다(서비스 롤).
// 가상 사용자 1명 = 허브 열기 → 실천약속 폼 열기 → 실천약속 제출 → 같은 요청 재전송(더블탭/재시도) → Pulse 제출 → 재전송
import { randomUUID } from "node:crypto";
import { adminClient } from "./_client.mjs";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const USERS = Number(process.argv[3] ?? 150);
const RAMP_S = Number(process.argv[4] ?? 10);
const db = adminClient();

const slug = "LT" + randomUUID().replace(/-/g, "").slice(0, 8);
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))] ?? 0;

async function discoverActions() {
  const html = await (await fetch(`${BASE}/s/${slug}/promise`)).text();
  const srcs = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"' ]+?\.js/g)].map((m) => m[0]))];
  const ids = {};
  for (const src of srcs) {
    const js = await (await fetch(BASE + src)).text();
    for (const m of js.matchAll(/createServerReference\)?\("([0-9a-f]{30,})"[^)]{0,160}?"(submit\w+)"/g)) ids[m[2]] = m[1];
  }
  // Pulse 액션은 다른 페이지의 청크에 있을 수 있다
  if (!ids.submitPulse) {
    const h2 = await (await fetch(`${BASE}/s/${slug}/pulse`)).text();
    for (const src of new Set([...h2.matchAll(/\/_next\/static\/chunks\/[^"' ]+?\.js/g)].map((m) => m[0]))) {
      const js = await (await fetch(BASE + src)).text();
      for (const m of js.matchAll(/createServerReference\)?\("([0-9a-f]{30,})"[^)]{0,160}?"(submit\w+)"/g)) ids[m[2]] = m[1];
    }
  }
  return ids;
}

const samples = { hub: [], form: [], promise: [], retry: [], pulse: [] };
const errors = [];

async function timed(bucket, fn) {
  const t0 = performance.now();
  try {
    const out = await fn();
    samples[bucket].push(performance.now() - t0);
    return out;
  } catch (e) {
    samples[bucket].push(performance.now() - t0);
    errors.push(`${bucket}: ${e.message}`);
    return null;
  }
}

async function action(id, path, cookie, args) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: cookie },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const m = text.match(/\{"ok":(true|false)[^}]*\}/);
  if (!m) throw new Error("응답 해석 실패: " + text.slice(0, 120));
  const body = JSON.parse(m[0]);
  if (!body.ok) throw new Error(`거부: ${body.code}`);
  return body;
}

async function virtualUser(i, ids, teams) {
  // 허브 — 기기 쿠키 발급
  const hub = await timed("hub", async () => {
    const r = await fetch(`${BASE}/s/${slug}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await r.text();
    return r;
  });
  const cookie = (hub?.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  await timed("form", async () => {
    const r = await fetch(`${BASE}/s/${slug}/promise`, { headers: { Cookie: cookie } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await r.text();
  });

  // 팀당 1건 → 가상 사용자마다 다른 팀 (워밍업 -1은 마지막 팀)
  const promise = { id: randomUUID(), team: { id: teams[(i + teams.length) % teams.length].id, name: "x" }, leader: `리더는 ${i} 결정의 배경을 먼저 설명합니다`, member: "팀원은 막히면 바로 공유합니다", routine: "우리는 매주 금요일 회고를 합니다" };
  await timed("promise", () => action(ids.submitPromise, `/s/${slug}/promise`, cookie, [slug, promise]));
  await timed("retry", () => action(ids.submitPromise, `/s/${slug}/promise`, cookie, [slug, promise])); // 같은 uuid 재전송 = 멱등

  const pulse = { id: randomUUID(), scores: [3, 6, 4, 6, 3, 5, 2, 6], openText: `부하 테스트 주관식 응답 ${i} — 열 글자 이상입니다.` };
  await timed("pulse", () => action(ids.submitPulse, `/s/${slug}/pulse`, cookie, [slug, pulse]));
  await timed("retry", () => action(ids.submitPulse, `/s/${slug}/pulse`, cookie, [slug, pulse]));
}

let sessionId;
try {
  const { data: s, error } = await db.from("sessions").insert({
    slug, display_no: "LT", status: "confirmed", note: "부하 테스트용 임시 차수 — 자동 삭제됨",
    locks: { study: true, identity: true, finder: true, promise: true, pulse: true },
  }).select("id").single();
  if (error) throw error;
  sessionId = s.id;
  const { data: teams } = await db.from("teams").select("id").eq("status", "active").limit(1000);
  if (USERS + 1 > teams.length) throw new Error(`실천약속은 팀당 1건이라 가상 사용자는 최대 ${teams.length - 1}명까지입니다`);

  const ids = await discoverActions();
  if (!ids.submitPromise || !ids.submitPulse) throw new Error("Server Action id를 찾지 못했습니다: " + JSON.stringify(ids));
  console.log(`대상 ${BASE} · 가상 사용자 ${USERS}명 · 출발 분산 ${RAMP_S}초 · 임시 차수 /s/${slug}`);

  await virtualUser(-1, ids, teams); // 워밍업 1회 (콜드 스타트 분리)
  for (const k of Object.keys(samples)) samples[k].length = 0;
  errors.length = 0;

  const t0 = performance.now();
  await Promise.all(Array.from({ length: USERS }, async (_, i) => {
    await new Promise((r) => setTimeout(r, (RAMP_S * 1000 * i) / USERS));
    return virtualUser(i, ids, teams);
  }));
  const wall = (performance.now() - t0) / 1000;

  const count = async (t) => (await db.from(t).select("*", { count: "exact", head: true }).eq("session_id", sessionId)).count;
  const [pl, pu] = [await count("team_promises"), await count("pulses")];
  const expected = USERS + 1; // 워밍업 포함

  console.log(`\n구간        요청수   p50     p95     최대`);
  for (const [k, xs] of Object.entries(samples))
    console.log(`${k.padEnd(10)} ${String(xs.length).padStart(5)}  ${pct(xs, 50).toFixed(0).padStart(5)}ms ${pct(xs, 95).toFixed(0).padStart(5)}ms ${Math.max(...xs).toFixed(0).padStart(5)}ms`);
  const submitP95 = pct([...samples.promise, ...samples.pulse], 95);
  const total = Object.values(samples).reduce((a, x) => a + x.length, 0);
  console.log(`\n총 ${total}요청 / ${wall.toFixed(1)}초 (${(total / wall).toFixed(0)} req/s)`);
  console.log(`${errors.length === 0 ? "PASS" : "FAIL"} 에러율 ${((errors.length / total) * 100).toFixed(2)}% (${errors.length}건)${errors.length ? " — " + [...new Set(errors)].slice(0, 5).join(" | ") : ""}`);
  console.log(`${pl === expected && pu === expected ? "PASS" : "FAIL"} 유실·중복 0 — 실천약속 ${pl}/${expected}, Pulse ${pu}/${expected} (각자 2번씩 보냈지만 1건씩만 저장)`);
  console.log(`${submitP95 < 2000 ? "PASS" : "FAIL"} 제출 p95 ${submitP95.toFixed(0)}ms (< 2000ms)`);
} finally {
  if (sessionId) {
    await db.from("team_promise_revisions").delete().in("promise_id", ((await db.from("team_promises").select("id").eq("session_id", sessionId)).data ?? []).map((x) => x.id));
    for (const t of ["team_promises", "pulses", "material_views", "team_identities", "finder_submissions"]) await db.from(t).delete().eq("session_id", sessionId);
    await db.from("sessions").delete().eq("id", sessionId);
    const { count } = await db.from("sessions").select("*", { count: "exact", head: true }).eq("slug", slug);
    console.log(`정리 완료 — 임시 차수 잔여 ${count}건`);
  }
}
