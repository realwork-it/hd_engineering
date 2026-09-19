-- SPEC.md §3 — 스키마
-- 모든 참여자 쓰기는 Server Action(서비스 롤) 경유. RLS는 20260919000002_rls.sql.

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 차수 -----------------------------------------------------------------------
create table sessions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- URL 토큰, 불변 (R2)
  display_no text not null,                  -- '1'~'40', 'P1','P2' — 수정 가능한 라벨
  date date,                                 -- null = 미정
  location text,
  room text,
  capacity int,
  expected int,
  actual int,                                -- 실참석(종료 시 입력, R13)
  ft_name text,
  status text not null default 'tbd'
    check (status in ('pilot','tbd','confirmed','running','done','canceled')),
  locks jsonb not null default '{"study":true,"identity":false,"finder":false,"pledge":false,"pulse":false}',
  study_url text,                            -- null이면 app_settings.study_default_url
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_date_idx on sessions (date);
create trigger sessions_updated_at before update on sessions
  for each row execute function set_updated_at();

-- slug는 불변 (R2)
create or replace function sessions_slug_immutable() returns trigger
language plpgsql as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'sessions.slug is immutable';
  end if;
  return new;
end $$;
create trigger sessions_slug_immutable before update on sessions
  for each row execute function sessions_slug_immutable();

-- 팀 명부 --------------------------------------------------------------------
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  org_name text not null,                    -- 감사실·사장직속 포함 11개 조직
  sil_name text,                             -- null = 본부 직속 등
  headcount int,
  status text not null default 'active'
    check (status in ('active','pending','merged'))
);
create index teams_status_idx on teams (status);

-- 팀 정체성 ------------------------------------------------------------------
create table team_identities (
  id uuid primary key,                       -- 클라이언트 생성 uuid = 멱등키
  session_id uuid not null references sessions,
  team_id uuid references teams,
  team_name_raw text,
  work text not null,
  dna text not null,
  goal text not null,
  hidden bool not null default false,
  device_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, team_id)               -- R5: 같은 차수·같은 팀 = 1건
);
create index team_identities_team_idx on team_identities (team_id);
create trigger team_identities_updated_at before update on team_identities
  for each row execute function set_updated_at();

create table team_identity_revisions (
  id bigserial primary key,
  identity_id uuid not null references team_identities,
  work text, dna text, goal text,
  saved_at timestamptz not null default now()
);
create index team_identity_revisions_identity_idx on team_identity_revisions (identity_id);

-- 조별 인재상 ----------------------------------------------------------------
create table finder_submissions (
  id uuid primary key,
  session_id uuid not null references sessions,
  team_id uuid references teams,
  team_name_raw text,
  h_adj text not null,  h_adj_custom bool not null default false,
  h_noun text not null, h_noun_custom bool not null default false,
  f_adj text not null,  f_adj_custom bool not null default false,
  f_noun text not null, f_noun_custom bool not null default false,
  why_heritage text check (char_length(why_heritage) <= 300),
  why_future text check (char_length(why_future) <= 300),
  hidden bool not null default false,
  device_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, team_id)
);
create index finder_submissions_team_idx on finder_submissions (team_id);
create trigger finder_submissions_updated_at before update on finder_submissions
  for each row execute function set_updated_at();

-- 개인다짐 (익명 — 팀만) -----------------------------------------------------
create table pledges (
  id uuid primary key,
  session_id uuid not null references sessions,
  team_id uuid references teams,
  team_name_raw text,
  adj text not null,  adj_custom bool not null default false,
  noun text not null, noun_custom bool not null default false,
  action text not null check (char_length(action) between 1 and 80),
  hidden bool not null default false,
  device_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pledges_session_idx on pledges (session_id);
create index pledges_team_idx on pledges (team_id);
-- R7: 같은 차수·같은 기기 재제출 = UPDATE
create unique index pledges_session_device_uniq on pledges (session_id, device_key)
  where device_key is not null;
create trigger pledges_updated_at before update on pledges
  for each row execute function set_updated_at();

-- Pulse (완전 익명 — 차수만, insert only. 팀·기기 식별자 컬럼 없음: R8, DoD 7) ---
create table pulses (
  id uuid primary key,
  session_id uuid not null references sessions,
  q1_pre smallint not null check (q1_pre between 1 and 7),
  q1_post smallint not null check (q1_post between 1 and 7),
  q2_pre smallint not null check (q2_pre between 1 and 7),
  q2_post smallint not null check (q2_post between 1 and 7),
  q3_pre smallint not null check (q3_pre between 1 and 7),
  q3_post smallint not null check (q3_post between 1 and 7),
  q4_pre smallint not null check (q4_pre between 1 and 7),
  q4_post smallint not null check (q4_post between 1 and 7),
  open_text text not null check (char_length(open_text) between 10 and 300),
  created_at timestamptz not null default now()
);
create index pulses_session_idx on pulses (session_id);

-- 학습자료 조회 로그 ---------------------------------------------------------
create table material_views (
  id bigserial primary key,
  session_id uuid references sessions,
  device_key text,
  viewed_at timestamptz not null default now()
);
create index material_views_session_idx on material_views (session_id);

-- 설정 -----------------------------------------------------------------------
create table app_settings (
  key text primary key,
  value jsonb
);

-- 운영자 이메일 화이트리스트 -------------------------------------------------
create table admin_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
