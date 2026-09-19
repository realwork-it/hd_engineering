-- 운영 점검에서 나온 결함 수정

-- (1) 활동 토글을 원자적으로: 읽고-고쳐-쓰기는 두 사람이 같은 차수의 서로 다른 활동을 동시에 켤 때 한쪽을 덮어쓴다.
create or replace function set_session_lock(p_id uuid, p_activity text, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_activity not in ('study','identity','finder','pledge','pulse') then raise exception 'unknown activity'; end if;
  update sessions set locks = locks || jsonb_build_object(p_activity, p_open) where id = p_id returning locks into v;
  if v is null then raise exception 'session not found'; end if;
  return v;
end $$;
revoke all on function set_session_lock(uuid, text, boolean) from public, anon;
grant execute on function set_session_lock(uuid, text, boolean) to authenticated;

-- 차수 종료: 상태 변경과 전체 잠금을 한 번에 (종료 후 뒤늦은 제출·장난 방지)
create or replace function close_session(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update sessions
  set status = 'done',
      locks = '{"study":true,"identity":false,"finder":false,"pledge":false,"pulse":false}'::jsonb
  where id = p_id;
end $$;
revoke all on function close_session(uuid) from public, anon;
grant execute on function close_session(uuid) to authenticated;

-- (2) 병합된 팀은 병합 대상으로 따라가게 한다.
--     참여자 기기에는 예전 팀(id 또는 직접 입력한 이름)이 기억돼 있어, 병합 뒤에도 그 값으로 제출이 들어온다.
alter table teams add column merged_into uuid references teams;

create or replace function _resolve_team(p_team_id uuid, p_raw text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t teams; v_raw text := nullif(btrim(coalesce(p_raw, '')), '');
begin
  if p_team_id is not null then
    select * into t from teams where id = p_team_id;
  end if;
  if t.id is null and v_raw is not null and char_length(v_raw) <= 60 then
    select * into t from teams where lower(name) = lower(v_raw)
    order by (status = 'active') desc, (status = 'pending') desc limit 1;
  end if;

  -- 병합 체인을 따라간다 (최대 5단계 — 순환 방지)
  for i in 1..5 loop
    exit when t.id is null or t.status <> 'merged';
    if t.merged_into is null then t := null; exit; end if;
    select * into t from teams where id = t.merged_into;
  end loop;
  if t.id is not null and t.status <> 'merged' then return t.id; end if;

  if v_raw is null or char_length(v_raw) > 60 then return null; end if;
  insert into teams (name, org_name, status) values (v_raw, '(미등록)', 'pending')
  on conflict (name) do update set status = 'pending', merged_into = null   -- 대상 없이 병합됐던 이름이면 큐로 되살린다
  returning id into t.id;
  return t.id;
end $$;
revoke all on function _resolve_team(uuid, text) from public, anon, authenticated;
grant execute on function _resolve_team(uuid, text) to service_role;

-- merge_team: 병합 대상 기록
create or replace function merge_team(p_from uuid, p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare moved int := 0; conflicts int := 0; n int;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_from = p_to then raise exception '같은 팀으로는 병합할 수 없습니다'; end if;
  perform 1 from teams where id = p_from and status = 'pending' for update;
  if not found then raise exception '미등록 팀이 아닙니다'; end if;
  perform 1 from teams where id = p_to and status = 'active';
  if not found then raise exception '병합 대상은 명부의 활성 팀이어야 합니다'; end if;

  update team_identities t set hidden = true
  where t.team_id = p_from and exists (select 1 from team_identities o where o.team_id = p_to and o.session_id = t.session_id);
  get diagnostics n = row_count; conflicts := conflicts + n;
  update team_identities t set team_id = p_to
  where t.team_id = p_from and not exists (select 1 from team_identities o where o.team_id = p_to and o.session_id = t.session_id);
  get diagnostics n = row_count; moved := moved + n;

  update finder_submissions t set hidden = true
  where t.team_id = p_from and exists (select 1 from finder_submissions o where o.team_id = p_to and o.session_id = t.session_id);
  get diagnostics n = row_count; conflicts := conflicts + n;
  update finder_submissions t set team_id = p_to
  where t.team_id = p_from and not exists (select 1 from finder_submissions o where o.team_id = p_to and o.session_id = t.session_id);
  get diagnostics n = row_count; moved := moved + n;

  update pledges set team_id = p_to where team_id = p_from;
  get diagnostics n = row_count; moved := moved + n;

  update teams set status = 'merged', merged_into = p_to where id = p_from;
  return jsonb_build_object('moved', moved, 'conflicts', conflicts);
end $$;

-- (3) 현황판 인원: 실참석 → 예상 → 정원 순으로 잠정 집계.
--     예상 인원이 비어 있으면 진행 중 내내 누적 인원이 0명으로 보이던 문제. (실참석 입력 시 확정값으로 대체)
create or replace function dashboard_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  with sess as (
    select s.*, coalesce(s.actual, s.expected, s.capacity, 0) as people
    from sessions s
    where s.status <> 'canceled'
  ),
  ident as (select t.* from team_identities t join sess on sess.id = t.session_id where not t.hidden),
  fin   as (select f.* from finder_submissions f join sess on sess.id = f.session_id where not f.hidden),
  pl    as (select p.* from pledges p join sess on sess.id = p.session_id where not p.hidden),
  pu    as (select u.* from pulses u join sess on sess.id = u.session_id),
  -- 다짐: 단어 단위 상위 7 + 그 사이 조합(연결)
  top_adj  as (select adj as w, count(*) as c from pl group by 1 order by 2 desc, 1 limit 7),
  top_noun as (select noun as w, count(*) as c from pl group by 1 order by 2 desc, 1 limit 7),
  links as (
    select p.adj as a, p.noun as n, count(*) as c from pl p
    where p.adj in (select w from top_adj) and p.noun in (select w from top_noun)
    group by 1, 2
  ),
  -- 인재상: 같은 단어가 Heritage/Future 어느 쪽에서 더 불렸는가
  hf as (
    select w, sum(h)::int as h, sum(f)::int as f from (
      select h_adj as w, 1 as h, 0 as f from fin union all select h_noun, 1, 0 from fin
      union all select f_adj, 0, 1 from fin union all select f_noun, 0, 1 from fin
    ) t group by w
  ),
  -- 슬롯별 어절 빈도 (goal 슬롯은 이미 짧은 구라 단순 빈도로 충분 — SPEC §5.2)
  words as (
    select slot, regexp_replace(raw, '[[:punct:]“”‘’·…]', '', 'g') as w
    from ident,
      lateral (values ('goal', goal), ('work', work), ('dna', dna)) v(slot, txt),
      lateral regexp_split_to_table(txt, '\s+') raw
  ),
  freq as (
    select slot, w, count(*) as c, row_number() over (partition by slot order by count(*) desc, w) as rn
    from words
    where w <> '' and w not in ('더','및','등','그','이','수','것','할','한','될','된','위한','통해','대한','있는','하는','우리','우리의')  -- 의미 없는 기능어
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
    'pledges', (select count(*) from pl),
    'pledges_custom', (select count(*) from pl where adj_custom or noun_custom),
    'finders', (select count(*) from fin),
    'cloud', coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from freq where slot = 'goal' and rn <= 18), '[]'::jsonb),
    'work_top', coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from freq where slot = 'work' and rn <= 3), '[]'::jsonb),
    'dna_top',  coalesce((select jsonb_agg(jsonb_build_array(w, c) order by rn) from freq where slot = 'dna'  and rn <= 3), '[]'::jsonb),
    'ranks', coalesce((
      select jsonb_agg(jsonb_build_array(k, c) order by c desc, k)
      from (select adj || ' ' || noun as k, count(*) as c from pl group by 1 order by 2 desc, 1 limit 8) r), '[]'::jsonb),
    'heritage', coalesce((
      select jsonb_agg(jsonb_build_array(k, c) order by c desc, k)
      from (select h_adj || ' ' || h_noun as k, count(*) as c from fin group by 1 order by 2 desc, 1 limit 4) r), '[]'::jsonb),
    'future', coalesce((
      select jsonb_agg(jsonb_build_array(k, c) order by c desc, k)
      from (select f_adj || ' ' || f_noun as k, count(*) as c from fin group by 1 order by 2 desc, 1 limit 4) r), '[]'::jsonb),
    'pledge_flow', jsonb_build_object(
      'adj',  coalesce((select jsonb_agg(jsonb_build_array(w, c) order by c desc, w) from top_adj), '[]'::jsonb),
      'noun', coalesce((select jsonb_agg(jsonb_build_array(w, c) order by c desc, w) from top_noun), '[]'::jsonb),
      'links', coalesce((select jsonb_agg(jsonb_build_array(a, n, c) order by c desc, a, n) from links), '[]'::jsonb)),
    'hf_words', coalesce((
      select jsonb_agg(jsonb_build_array(w, h, f) order by h + f desc, w)
      from (select * from hf order by h + f desc, w limit 60) x), '[]'::jsonb),
    'pulse', (
      select jsonb_build_object(
        'n', count(*),
        'q', case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(
          jsonb_build_array(round(avg(q1_pre), 2), round(avg(q1_post), 2)),
          jsonb_build_array(round(avg(q2_pre), 2), round(avg(q2_post), 2)),
          jsonb_build_array(round(avg(q3_pre), 2), round(avg(q3_post), 2)),
          jsonb_build_array(round(avg(q4_pre), 2), round(avg(q4_post), 2))) end)
      from pu)
  ) into result;
  return result;
end $$;

revoke all on function dashboard_data() from public, anon, authenticated;
grant execute on function dashboard_data() to service_role;
