-- SPEC.md §3 RLS 원칙
--  · anon: 읽기 최소. 쓰기 없음(모든 제출은 Server Action + 서비스 롤).
--  · authenticated: admin_emails 화이트리스트에 있는 계정만 읽기/추가/수정. 삭제 정책 없음(R14).
--  · 서비스 롤은 RLS를 우회한다.
--
-- SPEC 대비 강화: anon에게 sessions 테이블 select를 열지 않는다. 열면 anon 키로
-- 전체 slug를 열거할 수 있어 R1(slug가 유일한 차수 진실)이 깨진다. 대신 slug를
-- 알고 있는 경우에만 1행을 돌려주는 get_session_hub()를 제공한다.

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;

alter table sessions                enable row level security;
alter table teams                   enable row level security;
alter table team_identities         enable row level security;
alter table team_identity_revisions enable row level security;
alter table finder_submissions      enable row level security;
alter table pledges                 enable row level security;
alter table pulses                  enable row level security;
alter table material_views          enable row level security;
alter table app_settings            enable row level security;
alter table admin_emails            enable row level security;

-- anon 권한을 전부 걷어내고 필요한 것만 다시 부여
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke delete, truncate on all tables in schema public from authenticated;

-- 팀 자동완성(R4): 활성 팀의 이름·조직·실만
grant select (id, name, org_name, sil_name) on teams to anon;
create policy teams_anon_select on teams
  for select to anon using (status = 'active');

-- 허브: slug를 아는 경우에만 표시용 최소 필드 반환
create or replace function get_session_hub(p_slug text)
returns table (display_no text, date date, location text, room text, status text, locks jsonb)
language sql stable security definer set search_path = public as $$
  select s.display_no, s.date, s.location, s.room, s.status, s.locks
  from sessions s
  where s.slug = p_slug and s.status <> 'canceled';
$$;
revoke all on function get_session_hub(text) from public;
grant execute on function get_session_hub(text) to anon, authenticated;

-- 운영자 정책 (select / insert / update)
do $$
declare t text;
begin
  foreach t in array array[
    'sessions','teams','team_identities','team_identity_revisions',
    'finder_submissions','pledges','pulses','material_views','app_settings'
  ] loop
    execute format('create policy %I on %I for select to authenticated using (is_admin())', t || '_admin_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on %I for update to authenticated using (is_admin()) with check (is_admin())', t || '_admin_update', t);
  end loop;
end $$;

-- 화이트리스트 자체는 운영자도 읽기만 (변경은 서비스 롤)
create policy admin_emails_admin_select on admin_emails
  for select to authenticated using (is_admin());
revoke insert, update on admin_emails from authenticated;

-- Pulse는 수정 불가(R8): 운영자 update 정책 제거
drop policy pulses_admin_update on pulses;
revoke update on pulses from authenticated;
