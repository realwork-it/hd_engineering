-- 차수 자동 종료: 날짜가 지난 '진행 중' 차수는 FT·운영자가 누르지 않아도 종료된다.
--  · 종료 = 상태 '완료' + 시험공부 자료를 뺀 모든 활동 잠금 (수동 '차수 종료'와 동일)
--  · 기준은 한국 시간(KST) 날짜. 당일에는 절대 닫지 않는다(저녁까지 이어지는 차수 보호).
--  · 시작한 적 없는 차수(미정·확정)는 건드리지 않는다.
create or replace function auto_close_sessions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update sessions
  set status = 'done',
      locks = '{"study":true,"identity":false,"finder":false,"promise":false,"pulse":false}'::jsonb
  where status = 'running'
    and date is not null
    and date < (now() at time zone 'Asia/Seoul')::date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function auto_close_sessions() from public, anon, authenticated;
grant execute on function auto_close_sessions() to service_role;

-- 매일 00:05 KST(= 15:05 UTC)에 실행. pg_cron이 없는 환경(로컬 테스트용 임베디드 Postgres)에서는 건너뛴다 —
-- 그 경우에도 앱이 콘솔·현황판을 열 때마다 같은 함수를 부르므로 결과는 같다.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'hec-auto-close-sessions';
  perform cron.schedule('hec-auto-close-sessions', '5 15 * * *', 'select public.auto_close_sessions()');
exception when others then
  raise notice 'pg_cron을 쓸 수 없어 예약을 건너뜁니다: %', sqlerrm;
end $$;
