// 마이그레이션 전체를 임베디드 Postgres(PGlite)에 적용하고 제출 규칙(R3~R8, 멱등)을 검증
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(dir + f, "utf8").replace("create extension if not exists pgcrypto;",""));
await db.exec(`insert into sessions(slug,display_no,status) values ('s1','1','confirmed'),('s2','2','confirmed');
insert into teams(name,org_name) values ('A팀','본부'),('B팀','본부');
insert into app_settings values ('pool_adj','["집요한"]'),('pool_noun','["도전"]'),('study_default_url','"https://example.com/study"');`);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const teamA = (await one("select id from teams where name='A팀'")).id;
const U = () => crypto.randomUUID();
const ident = (id, slug, team, raw, w, ow=false, dk='d1') => one("select submit_identity($1,$2,$3,$4,$5,'dna','goal',$6,$7) r", [id, slug, team, raw, w, dk, ow]).then(r=>r.r);

let id1 = U();
assert.equal((await ident(id1,'s1',teamA,null,'w1')).status, 'locked');
await db.exec(`update sessions set locks = '{"study":true,"identity":true,"finder":true,"promise":true,"pulse":true}'`);
assert.equal((await ident(id1,'nope',teamA,null,'w1')).status, 'not_found');
assert.equal((await ident(id1,'s1',teamA,null,'w1')).status, 'created');
assert.equal((await ident(id1,'s1',teamA,null,'w1')).status, 'updated');            // retry, same payload
assert.equal((await one("select count(*)::int c from team_identity_revisions")).c, 0); // no revision for identical
assert.equal((await ident(U(),'s1',teamA,null,'w2',false,'d2')).status, 'exists');   // other device same team
assert.equal((await ident(U(),'s1',teamA,null,'w2',true,'d2')).status, 'updated');   // confirmed overwrite
assert.equal((await one("select count(*)::int c from team_identity_revisions")).c, 1);
assert.equal((await one("select count(*)::int c from team_identities")).c, 1);
assert.equal((await ident(U(),'s2',teamA,null,'w3')).status, 'created');             // other session = separate
assert.equal((await ident(U(),'s1',null,' a팀 ','x',true)).status, 'updated');        // case-insensitive roster match
assert.equal((await ident(U(),'s1',null,'신재생TF','x')).status, 'created');          // unknown → pending
assert.deepEqual(await one("select status, org_name from teams where name='신재생TF'"), {status:'pending', org_name:'(미등록)'});
assert.equal((await ident(U(),'s1',null,'   ','x')).status, 'invalid');

const fin = (id, ow=false) => one("select submit_finder($1,'s1',$2,null,'집요한','도전','데이터에 밝은','판단','why','why','d1',$3) r",[id,teamA,ow]).then(r=>r.r);
assert.equal((await fin(U())).status,'created');
assert.equal((await fin(U())).status,'exists');
assert.equal((await fin(U(),true)).status,'updated');
assert.deepEqual(await one("select h_adj_custom a,h_noun_custom b,f_adj_custom c,f_noun_custom d from finder_submissions"),{a:false,b:false,c:true,d:true});

// 팀 실천약속: 팀당 1건 — 팀 정체성과 같은 규칙 (멱등, 다른 기기 = exists, 동의 시 수정 + 이력, 다른 차수 = 별건)
const teamB = (await one("select id from teams where name='B팀'")).id;
const prom = (id, slug, team, raw, leader, ow = false, dk = 'd1') =>
  one("select submit_promise($1,$2,$3,$4,$5,'팀원은 피드백을 바로 공유합니다','우리는 매주 금요일 회고를 합니다',$6,$7) r", [id, slug, team, raw, leader, dk, ow]).then((r) => r.r);
const p1 = U();
const both = await Promise.all([prom(p1, 's1', teamA, null, '리더는 회의를 정시에 시작합니다'), prom(p1, 's1', teamA, null, '리더는 회의를 정시에 시작합니다')]); // 더블탭
assert.deepEqual(both.map((b) => b.status).sort(), ['created', 'updated']);
assert.equal((await one("select count(*)::int c from team_promise_revisions")).c, 0);                       // 같은 내용 재전송은 이력 없음
assert.equal((await prom(U(), 's1', teamA, null, '리더는 결정 배경을 설명합니다', false, 'd2')).status, 'exists');   // 같은 팀의 다른 사람
assert.equal((await prom(U(), 's1', teamA, null, '리더는 결정 배경을 설명합니다', true, 'd2')).status, 'updated');   // 수정 동의
assert.equal((await one("select count(*)::int c from team_promise_revisions")).c, 1);
assert.equal((await one("select count(*)::int c from team_promises")).c, 1);
assert.equal((await prom(U(), 's2', teamA, null, '리더는 회의 안건을 미리 공유합니다')).status, 'created');         // 다른 차수 = 별건
assert.equal((await prom(U(), 's1', teamB, null, '리더는 회의 안건을 미리 공유합니다')).status, 'created');
assert.equal((await prom(U(), 's2', null, '신재생TF', '리더는 먼저 묻습니다')).status, 'created');                   // 미등록 팀(병합 테스트용)
await assert.rejects(one("select submit_promise($1,'s2',$2,null,'','m','r','d',false)", [U(), teamB]), /check/);   // 빈 칸 거부 (B팀은 s2에 아직 제출 없음 → insert 경로)

const pu = U();
for (let i=0;i<3;i++) assert.equal((await one("select submit_pulse($1,'s1','{1,7,2,6,3,5,4,4}','열 글자 이상의 주관식 응답') r",[pu])).r.status,'created');
assert.equal((await one("select count(*)::int c from pulses")).c, 1);
await assert.rejects(one("select submit_pulse($1,'s1','{0,7,2,6,3,5,4,4}','열 글자 이상의 주관식 응답') r",[U()]));
const cols = (await db.query("select column_name from information_schema.columns where table_name='pulses'")).rows.map(r=>r.column_name);
assert.ok(!cols.some(c=>/team|device|name/.test(c)), 'pulses has no identifier columns');

assert.equal((await one("select log_study_view('s1','d1') u")).u, 'https://example.com/study');
await db.exec("update sessions set study_url='https://alt' where slug='s1'");
assert.equal((await one("select log_study_view('s1','d1') u")).u, 'https://alt');
assert.equal((await one("select count(*)::int c from material_views")).c, 2);

await db.exec("set role anon");
await assert.rejects(one("select submit_pulse($1,'s1','{1,7,2,6,3,5,4,4}','열 글자 이상의 주관식 응답')",[U()]), /permission denied/);
await assert.rejects(one("select _resolve_team(null,'x')"), /permission denied/);
await db.exec("reset role; set role service_role");
assert.ok(await one("select * from get_session_hub('s1')"));

// ---- M3: dashboard_data (R11 통계만, R14 숨김 제외, 취소 차수 제외) ----
await db.exec("reset role");
await db.exec(`update sessions set status='done', actual=100 where slug='s1'; update sessions set status='running', expected=50 where slug='s2';`);
let d = (await one("select dashboard_data() d")).d;
assert.equal(d.people, 150); assert.equal(d.sessions.length, 2);
assert.equal(d.promises, 4); assert.equal(d.teams_with_promise, 3);
assert.equal(d.pulse.n, 1); assert.deepEqual(d.pulse.q[0], [1, 7]);
assert.equal(d.teams_with_identity, 2);
assert.ok(d.cloud.some(([w]) => w === 'goal'));
// 팀 실천약속: 카테고리별 핵심 단어 — 조사·서술어 꼬리를 떼고('회의를'→'회의', '공유합니다'→'공유'), '리더·팀원·우리'는 제외
const pw = Object.fromEntries(Object.entries(d.promise_words).map(([k, v]) => [k, Object.fromEntries(v)]));
assert.equal(pw.leader['회의'], 2); assert.equal(pw.leader['안건'], 2); assert.equal(pw.leader['리더'], undefined);
assert.equal(pw.member['피드백'], 4); assert.equal(pw.member['공유'], 4); assert.equal(pw.routine['회고'], 4);
assert.ok(!JSON.stringify(d.promise_words).includes('합니다'));
// 같은 단어의 Heritage/Future 건수
assert.deepEqual(Object.fromEntries(d.hf_words.map(([w, h, f]) => [w, [h, f]])), { '집요한': [1, 0], '도전': [1, 0], '데이터에 밝은': [0, 1], '판단': [0, 1] });
const dump = JSON.stringify(d);
assert.ok(!dump.includes('s1') && !dump.includes('A팀') && !dump.includes('정시에 시작') && !dump.includes('열 글자'), "원문·slug·팀명 비노출");
await db.exec("update team_promises set hidden=true where team_id=(select id from teams where name='B팀')");
assert.equal((await one("select dashboard_data() d")).d.promises, 3);
await db.exec("update sessions set status='canceled' where slug='s2'");
d = (await one("select dashboard_data() d")).d;
assert.equal(d.people, 100); assert.equal(d.sessions.length, 1);
await assert.rejects(db.exec("update sessions set status='pilot' where slug='s1'"), /check/);

// ---- M4: merge_team (미등록 팀 병합) ----
await assert.rejects(one("select merge_team($1,$2)", [teamA, teamA]), /forbidden/);           // 운영자 아님
await db.exec(`create or replace function auth.jwt() returns jsonb language sql stable as $fn$ select '{"email":"op@x.com"}'::jsonb $fn$; insert into admin_emails values ('op@x.com');`);
const pend = (await one("select id from teams where name='신재생TF'")).id;                      // s1 정체성 1건 + s2 실천약속 1건
const mr = (await one("select merge_team($1,$2) r", [pend, teamA])).r;                          // A팀은 s1 정체성·s2 실천약속이 이미 있음 → 둘 다 충돌(숨김)
assert.deepEqual(mr, { moved: 0, conflicts: 2 });
assert.equal((await one("select hidden from team_promises where team_id=$1", [pend])).hidden, true);
assert.equal((await one("select status from teams where id=$1", [pend])).status, 'merged');
assert.equal((await one("select hidden from team_identities where team_id=$1", [pend])).hidden, true);
await assert.rejects(one("select merge_team($1,$2)", [pend, teamA]), /미등록 팀이 아닙니다/);

// ---- 하드닝: 원자적 토글 · 병합 팀 따라가기 · 차수 종료 · 인원 잠정 집계 ----
const sid1 = (await one("select id from sessions where slug='s1'")).id;
await db.exec(`update sessions set locks='{"study":true,"identity":false,"finder":false,"promise":false,"pulse":false}' where slug='s1'`);
await Promise.all(['identity','finder','promise','pulse'].map((a) => one("select set_session_lock($1,$2,true) r", [sid1, a])));
assert.deepEqual((await one("select locks from sessions where slug='s1'")).locks, { study: true, identity: true, finder: true, promise: true, pulse: true }, "동시 토글 4건이 서로 덮어쓰지 않음");
await assert.rejects(one("select set_session_lock($1,'nope',true)", [sid1]), /unknown activity/);
// 병합된 팀: 기억된 id·이름으로 제출해도 병합 대상(A팀)에 붙는다
const r1 = await prom(U(), 's1', pend, null, '리더는 병합 뒤에도 같은 팀입니다', true, 'devX1');   // 기억된 id → A팀의 기존 약속을 수정
const r2 = await prom(U(), 's1', null, '신재생tf', '리더는 이름으로 와도 같은 팀입니다', false, 'devX2'); // 기억된 이름 → A팀으로 해석돼 '이미 제출됨'
assert.equal(r1.status, 'updated'); assert.equal(r2.status, 'exists');
assert.equal((await one("select count(*)::int c from team_promises where session_id=$1 and team_id=$2 and leader like '%병합 뒤에도%'", [sid1, teamA])).c, 1);
assert.equal((await one("select count(*)::int c from teams where status='pending'")).c, 0, "병합된 이름으로 새 미등록 팀이 다시 생기지 않음");
await one("select close_session($1)", [sid1]);
assert.deepEqual(await one("select status, locks->>'promise' p, locks->>'study' st from sessions where slug='s1'"), { status: 'done', p: 'false', st: 'true' });
assert.equal((await prom(U(), 's1', teamB, null, '리더는 종료 후에 제출합니다')).status, 'locked');
await db.exec("insert into sessions(slug,display_no,status,capacity,expected) values ('s9','9','running',150,70)");
assert.equal((await one("select dashboard_data() d")).d.people, 170, "실참석이 없으면 대상자 인원으로 잠정 집계 (100 + 70) — 정원(150)은 쓰지 않는다");
// Pulse 응답률 분모: 완료(s1=100)만. 진행 중인 s9(70)는 Pulse 응답이 없으므로 제외 → 응답이 들어오면 포함
assert.equal((await one("select dashboard_data() d")).d.pulse.people, 100);
await db.exec("update sessions set locks = locks || '{\"pulse\":true}' where slug='s9'");
await one("select submit_pulse($1,'s9','{1,7,2,6,3,5,4,4}','진행 중 차수의 첫 Pulse 응답입니다') r", [U()]);
assert.equal((await one("select dashboard_data() d")).d.pulse.people, 170);

// ---- 단어 정리 규칙 (_word_stem) ----
for (const [raw, want] of [['회의를','회의'],['공유합니다.','공유'],['시작하고','시작'],['끝냅니다',''],['읽습니다',''],['바로',''],['역할을','역할'],['권한','권한'],['피드백은','피드백'],['리스크','리스크'],['논의','논의'],['금요일마다','금요일'],['"안전"','안전']])
  assert.equal((await one("select _word_stem($1) w", [raw])).w, want, `_word_stem(${raw})`);

// ---- 운영 실수 방지: 활동을 열면 시작 전 차수는 자동으로 '진행 중' ----
await db.exec("insert into sessions(slug,display_no,status) values ('s10','10','tbd'),('s11','11','done')");
const sid10 = (await one("select id from sessions where slug='s10'")).id, sid11 = (await one("select id from sessions where slug='s11'")).id;
await one("select set_session_lock($1,'study',true)", [sid10]);
assert.equal((await one("select status from sessions where slug='s10'")).status, 'tbd', "시험공부 자료만 여는 것으로는 시작되지 않음");
await one("select set_session_lock($1,'identity',true)", [sid10]);
assert.equal((await one("select status from sessions where slug='s10'")).status, 'running');
await one("select set_session_lock($1,'identity',false)", [sid10]);
assert.equal((await one("select status from sessions where slug='s10'")).status, 'running', "토글을 꺼도 되돌아가지 않음");
await one("select set_session_lock($1,'pulse',true)", [sid11]);
assert.equal((await one("select status from sessions where slug='s11'")).status, 'done', "완료된 차수는 다시 진행 중이 되지 않음");

// ---- 차수 자동 종료: 날짜(KST)가 지난 '진행 중' 차수만, 당일·미시작 차수는 그대로 ----
await db.exec(`insert into sessions(slug,display_no,status,date,locks) values
  ('c1','c1','running', (now() at time zone 'Asia/Seoul')::date - 1, '{"study":true,"identity":true,"finder":true,"promise":true,"pulse":true}'),
  ('c2','c2','running', (now() at time zone 'Asia/Seoul')::date,     '{"study":true,"identity":true,"finder":false,"promise":false,"pulse":false}'),
  ('c3','c3','confirmed', (now() at time zone 'Asia/Seoul')::date - 3, default),
  ('c4','c4','running', null, default)`);
assert.equal((await one("select auto_close_sessions() n")).n >= 1, true);
const closed = Object.fromEntries((await db.query("select slug, status, locks->>'promise' p, locks->>'study' st from sessions where slug in ('c1','c2','c3','c4')")).rows.map((r) => [r.slug, r]));
assert.deepEqual([closed.c1.status, closed.c1.p, closed.c1.st], ['done', 'false', 'true'], "어제 차수 → 종료 + 활동 잠금(시험공부 제외)");
assert.equal(closed.c2.status, 'running', "오늘 차수는 닫지 않는다");
assert.equal(closed.c3.status, 'confirmed', "시작한 적 없는 지난 차수는 그대로");
assert.equal(closed.c4.status, 'running', "날짜 미정 차수는 그대로");
assert.equal((await prom(U(), 'c1', teamB, null, '리더는 자동 종료 뒤에 제출합니다')).status, 'locked');
assert.equal((await one("select auto_close_sessions() n")).n, 0, "다시 불러도 할 일이 없으면 0");
console.log("ALL PASS", both.map(b=>b.status));
