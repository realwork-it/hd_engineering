-- M3 — 현황판 집계 + 파일럿 개념 제거
-- (운영 결정) 파일럿 차수 없이 정규 40차수만 진행한다. SPEC R12·include_pilot은 폐기.
delete from sessions s
where s.status = 'pilot'
  and not exists (select 1 from team_identities x where x.session_id = s.id)
  and not exists (select 1 from finder_submissions x where x.session_id = s.id)
  and not exists (select 1 from pledges x where x.session_id = s.id)
  and not exists (select 1 from pulses x where x.session_id = s.id)
  and not exists (select 1 from material_views x where x.session_id = s.id);
update sessions set status = 'confirmed' where status = 'pilot';   -- 데이터가 남아 있던 경우
alter table sessions drop constraint sessions_status_check;
alter table sessions add constraint sessions_status_check
  check (status in ('tbd','confirmed','running','done','canceled'));
delete from app_settings where key = 'include_pilot';

-- 현황판 데이터 (R11: 통계만 — 원문·slug·팀명은 내보내지 않는다). 서비스 롤 전용.
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
  pl    as (select p.* from pledges p join sess on sess.id = p.session_id where not p.hidden),
  pu    as (select u.* from pulses u join sess on sess.id = u.session_id),
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
