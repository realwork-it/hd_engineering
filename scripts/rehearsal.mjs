// 운영일 리허설 — 임시 차수로 하루 흐름 전체를 실제 HTTP로 걸어 보며 SPEC §8 인수 기준을 점검한다.
//   node scripts/rehearsal.mjs                      # http://localhost:3000
//   node scripts/rehearsal.mjs https://배포주소      # 배포 서버 (운영 전날 1회 권장)
// 끝나면 임시 차수·제출·미등록 팀을 모두 지운다(서비스 롤). 실제 차수 데이터는 건드리지 않는다.
import { randomUUID } from "node:crypto";
import { adminClient } from "./_client.mjs";
import { callAction, cookiesOf, discoverActions, visibleText } from "./_http.mjs";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const db = adminClient();
const slug = "RH" + randomUUID().replace(/-/g, "").slice(0, 8);
const MARK = "리허설" + slug.slice(2, 6); // 원문 노출 검사용 표식
let pass = 0, failed = 0;
const check = (ok, label, detail = "") => {
  if (ok) pass++;
  else failed++;
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (path, cookie = "") => fetch(BASE + path, { headers: { Cookie: cookie }, redirect: "manual" });

let sessionId, pendingName;
try {
  const { data: s, error } = await db.from("sessions")
    .insert({ slug, display_no: "RH", date: "2026-12-31", location: "리허설", room: "A", status: "confirmed", note: "리허설용 임시 차수 — 자동 삭제됨" })
    .select("id").single();
  if (error) throw error;
  sessionId = s.id;
  const setLocks = async (locks) => { await db.from("sessions").update({ locks }).eq("id", sessionId); await sleep(2300); }; // 허브 캐시 2초
  const ALL = { study: true, identity: true, finder: true, promise: true, pulse: true };
  const { data: teams } = await db.from("teams").select("id, name").eq("status", "active").order("headcount").limit(3);
  const count = async (t) => (await db.from(t).select("*", { count: "exact", head: true }).eq("session_id", sessionId)).count;

  console.log(`\n리허설 대상 ${BASE} · 임시 차수 /s/${slug}\n\n[1] 입장 — 허브 순차 공개 (R3)`);
  const hubRes = await get(`/s/${slug}`);
  const phoneA = cookiesOf(hubRes), hubText = visibleText(await hubRes.text());
  check(hubRes.status === 200 && hubText.includes("RH차수") && hubText.includes("12/31"), "허브 열림 · 차수/날짜 배지");
  check(hubText.includes("시험공부 자료") && !hubText.includes("Pulse Check") && !hubText.includes("팀 정체성"), "초기: 2번만 공개, 나머지는 활동명 비노출");
  check(/hec_dk=/.test(phoneA), "기기 키 쿠키 발급");
  const phoneB = cookiesOf(await get(`/s/${slug}`));

  const study = await get(`/s/${slug}/study`, phoneA);
  check(study.status === 302 && /^https:\/\//.test(study.headers.get("location") ?? ""), "학습자료 302 리다이렉트 (R15)", study.headers.get("location"));
  check((await count("material_views")) === 1, "학습자료 조회 로그 1건");

  console.log("\n[2] 잠금 — 서버가 강제 (DoD 3)");
  const locked = await get(`/s/${slug}/pulse`, phoneA);
  check(locked.status === 307 && (locked.headers.get("location") ?? "").endsWith(`/s/${slug}`), "잠긴 활동 직접 URL → 허브로 돌려보냄");
  await setLocks(ALL);
  const ids = await discoverActions(BASE, ["identity", "finder", "promise", "pulse"].map((a) => `/s/${slug}/${a}`));
  check(["submitIdentity", "submitFinder", "submitPromise", "submitPulse"].every((k) => ids[k]), "폼 4종 열림 · 제출 액션 확인");
  const act = (name, activity, cookie, payload) => callAction(BASE, ids[name], `/s/${slug}/${activity}`, cookie, [slug, payload]);

  await setLocks({ ...ALL, pulse: false });
  const pulse = { id: randomUUID(), scores: [3, 6, 4, 6, 3, 5, 2, 6], openText: `${MARK} 주관식 — 팀의 일을 한 문장으로 말해 본 것이 남습니다.` };
  const rej = await act("submitPulse", "pulse", phoneA, pulse);
  check(!rej.ok && rej.code === "locked" && (await count("pulses")) === 0, "잠긴 활동에 API 직접 제출 → 서버 거부, 저장 0건");
  const st = await (await get(`/s/${slug}/state`)).json();
  check(st.locks.pulse === false && st.locks.identity === true, "허브 폴링 상태에 토글 반영");
  await setLocks(ALL);

  console.log("\n[3] 팀 정체성 — 멱등·재제출 (R5, DoD 2·6)");
  const identity = { id: randomUUID(), team: { id: teams[0].id, name: teams[0].name }, work: `${MARK} 설계`, dna: "집요함", goal: "신뢰" };
  const first = await Promise.all([1, 2, 3].map(() => act("submitIdentity", "identity", phoneA, identity))); // 버튼 연타
  check(first.every((r) => r.ok) && (await count("team_identities")) === 1, "제출 버튼 3연타 → 레코드 1건");
  const other = await act("submitIdentity", "identity", phoneB, { ...identity, id: randomUUID(), goal: "안전" });
  check(!other.ok && other.code === "exists", "다른 기기·같은 팀 → '이미 제출됨' 확인 흐름");
  const over = await act("submitIdentity", "identity", phoneB, { ...identity, id: randomUUID(), goal: "안전", overwrite: true });
  const { count: revs } = await db.from("team_identity_revisions").select("*, team_identities!inner(session_id)", { count: "exact", head: true }).eq("team_identities.session_id", sessionId);
  check(over.ok && over.status === "updated" && (await count("team_identities")) === 1 && revs === 1, "수정 동의 → UPDATE + 이력 1건");

  console.log("\n[4] 차수 번호를 바꿔도 같은 QR (R2, DoD 5)");
  await db.from("sessions").update({ display_no: "RH2" }).eq("id", sessionId);
  const fin = await act("submitFinder", "finder", phoneA, {
    id: randomUUID(), team: { id: teams[0].id, name: "x" }, hAdj: "집요한", hNoun: "문제해결", fAdj: `${MARK}밝은`, fNoun: "판단", whyHeritage: `${MARK} 이유`, whyFuture: "",
  });
  const { data: finRow } = await db.from("finder_submissions").select("f_adj_custom, h_adj_custom").eq("session_id", sessionId).single();
  check(fin.ok && !!finRow, "번호 변경 후 같은 링크로 제출 → 같은 차수에 귀속");
  check(finRow?.f_adj_custom === true && finRow?.h_adj_custom === false, "Pool 밖 단어 플래그 (R9)");

  console.log("\n[5] 팀 실천약속 — 팀당 1건 · 3개 카테고리 필수 · 미등록 팀 (R4)");
  const vow = (team, leader, extra = {}) => ({ id: randomUUID(), team, leader, member: `팀원은 ${MARK} 막히면 바로 공유합니다`, routine: "우리는 매주 금요일 회고를 합니다", ...extra });
  const mine = vow({ id: teams[1].id, name: "x" }, `리더는 ${MARK} 결정의 배경을 설명합니다`);
  const sent = await Promise.all([1, 2].map(() => act("submitPromise", "promise", phoneA, mine))); // 더블탭
  check(sent.every((r) => r.ok) && (await count("team_promises")) === 1, "제출 버튼 연타 → 레코드 1건");
  const dup = await act("submitPromise", "promise", phoneB, vow({ id: teams[1].id, name: "x" }, `리더는 ${MARK} 다른 사람의 제출`));
  check(!dup.ok && dup.code === "exists", "같은 팀의 다른 사람 → '이미 제출됨' 확인 흐름");
  const fix = await act("submitPromise", "promise", phoneB, vow({ id: teams[1].id, name: "x" }, `리더는 ${MARK} 합의해서 고친 약속`, { overwrite: true }));
  const { count: prevs } = await db.from("team_promise_revisions").select("*, team_promises!inner(session_id)", { count: "exact", head: true }).eq("team_promises.session_id", sessionId);
  check(fix.ok && fix.status === "updated" && (await count("team_promises")) === 1 && prevs === 1, "수정 동의 → UPDATE + 이력 1건");
  pendingName = `${MARK}TF`;
  const raw = await act("submitPromise", "promise", phoneB, vow({ id: null, name: pendingName }, `리더는 ${MARK} 미등록 팀의 약속`));
  const { data: pend } = await db.from("teams").select("status").eq("name", pendingName).maybeSingle();
  check(raw.ok && (await count("team_promises")) === 2 && pend?.status === "pending", "명부에 없는 팀 → 저장 + 미등록 큐로");
  const empty = await act("submitPromise", "promise", phoneA, { ...vow({ id: teams[2].id, name: "x" }, "리더는 약속합니다"), routine: "   " });
  const long = await act("submitPromise", "promise", phoneA, vow({ id: teams[2].id, name: "x" }, "가".repeat(101)));
  check(!empty.ok && empty.code === "invalid" && !long.ok && long.code === "invalid", "카테고리 하나라도 비었거나 100자 초과 → 서버 거부");

  console.log("\n[6] Pulse — 완전 익명 (R8, DoD 7)");
  const short = await act("submitPulse", "pulse", phoneA, { ...pulse, id: randomUUID(), openText: "짧음" });
  check(!short.ok && short.code === "invalid", "주관식 10자 미만 → 서버 거부");
  const ok1 = await act("submitPulse", "pulse", phoneA, pulse), ok2 = await act("submitPulse", "pulse", phoneA, pulse);
  check(ok1.ok && ok2.ok && (await count("pulses")) === 1, "재전송에도 1건 (멱등)");
  const { data: pu } = await db.from("pulses").select("*").eq("session_id", sessionId).single();
  check(!Object.keys(pu).some((k) => /team|device|name|email|ip/i.test(k)), "Pulse 행에 팀·기기·개인식별 컬럼 없음", Object.keys(pu).join(","));

  console.log("\n[7] 현황판 — 통계만, 토큰 접근 (R11, DoD 8)");
  const { data: tok } = await db.from("app_settings").select("value").eq("key", "dashboard_token").single();
  const deny = visibleText(await (await get("/dashboard")).text());
  check(deny.includes("유효하지 않거나 만료된 링크"), "토큰 없이 접근 → 안내 페이지");
  const wrong = cookiesOf(await get("/dashboard?k=wrong-token"));
  check((await get("/dashboard/data", wrong)).status === 401, "틀린 토큰 → 데이터 401");
  const enter = await get(`/dashboard?k=${encodeURIComponent(tok.value)}`);
  const viewer = cookiesOf(enter);
  check(enter.status === 307 && !(enter.headers.get("location") ?? "").includes("k="), "올바른 토큰 → 쿠키 발급 후 토큰 없는 주소로 이동");
  const dataRes = await get("/dashboard/data", viewer);
  const dump = await dataRes.text(), dash = JSON.parse(dump);
  check(dataRes.status === 200 && dash.promises >= 2 && dash.pulse.n >= 1, "집계에 리허설 제출 반영", `실천약속 ${dash.promises} · Pulse ${dash.pulse.n}`);
  const words = JSON.stringify(dash.promise_words);
  check(dash.promise_words.routine.some(([w]) => w === "회고") && !words.includes("합니다") && !words.includes("리더"), "실천약속은 카테고리별 핵심 단어로만 집계 (조사·서술어 제거)");
  check(!dump.includes(MARK + " 결정") && !dump.includes("고친 약속") && !dump.includes(slug) && !dump.includes(teams[0].name), "현황판 데이터에 제출 원문·slug·팀명 없음");
  const adminTry = await get("/admin", viewer);
  check(adminTry.status === 307 && (adminTry.headers.get("location") ?? "").includes("/admin/login"), "뷰어 쿠키로 콘솔 접근 불가");

  console.log("\n[8] 숨김 → 집계 즉시 제외 (R14)");
  const before = dash.promises;
  await db.from("team_promises").update({ hidden: true }).eq("session_id", sessionId);
  const after = (await (await get("/dashboard/data", viewer)).json()).promises;
  check(after === before - 2, "숨긴 실천약속 2건이 현황판에서 빠짐", `${before} → ${after}`);
} catch (e) {
  failed++;
  console.log(`  ✗ 중단: ${e.message}`);
} finally {
  if (sessionId) {
    const { data: idents } = await db.from("team_identities").select("id").eq("session_id", sessionId);
    await db.from("team_identity_revisions").delete().in("identity_id", (idents ?? []).map((x) => x.id));
    const { data: proms } = await db.from("team_promises").select("id").eq("session_id", sessionId);
    await db.from("team_promise_revisions").delete().in("promise_id", (proms ?? []).map((x) => x.id));
    for (const t of ["team_identities", "finder_submissions", "team_promises", "pulses", "material_views"]) await db.from(t).delete().eq("session_id", sessionId);
    if (pendingName) await db.from("teams").delete().eq("name", pendingName).eq("status", "pending");
    await db.from("sessions").delete().eq("id", sessionId);
    const { count: left } = await db.from("sessions").select("*", { count: "exact", head: true }).eq("slug", slug);
    console.log(`\n정리 완료 (임시 차수 잔여 ${left}건)`);
  }
  console.log(`\n결과: ${pass}개 통과 · ${failed}개 실패`);
  process.exit(failed ? 1 : 0);
}
