-- Pulse 응답률 분모 통일 (현황판 = 콘솔).
-- 이전: 현황판은 완료·진행 중 전체 인원, 콘솔은 응답이 있는 차수만(정원 미반영) → Pulse를 아직 열지 않은 차수가 있으면 두 값이 달랐다.
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

revoke all on function dashboard_data() from public, anon, authenticated;
grant execute on function dashboard_data() to service_role;
