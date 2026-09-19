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
insert into teams(name,org_name) values ('A팀','본부');
insert into app_settings values ('pool_adj','["집요한"]'),('pool_noun','["도전"]'),('study_default_url','"https://example.com/study"');`);
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const teamA = (await one("select id from teams where name='A팀'")).id;
const U = () => crypto.randomUUID();
const ident = (id, slug, team, raw, w, ow=false, dk='d1') => one("select submit_identity($1,$2,$3,$4,$5,'dna','goal',$6,$7) r", [id, slug, team, raw, w, dk, ow]).then(r=>r.r);

let id1 = U();
assert.equal((await ident(id1,'s1',teamA,null,'w1')).status, 'locked');
await db.exec(`update sessions set locks = '{"study":true,"identity":true,"finder":true,"pledge":true,"pulse":true}'`);
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

const pl = (id, dk, act='act') => one("select submit_pledge($1,'s1',$2,null,'집요한','도전',$3,$4) r",[id,teamA,act,dk]).then(r=>r.r);
const p1 = U();
const both = await Promise.all([pl(p1,'dev1'), pl(p1,'dev1')]);                         // double tap
assert.equal((await pl(U(),'dev1','edited')).status,'updated');                       // same device = edit
assert.equal((await pl(U(),'dev2')).status,'created');
assert.equal((await one("select count(*)::int c from pledges")).c, 2);
assert.equal((await one("select action from pledges where device_key='dev1'")).action,'edited');

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
await pl(U(),'dev3');  // s1 다짐 1건 추가 (총 3)
let d = (await one("select dashboard_data() d")).d;
assert.equal(d.people, 150); assert.equal(d.pledges, 3); assert.equal(d.sessions.length, 2);
assert.equal(d.pulse.n, 1); assert.deepEqual(d.pulse.q[0], [1, 7]);
assert.equal(d.ranks[0][0], '집요한 도전'); assert.equal(d.teams_with_identity, 2);
assert.ok(d.cloud.some(([w]) => w === 'goal'));
// 재설계 집계: 단어 기둥 + 조합 연결, 같은 단어의 Heritage/Future 건수
assert.deepEqual(d.pledge_flow.adj[0], ['집요한', 3]); assert.deepEqual(d.pledge_flow.noun[0], ['도전', 3]);
assert.deepEqual(d.pledge_flow.links[0], ['집요한', '도전', 3]);
assert.deepEqual(Object.fromEntries(d.hf_words.map(([w, h, f]) => [w, [h, f]])), { '집요한': [1, 0], '도전': [1, 0], '데이터에 밝은': [0, 1], '판단': [0, 1] });
const dump = JSON.stringify(d);
assert.ok(!dump.includes('s1') && !dump.includes('A팀') && !dump.includes('edited') && !dump.includes('열 글자'), "원문·slug·팀명 비노출");
await db.exec("update pledges set hidden=true where device_key='dev3'");
assert.equal((await one("select dashboard_data() d")).d.pledges, 2);
await db.exec("update sessions set status='canceled' where slug='s2'");
d = (await one("select dashboard_data() d")).d;
assert.equal(d.people, 100); assert.equal(d.sessions.length, 1);
await assert.rejects(db.exec("update sessions set status='pilot' where slug='s1'"), /check/);

// ---- M4: merge_team (미등록 팀 병합) ----
await assert.rejects(one("select merge_team($1,$2)", [teamA, teamA]), /forbidden/);           // 운영자 아님
await db.exec(`create or replace function auth.jwt() returns jsonb language sql stable as $fn$ select '{"email":"op@x.com"}'::jsonb $fn$; insert into admin_emails values ('op@x.com');`);
const pend = (await one("select id from teams where name='신재생TF'")).id;                      // s1에 정체성 1건(pending)
await one("select submit_pledge($1,'s1',null,'신재생TF','집요한','도전','병합 테스트','devM') r", [U()]);
const mr = (await one("select merge_team($1,$2) r", [pend, teamA])).r;                          // A팀은 s1에 정체성이 이미 있음 → 충돌 1
assert.deepEqual(mr, { moved: 1, conflicts: 1 });
assert.equal((await one("select status from teams where id=$1", [pend])).status, 'merged');
assert.equal((await one("select hidden from team_identities where team_id=$1", [pend])).hidden, true);
assert.equal((await one("select count(*)::int c from pledges where team_id=$1", [pend])).c, 0);
await assert.rejects(one("select merge_team($1,$2)", [pend, teamA]), /미등록 팀이 아닙니다/);

// ---- 하드닝: 원자적 토글 · 병합 팀 따라가기 · 차수 종료 · 인원 잠정 집계 ----
const sid1 = (await one("select id from sessions where slug='s1'")).id;
await db.exec(`update sessions set locks='{"study":true,"identity":false,"finder":false,"pledge":false,"pulse":false}' where slug='s1'`);
await Promise.all(['identity','finder','pledge','pulse'].map((a) => one("select set_session_lock($1,$2,true) r", [sid1, a])));
assert.deepEqual((await one("select locks from sessions where slug='s1'")).locks, { study: true, identity: true, finder: true, pledge: true, pulse: true }, "동시 토글 4건이 서로 덮어쓰지 않음");
await assert.rejects(one("select set_session_lock($1,'nope',true)", [sid1]), /unknown activity/);
// 병합된 팀: 기억된 id·이름으로 제출해도 병합 대상(A팀)에 붙는다
const r1 = (await one("select submit_pledge($1,'s1',$2,null,'집요한','도전','병합 후 id로','devX1') r", [U(), pend])).r;
const r2 = (await one("select submit_pledge($1,'s1',null,'신재생tf','집요한','도전','병합 후 이름으로','devX2') r", [U()])).r;
assert.equal(r1.status, 'created'); assert.equal(r2.status, 'created');
assert.equal((await one("select count(*)::int c from pledges where device_key in ('devX1','devX2') and team_id=$1", [teamA])).c, 2);
assert.equal((await one("select count(*)::int c from teams where status='pending'")).c, 0, "병합된 이름으로 새 미등록 팀이 다시 생기지 않음");
await one("select close_session($1)", [sid1]);
assert.deepEqual(await one("select status, locks->>'pledge' p, locks->>'study' st from sessions where slug='s1'"), { status: 'done', p: 'false', st: 'true' });
assert.equal((await one("select submit_pledge($1,'s1',$2,null,'집요한','도전','종료 후 제출','devX3') r", [U(), teamA])).r.status, 'locked');
await db.exec("insert into sessions(slug,display_no,status,capacity,expected) values ('s9','9','running',150,70)");
assert.equal((await one("select dashboard_data() d")).d.people, 170, "실참석이 없으면 대상자 인원으로 잠정 집계 (100 + 70) — 정원(150)은 쓰지 않는다");
// Pulse 응답률 분모: 완료(s1=100)만. 진행 중인 s9(70)는 Pulse 응답이 없으므로 제외 → 응답이 들어오면 포함
assert.equal((await one("select dashboard_data() d")).d.pulse.people, 100);
await db.exec("update sessions set locks = locks || '{\"pulse\":true}' where slug='s9'");
await one("select submit_pulse($1,'s9','{1,7,2,6,3,5,4,4}','진행 중 차수의 첫 Pulse 응답입니다') r", [U()]);
assert.equal((await one("select dashboard_data() d")).d.pulse.people, 170);
console.log("ALL PASS", both.map(b=>b.status));
