-- M1 — 참여자 제출 함수. Server Action이 서비스 롤로만 호출한다.
-- 한 트랜잭션 안에서 잠금(R3)·팀 해석(R4)·멱등/재제출(R5~R8)·Pool 외 플래그(R9)를 처리.
-- 반환: jsonb { status: 'created'|'updated'|'exists'|'locked'|'not_found'|'invalid', ... }

-- 제출 가능한 차수 조회 + 잠금 확인. 열려 있으면 session id, 아니면 null과 사유.
create or replace function _open_session(p_slug text, p_activity text, out session_id uuid, out reason text)
language plpgsql stable security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where slug = p_slug and status <> 'canceled';
  if not found then reason := 'not_found'; return; end if;
  if coalesce((s.locks ->> p_activity)::boolean, false) is not true then reason := 'locked'; return; end if;
  session_id := s.id;
end $$;

-- R4: 명부 팀 id 또는 원문 → team id. 명부에 없으면 pending 행 생성.
create or replace function _resolve_team(p_team_id uuid, p_raw text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_raw text := nullif(btrim(coalesce(p_raw, '')), '');
begin
  if p_team_id is not null then
    select id into v_id from teams where id = p_team_id and status <> 'merged';
    if found then return v_id; end if;
  end if;
  if v_raw is null or char_length(v_raw) > 60 then return null; end if;

  select id into v_id from teams where lower(name) = lower(v_raw) and status <> 'merged' limit 1;
  if found then return v_id; end if;

  insert into teams (name, org_name, status) values (v_raw, '(미등록)', 'pending')
  on conflict (name) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end $$;

create or replace function _is_custom(p_pool_key text, p_word text) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select value ? p_word from app_settings where key = p_pool_key), false);
$$;

-- 팀 정체성 (R5) ---------------------------------------------------------------
create or replace function submit_identity(
  p_id uuid, p_slug text, p_team_id uuid, p_team_raw text,
  p_work text, p_dna text, p_goal text, p_device_key text, p_overwrite boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_reason text; v_team uuid; cur team_identities;
begin
  select * into v_session, v_reason from _open_session(p_slug, 'identity');
  if v_session is null then return jsonb_build_object('status', v_reason); end if;

  v_team := _resolve_team(p_team_id, p_team_raw);
  if v_team is null then return jsonb_build_object('status', 'invalid', 'field', 'team'); end if;

  -- 같은 멱등키(재시도·본인 수정) 또는 같은 차수·같은 팀
  select * into cur from team_identities
  where id = p_id or (session_id = v_session and team_id = v_team)
  order by (id = p_id) desc limit 1
  for update;

  if found then
    if cur.id <> p_id and not p_overwrite then
      return jsonb_build_object('status', 'exists');
    end if;
    begin  -- 이력 + 수정은 함께 성공하거나 함께 취소
      if (cur.work, cur.dna, cur.goal) is distinct from (p_work, p_dna, p_goal) then
        insert into team_identity_revisions (identity_id, work, dna, goal)
        values (cur.id, cur.work, cur.dna, cur.goal);
      end if;
      update team_identities
      set team_id = v_team, team_name_raw = nullif(btrim(coalesce(p_team_raw, '')), ''),
          work = p_work, dna = p_dna, goal = p_goal, device_key = p_device_key
      where id = cur.id;
    exception when unique_violation then
      return jsonb_build_object('status', 'exists');
    end;
    return jsonb_build_object('status', 'updated', 'id', cur.id);
  end if;

  begin
    insert into team_identities (id, session_id, team_id, team_name_raw, work, dna, goal, device_key)
    values (p_id, v_session, v_team, nullif(btrim(coalesce(p_team_raw, '')), ''), p_work, p_dna, p_goal, p_device_key);
  exception when unique_violation then
    -- 동시 제출 경합: 다른 기기가 방금 같은 팀으로 제출
    return jsonb_build_object('status', 'exists');
  end;
  return jsonb_build_object('status', 'created', 'id', p_id);
end $$;

-- 조별 인재상 (R6: 재제출 = 최신본, 이력 없음) ---------------------------------
create or replace function submit_finder(
  p_id uuid, p_slug text, p_team_id uuid, p_team_raw text,
  p_h_adj text, p_h_noun text, p_f_adj text, p_f_noun text,
  p_why_heritage text, p_why_future text, p_device_key text, p_overwrite boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_reason text; v_team uuid; cur finder_submissions;
begin
  select * into v_session, v_reason from _open_session(p_slug, 'finder');
  if v_session is null then return jsonb_build_object('status', v_reason); end if;

  v_team := _resolve_team(p_team_id, p_team_raw);
  if v_team is null then return jsonb_build_object('status', 'invalid', 'field', 'team'); end if;

  select * into cur from finder_submissions
  where id = p_id or (session_id = v_session and team_id = v_team)
  order by (id = p_id) desc limit 1
  for update;

  if found then
    if cur.id <> p_id and not p_overwrite then
      return jsonb_build_object('status', 'exists');
    end if;
    begin
      update finder_submissions
      set team_id = v_team, team_name_raw = nullif(btrim(coalesce(p_team_raw, '')), ''),
          h_adj = p_h_adj,   h_adj_custom  = _is_custom('pool_adj',  p_h_adj),
          h_noun = p_h_noun, h_noun_custom = _is_custom('pool_noun', p_h_noun),
          f_adj = p_f_adj,   f_adj_custom  = _is_custom('pool_adj',  p_f_adj),
          f_noun = p_f_noun, f_noun_custom = _is_custom('pool_noun', p_f_noun),
          why_heritage = p_why_heritage, why_future = p_why_future, device_key = p_device_key
      where id = cur.id;
    exception when unique_violation then
      return jsonb_build_object('status', 'exists');
    end;
    return jsonb_build_object('status', 'updated', 'id', cur.id);
  end if;

  begin
    insert into finder_submissions (
      id, session_id, team_id, team_name_raw,
      h_adj, h_adj_custom, h_noun, h_noun_custom, f_adj, f_adj_custom, f_noun, f_noun_custom,
      why_heritage, why_future, device_key)
    values (
      p_id, v_session, v_team, nullif(btrim(coalesce(p_team_raw, '')), ''),
      p_h_adj, _is_custom('pool_adj', p_h_adj), p_h_noun, _is_custom('pool_noun', p_h_noun),
      p_f_adj, _is_custom('pool_adj', p_f_adj), p_f_noun, _is_custom('pool_noun', p_f_noun),
      p_why_heritage, p_why_future, p_device_key);
  exception when unique_violation then
    return jsonb_build_object('status', 'exists');
  end;
  return jsonb_build_object('status', 'created', 'id', p_id);
end $$;

-- 개인다짐 (R7: 같은 기기 = 수정, 다른 기기 = 신규) ------------------------------
create or replace function submit_pledge(
  p_id uuid, p_slug text, p_team_id uuid, p_team_raw text,
  p_adj text, p_noun text, p_action text, p_device_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_reason text; v_team uuid; v_cur uuid;
begin
  select * into v_session, v_reason from _open_session(p_slug, 'pledge');
  if v_session is null then return jsonb_build_object('status', v_reason); end if;

  v_team := _resolve_team(p_team_id, p_team_raw);
  if v_team is null then return jsonb_build_object('status', 'invalid', 'field', 'team'); end if;

  for attempt in 1..2 loop
    select id into v_cur from pledges
    where id = p_id or (session_id = v_session and device_key = p_device_key)
    order by (id = p_id) desc limit 1
    for update;

    if found then
      update pledges
      set team_id = v_team, team_name_raw = nullif(btrim(coalesce(p_team_raw, '')), ''),
          adj = p_adj, adj_custom = _is_custom('pool_adj', p_adj),
          noun = p_noun, noun_custom = _is_custom('pool_noun', p_noun),
          action = p_action
      where id = v_cur;
      return jsonb_build_object('status', 'updated', 'id', v_cur);
    end if;

    begin
      insert into pledges (id, session_id, team_id, team_name_raw, adj, adj_custom, noun, noun_custom, action, device_key)
      values (p_id, v_session, v_team, nullif(btrim(coalesce(p_team_raw, '')), ''),
              p_adj, _is_custom('pool_adj', p_adj), p_noun, _is_custom('pool_noun', p_noun),
              p_action, p_device_key);
      return jsonb_build_object('status', 'created', 'id', p_id);
    exception when unique_violation then
      null; -- 더블탭 경합: 다시 조회해서 update
    end;
  end loop;
  return jsonb_build_object('status', 'invalid', 'field', 'retry');
end $$;

-- Pulse (R8: insert only, 식별자 없음) ------------------------------------------
create or replace function submit_pulse(
  p_id uuid, p_slug text, p_scores smallint[], p_open_text text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_reason text;
begin
  select * into v_session, v_reason from _open_session(p_slug, 'pulse');
  if v_session is null then return jsonb_build_object('status', v_reason); end if;
  if array_length(p_scores, 1) is distinct from 8 then
    return jsonb_build_object('status', 'invalid', 'field', 'scores');
  end if;

  insert into pulses (id, session_id, q1_pre, q1_post, q2_pre, q2_post, q3_pre, q3_post, q4_pre, q4_post, open_text)
  values (p_id, v_session, p_scores[1], p_scores[2], p_scores[3], p_scores[4],
          p_scores[5], p_scores[6], p_scores[7], p_scores[8], p_open_text)
  on conflict (id) do nothing;   -- 재시도 = 멱등
  return jsonb_build_object('status', 'created', 'id', p_id);
end $$;

-- 학습자료 (R15): 조회 로그 + 리다이렉트 URL -------------------------------------
create or replace function log_study_view(p_slug text, p_device_key text) returns text
language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_reason text; v_url text;
begin
  select * into v_session, v_reason from _open_session(p_slug, 'study');
  if v_session is null then return null; end if;
  insert into material_views (session_id, device_key) values (v_session, p_device_key);
  select coalesce(s.study_url, (select value #>> '{}' from app_settings where key = 'study_default_url'))
    into v_url from sessions s where s.id = v_session;
  return v_url;
end $$;

-- Supabase 기본 권한은 새 함수 실행을 anon·authenticated에도 준다 → 서비스 롤만 남긴다.
do $$
declare f text;
begin
  foreach f in array array[
    '_open_session(text, text)', '_resolve_team(uuid, text)', '_is_custom(text, text)',
    'submit_identity(uuid, text, uuid, text, text, text, text, text, boolean)',
    'submit_finder(uuid, text, uuid, text, text, text, text, text, text, text, text, boolean)',
    'submit_pledge(uuid, text, uuid, text, text, text, text, text)',
    'submit_pulse(uuid, text, smallint[], text)',
    'log_study_view(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
grant execute on function get_session_hub(text) to service_role;
