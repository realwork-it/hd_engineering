-- 개인다짐 → 팀 실천약속 (운영 결정)
--  · 팀당 1건(같은 차수·같은 팀 재제출 = 수정 + 이력), 팀 정체성과 같은 규칙
--  · 3개 카테고리 모두 필수, 자유 문장: 리더행동(리더는 ~합니다) / 팀원행동(팀원은 ~합니다) / 팀루틴·구조(우리는 ~합니다)
--  · 현황판에는 카테고리별 핵심 단어만 (원문 비노출 원칙 유지)

-- 0) 개인다짐은 한 건도 받지 않은 상태에서만 걷어낸다
do $$
begin
  if exists (select 1 from pledges) then
    raise exception '개인다짐 데이터가 남아 있습니다 — 백업·이관 후 다시 실행하세요';
  end if;
end $$;

-- 1) 테이블 ---------------------------------------------------------------------
create table team_promises (
  id uuid primary key,                       -- 클라이언트 생성 uuid = 멱등키
  session_id uuid not null references sessions,
  team_id uuid references teams,
  team_name_raw text,
  leader  text not null check (char_length(leader)  between 1 and 100),   -- 리더행동
  member  text not null check (char_length(member)  between 1 and 100),   -- 팀원행동
  routine text not null check (char_length(routine) between 1 and 100),   -- 팀루틴/구조
  hidden bool not null default false,
  device_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, team_id)
);
create index team_promises_team_idx on team_promises (team_id);
create trigger team_promises_updated_at before update on team_promises
  for each row execute function set_updated_at();

create table team_promise_revisions (
  id bigserial primary key,
  promise_id uuid not null references team_promises,
  leader text, member text, routine text,
  saved_at timestamptz not null default now()
);
create index team_promise_revisions_promise_idx on team_promise_revisions (promise_id);

alter table team_promises          enable row level security;
alter table team_promise_revisions enable row level security;
revoke all on team_promises, team_promise_revisions from anon;
revoke all on sequence team_promise_revisions_id_seq from anon;
revoke delete, truncate on team_promises, team_promise_revisions from authenticated;
do $$
declare t text;
begin
  foreach t in array array['team_promises', 'team_promise_revisions'] loop
    execute format('create policy %I on %I for select to authenticated using (is_admin())', t || '_admin_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on %I for update to authenticated using (is_admin()) with check (is_admin())', t || '_admin_update', t);
  end loop;
end $$;

-- 2) 활동 키: pledge → promise ---------------------------------------------------
update sessions set locks = (locks - 'pledge') || jsonb_build_object('promise', coalesce(locks -> 'pledge', 'false'::jsonb));
alter table sessions alter column locks
  set default '{"study":true,"identity":false,"finder":false,"promise":false,"pulse":false}';

create or replace function set_session_lock(p_id uuid, p_activity text, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_activity not in ('study','identity','finder','promise','pulse') then raise exception 'unknown activity'; end if;
  update sessions set locks = locks || jsonb_build_object(p_activity, p_open) where id = p_id returning locks into v;
  if v is null then raise exception 'session not found'; end if;
  return v;
end $$;

create or replace function close_session(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update sessions
  set status = 'done',
      locks = '{"study":true,"identity":false,"finder":false,"promise":false,"pulse":false}'::jsonb
  where id = p_id;
end $$;

-- 3) 제출 함수 (팀 정체성과 같은 규칙) ---------------------------------------------
create or replace function submit_promise(
  p_id uuid, p_slug text, p_team_id uuid, p_team_raw text,
  p_leader text, p_member text, p_routine text, p_device_key text, p_overwrite boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_reason text; v_team uuid; cur team_promises;
begin
  select * into v_session, v_reason from _open_session(p_slug, 'promise');
  if v_session is null then return jsonb_build_object('status', v_reason); end if;

  v_team := _resolve_team(p_team_id, p_team_raw);
  if v_team is null then return jsonb_build_object('status', 'invalid', 'field', 'team'); end if;

  select * into cur from team_promises
  where id = p_id or (session_id = v_session and team_id = v_team)
  order by (id = p_id) desc limit 1
  for update;

  if found then
    if cur.id <> p_id and not p_overwrite then
      return jsonb_build_object('status', 'exists');
    end if;
    begin  -- 이력 + 수정은 함께 성공하거나 함께 취소
      if (cur.leader, cur.member, cur.routine) is distinct from (p_leader, p_member, p_routine) then
        insert into team_promise_revisions (promise_id, leader, member, routine)
        values (cur.id, cur.leader, cur.member, cur.routine);
      end if;
      update team_promises
      set team_id = v_team, team_name_raw = nullif(btrim(coalesce(p_team_raw, '')), ''),
          leader = p_leader, member = p_member, routine = p_routine, device_key = p_device_key
      where id = cur.id;
    exception when unique_violation then
      return jsonb_build_object('status', 'exists');
    end;
    return jsonb_build_object('status', 'updated', 'id', cur.id);
  end if;

  begin
    insert into team_promises (id, session_id, team_id, team_name_raw, leader, member, routine, device_key)
    values (p_id, v_session, v_team, nullif(btrim(coalesce(p_team_raw, '')), ''), p_leader, p_member, p_routine, p_device_key);
  exception when unique_violation then
    return jsonb_build_object('status', 'exists');   -- 같은 팀의 다른 사람이 방금 제출
  end;
  return jsonb_build_object('status', 'created', 'id', p_id);
end $$;
revoke all on function submit_promise(uuid, text, uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function submit_promise(uuid, text, uuid, text, text, text, text, text, boolean) to service_role;

-- 4) 개인다짐 제거 -----------------------------------------------------------------
drop view session_stats;
drop function submit_pledge(uuid, text, uuid, text, text, text, text, text);
drop table pledges;

create view session_stats with (security_invoker = true) as
select
  s.id as session_id,
  (select count(*) from team_identities t    where t.session_id = s.id and not t.hidden) as identities,
  (select count(*) from finder_submissions f where f.session_id = s.id and not f.hidden) as finders,
  (select count(*) from team_promises p      where p.session_id = s.id and not p.hidden) as promises,
  (select count(*) from pulses u             where u.session_id = s.id) as pulses
from sessions s;
revoke all on session_stats from anon;
grant select on session_stats to authenticated, service_role;

-- 5) 팀 병합: 실천약속 포함 ---------------------------------------------------------
create or replace function merge_team(p_from uuid, p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare moved int := 0; conflicts int := 0; n int; t text;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_from = p_to then raise exception '같은 팀으로는 병합할 수 없습니다'; end if;
  perform 1 from teams where id = p_from and status = 'pending' for update;
  if not found then raise exception '미등록 팀이 아닙니다'; end if;
  perform 1 from teams where id = p_to and status = 'active';
  if not found then raise exception '병합 대상은 명부의 활성 팀이어야 합니다'; end if;

  -- 세 테이블 모두 (차수, 팀) 유일 → 같은 차수에 대상 팀의 제출이 이미 있으면 옮기지 않고 숨긴다 (삭제 없음)
  foreach t in array array['team_identities', 'finder_submissions', 'team_promises'] loop
    execute format('update %1$I x set hidden = true where x.team_id = $1 and exists (select 1 from %1$I o where o.team_id = $2 and o.session_id = x.session_id)', t) using p_from, p_to;
    get diagnostics n = row_count; conflicts := conflicts + n;
    execute format('update %1$I x set team_id = $2 where x.team_id = $1 and not exists (select 1 from %1$I o where o.team_id = $2 and o.session_id = x.session_id)', t) using p_from, p_to;
    get diagnostics n = row_count; moved := moved + n;
  end loop;

  update teams set status = 'merged', merged_into = p_to where id = p_from;
  return jsonb_build_object('moved', moved, 'conflicts', conflicts);
end $$;

-- 6) 현황판 집계 --------------------------------------------------------------------
-- 단어 정리: 문장부호 제거 → 서술어 꼬리(합니다 등)·조사 제거(2글자 이상 남을 때만) → 기능어 제외
create or replace function _word_stem(p text) returns text
language plpgsql immutable as $$
declare w text := regexp_replace(p, '[[:punct:]“”‘’·…]', '', 'g'); s text;
begin
  s := regexp_replace(w, '(하겠습니다|했습니다|합니다|입니다|않습니다|습니다|한다|하기)$', '');
  if char_length(s) >= 2 then w := s; elsif s = '' then return ''; end if;
  s := regexp_replace(w, '(으로|에서|에게|까지|부터|을|를|이|가|은|는|의|에|로|와|과|도)$', '');
  if char_length(s) >= 2 then w := s; end if;
  return w;
end $$;

create or replace function dashboard_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  with sess as (
    select s.*, coalesce(s.actual, s.expected, 0) as people
    from sessions s
    where s.status <> 'canceled'
  ),
  ident as (select t.* from team_identities t join sess on sess.id = t.session_id where not t.hidden),
  fin   as (select f.* from finder_submissions f join sess on sess.id = f.session_id where not f.hidden),
  pr    as (select p.* from team_promises p join sess on sess.id = p.session_id where not p.hidden),
  pu    as (select u.* from pulses u join sess on sess.id = u.session_id),
  -- 인재상: 같은 단어가 Heritage/Future 어느 쪽에서 더 불렸는가
  hf as (
    select w, sum(h)::int as h, sum(f)::int as f from (
      select h_adj as w, 1 as h, 0 as f from fin union all select h_noun, 1, 0 from fin
      union all select f_adj, 0, 1 from fin union all select f_noun, 0, 1 from fin
    ) t group by w
  ),
  -- 팀 정체성 슬롯별 어절 빈도 (goal 슬롯은 이미 짧은 구라 단순 빈도로 충분 — SPEC §5.2)
  words as (
    select slot, regexp_replace(raw, '[[:punct:]“”‘’·…]', '', 'g') as w
    from ident,
      lateral (values ('goal', goal), ('work', work), ('dna', dna)) v(slot, txt),
      lateral regexp_split_to_table(txt, '\s+') raw
  ),
  freq as (
    select slot, w, count(*) as c, row_number() over (partition by slot order by count(*) desc, w) as rn
    from words
    where w <> '' and w not in ('더','및','등','그','이','수','것','할','한','될','된','위한','통해','대한','있는','하는','우리','우리의')
    group by slot, w
  ),
  -- 팀 실천약속: 카테고리별 핵심 단어 (한 팀이 같은 단어를 여러 번 써도 1번으로 센다)
  pwords as (
    select distinct p.id, slot, _word_stem(raw) as w
    from pr p,
      lateral (values ('leader', p.leader), ('member', p.member), ('routine', p.routine)) v(slot, txt),
      lateral regexp_split_to_table(txt, '\s+') raw
  ),
  pfreq as (
    select slot, w, count(*) as c, row_number() over (partition by slot order by count(*) desc, w) as rn
    from pwords
    where char_length(w) >= 2
      and w not in ('리더','팀원','우리','팀','우리팀','서로','항상','매일','매주','모든','모두','함께','먼저','위해','대해','통해','위한','대한','있는','하는','하고','하며','한다','합니다','않는','않고','것','수','더','및','등','때','그','이')
    group by slot, w
  )
  select jsonb_build_object(
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'no', display_no, 'date', date, 'status', status,
        'place', nullif(concat_ws(' ', location, room), ''), 'people', people,
        'provisional', actual is null
      ) order by date nulls last,
                 case when display_no ~ '^\d+$' then display_no::int else 0 end, display_no)
      from sess), '[]'::jsonb),
    'people', (select coalesce(sum(people), 0) from sess where status in ('done', 'running')),
    'teams_with_identity', (select count(distinct team_id) from ident),
    'identities', (select count(*) from ident),
    'finders', (select count(*) from fin),
    'promises', (select count(*) from pr),
    'teams_with_promise', (select count(distinct team_id) from pr),
    'cloud', coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from freq where slot = 'goal' and rn <= 18), '[]'::jsonb),
    'work_top', coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from freq where slot = 'work' and rn <= 3), '[]'::jsonb),
    'dna_top',  coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from freq where slot = 'dna'  and rn <= 3), '[]'::jsonb),
    'promise_words', jsonb_build_object(
      'leader',  coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from pfreq where slot = 'leader'  and rn <= 7), '[]'::jsonb),
      'member',  coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from pfreq where slot = 'member'  and rn <= 7), '[]'::jsonb),
      'routine', coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from pfreq where slot = 'routine' and rn <= 7), '[]'::jsonb)),
    'heritage', coalesce((
      select jsonb_agg(jsonb_build_array(k, c) order by c desc, k)
      from (select h_adj || ' ' || h_noun as k, count(*) as c from fin group by 1 order by 2 desc, 1 limit 4) r), '[]'::jsonb),
    'future', coalesce((
      select jsonb_agg(jsonb_build_array(k, c) order by c desc, k)
      from (select f_adj || ' ' || f_noun as k, count(*) as c from fin group by 1 order by 2 desc, 1 limit 4) r), '[]'::jsonb),
    'hf_words', coalesce((
      select jsonb_agg(jsonb_build_array(w, h, f) order by h + f desc, w)
      from (select * from hf order by h + f desc, w limit 60) x), '[]'::jsonb),
    'pulse', (
      select jsonb_build_object(
        'n', count(*),
        -- 응답률 분모: 완료된 차수 + (진행 중이면서 Pulse 응답이 1건 이상 들어온 차수)의 인원. 콘솔 Pulse 분석과 같은 기준.
        'people', (select coalesce(sum(s.people), 0) from sess s
                   where s.status = 'done'
                      or (s.status = 'running' and exists (select 1 from pulses u where u.session_id = s.id))),
        'q', case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(
          jsonb_build_array(round(avg(q1_pre), 2), round(avg(q1_post), 2)),
          jsonb_build_array(round(avg(q2_pre), 2), round(avg(q2_post), 2)),
          jsonb_build_array(round(avg(q3_pre), 2), round(avg(q3_post), 2)),
          jsonb_build_array(round(avg(q4_pre), 2), round(avg(q4_post), 2))) end)
      from pu)
  ) into result;
  return result;
end $$;

revoke all on function _word_stem(text) from public, anon, authenticated;
revoke all on function dashboard_data() from public, anon, authenticated;
grant execute on function dashboard_data() to service_role;
