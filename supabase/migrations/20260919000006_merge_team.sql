-- M4 — 미등록(pending) 팀을 기존 팀에 병합: 제출물의 team_id 일괄 치환 + pending 행 merged 처리.
-- 같은 차수에 대상 팀의 제출이 이미 있으면(unique 충돌) 옮기지 않고 숨김 처리한다 — 삭제는 없다(R14).
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

  update teams set status = 'merged' where id = p_from;
  return jsonb_build_object('moved', moved, 'conflicts', conflicts);
end $$;

revoke all on function merge_team(uuid, uuid) from public, anon;
grant execute on function merge_team(uuid, uuid) to authenticated;
