-- 운영 실수 방지: FT가 '진행 시작'을 누르지 않고 바로 활동 토글부터 켜는 경우가 흔하다.
-- 그러면 차수가 '미정/확정'에 머물러 현황판의 진행 중 표시·누적 인원·Pulse 응답률 분모에서 빠진다.
-- → 시험공부 외의 활동을 '여는' 순간, 아직 시작 전인 차수는 자동으로 '진행 중'이 된다.
create or replace function set_session_lock(p_id uuid, p_activity text, p_open boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if p_activity not in ('study','identity','finder','promise','pulse') then raise exception 'unknown activity'; end if;
  update sessions
  set locks = locks || jsonb_build_object(p_activity, p_open),
      status = case when p_open and p_activity <> 'study' and status in ('tbd', 'confirmed') then 'running' else status end
  where id = p_id
  returning locks into v;
  if v is null then raise exception 'session not found'; end if;
  return v;
end $$;
