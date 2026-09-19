-- M2 — 차수 관리 표의 '조회·제출' 집계. security_invoker라 호출자의 RLS(is_admin)가 그대로 적용된다.
create view session_stats with (security_invoker = true) as
select
  s.id as session_id,
  (select count(distinct coalesce(v.device_key, v.id::text)) from material_views v where v.session_id = s.id) as study_views,
  (select count(*) from team_identities t    where t.session_id = s.id and not t.hidden) as identities,
  (select count(*) from finder_submissions f where f.session_id = s.id and not f.hidden) as finders,
  (select count(*) from pledges p            where p.session_id = s.id and not p.hidden) as pledges,
  (select count(*) from pulses u             where u.session_id = s.id) as pulses
from sessions s;

revoke all on session_stats from anon;
grant select on session_stats to authenticated, service_role;
