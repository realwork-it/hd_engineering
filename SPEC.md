# 현대엔지니어링 가치체계 내재화 워크숍 — 다차수 운영시스템 개발 설계서

> **버전**: v1.0 (동결본) · 작성: 리얼워크 × Claude
> **구현 도구**: Claude Code · **저장소**: https://github.com/realwork-it/hd_engineering
> **인프라**: Supabase 프로젝트 `hd_engineering`(생성 완료) · Vercel(미생성 — M0에서 연결)
> **화면 명세**: 저장소 `/docs/prototypes/`의 HTML 3종이 곧 화면 명세입니다. 이 문서와 프로토타입이 충돌하면 **이 문서가 우선**합니다.

---

## 0. 시스템 한 줄 정의

40차수(+파일럿 2), 총 2,659명이 참여하는 가치체계 내재화 워크숍의 **① 실시간 현황판, ② 차수별 링크·QR 발급과 데이터 수집, ③ 수집 결과 시각화·관리**를 담당하는 웹 시스템. 사용자군은 3층: **참여자**(모바일, 무인증), **고객사 뷰어**(현황판, 토큰 링크), **운영자**(콘솔, 로그인).

---

## 1. 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 14+ (App Router, TypeScript) | Vercel 배포 |
| DB/백엔드 | Supabase (Postgres + RLS + Auth + Realtime) | 프로젝트명 `hd_engineering` |
| 스타일 | Tailwind CSS | 토큰은 §9 디자인 시스템 참조 |
| 폰트 | Pretendard (jsdelivr CDN + 시스템 폴백) | 프로토타입과 동일 |
| QR | `qrcode` (서버) 또는 `qrcode.react` | 인쇄 시트용 고해상도 |
| 차트 | 현황판은 프로토타입의 수제 SVG/DOM 방식 이식 권장 (라이브러리 無) | 워드클라우드 나선 배치 알고리즘 포함, 프로토타입 JS 참조 |
| 제출 처리 | Next.js Server Actions (검증·멱등성) → Supabase | 참여자 폼은 anon 직접 insert 금지 |

**환경변수** (Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`(서버 전용), `DASHBOARD_TOKEN_SECRET`.

---

## 2. URL 구조

```
참여자 (무인증, 모바일 퍼스트)
  /s/[slug]                # 차수 허브 (§5.1)
  /s/[slug]/study          # 시험공부 → 학습자료 리다이렉트 + 조회 로그 (§5.2)
  /s/[slug]/identity       # 팀 정체성 제출
  /s/[slug]/finder         # 조별 인재상 제출
  /s/[slug]/pledge         # 개인다짐 제출
  /s/[slug]/pulse          # Pulse Check

뷰어
  /dashboard?k=[token]     # 현황판 (토큰 검증, TV/빔 대응)

운영자 (Supabase Auth 이메일 로그인)
  /admin                   # 오늘의 운영
  /admin/sessions          # 차수 관리 (+ /[id]/print QR 인쇄 시트)
  /admin/data              # 수집 데이터 (탭 3종)
  /admin/pulse             # Pulse 분석
  /admin/teams             # 팀 명부 + 미등록 큐
```

`slug`는 **불변 랜덤 토큰**(예: `a7Kq2`, nanoid 6자). 차수 번호(display_no)와 절대 연동하지 않는다 — 번호는 재배열되는 표시 라벨이다(정책 R2).

---

## 3. DB 스키마

```sql
-- 차수
create table sessions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- URL 토큰, 불변
  display_no text not null,                  -- '1'~'40', 'P1','P2' — 수정 가능한 라벨
  date date,                                 -- null = 미정
  location text, room text,
  capacity int, expected int, actual int,    -- 정원 / 예상 / 실참석(종료 시 입력)
  ft_name text,
  status text not null default 'tbd',        -- pilot|tbd|confirmed|running|done|canceled
  locks jsonb not null default '{"study":true,"identity":false,"finder":false,"pledge":false,"pulse":false}',
  study_url text,                            -- null이면 app_settings.study_default_url 사용
  note text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- 팀 명부 (시드: seed_teams.csv, 164팀)
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  org_name text not null,                    -- '본부'가 아님: 감사실·사장직속 포함 11개 조직
  sil_name text,                             -- null 허용 (본부 직속 등)
  headcount int,
  status text not null default 'active'      -- active|pending|merged  (pending = 미등록 직접입력분)
);

-- 팀 정체성 (팀당 활성 1건 + 이력)
create table team_identities (
  id uuid primary key,                       -- 클라이언트 생성 uuid = 멱등키
  session_id uuid not null references sessions,
  team_id uuid references teams,
  team_name_raw text,                        -- 명부 매칭 실패 시 원문 보존
  work text not null, dna text not null, goal text not null,   -- 고유업/고유성/지향점 3슬롯 분리 저장
  hidden bool not null default false,
  device_key text,                           -- 재제출=수정 판정 보조
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique(session_id, team_id)                -- 같은 차수·같은 팀 = 1건 (재제출은 UPDATE)
);
create table team_identity_revisions (       -- 수정 이력 보존
  id bigserial primary key, identity_id uuid references team_identities,
  work text, dna text, goal text, saved_at timestamptz default now()
);

-- 조별 인재상 (조별 1건 안내, 데이터는 소속 팀만 기록. 같은 차수·같은 팀 재제출 = UPDATE)
create table finder_submissions (
  id uuid primary key,
  session_id uuid not null references sessions,
  team_id uuid references teams, team_name_raw text,
  h_adj text not null, h_adj_custom bool default false,
  h_noun text not null, h_noun_custom bool default false,
  f_adj text not null, f_adj_custom bool default false,
  f_noun text not null, f_noun_custom bool default false,      -- *_custom = Pool 외 직접 입력 플래그
  why_heritage text, why_future text,                          -- 축별 선정 이유 (각 300자)
  hidden bool default false, device_key text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique(session_id, team_id)
);

-- 개인다짐 (익명 — 팀만 기록, 이름 없음. 같은 기기 재제출 = UPDATE, 타 기기는 신규)
create table pledges (
  id uuid primary key,
  session_id uuid not null references sessions,
  team_id uuid references teams, team_name_raw text,
  adj text not null, adj_custom bool default false,
  noun text not null, noun_custom bool default false,
  action text not null,                                        -- 실천 내용 80자
  hidden bool default false, device_key text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Pulse (완전 익명 — 차수만. 수정 불가, insert only)
create table pulses (
  id uuid primary key,
  session_id uuid not null references sessions,
  q1_pre smallint, q1_post smallint,   -- 가치체계 이해
  q2_pre smallint, q2_post smallint,   -- 가치체계 공감
  q3_pre smallint, q3_post smallint,   -- 팀 연결
  q4_pre smallint, q4_post smallint,   -- 실천 의지
  open_text text not null,             -- 소감·1 Change 통합, 필수, 10~300자
  created_at timestamptz default now(),
  check (q1_pre between 1 and 7) -- q1~q4 pre/post 전부 동일 체크 적용
);

-- 학습자료 조회 로그
create table material_views (
  id bigserial primary key, session_id uuid references sessions,
  device_key text, viewed_at timestamptz default now()
);

-- 설정
create table app_settings (
  key text primary key, value jsonb
);
-- 필수 키: study_default_url ("https://claude.ai/artifact/QpQj6eAVpJ8TDTT1WQXK3G"),
--          dashboard_token, include_pilot (false), pool_adj (배열 50), pool_noun (배열 50)
```

**RLS 원칙**: 참여자 경로는 anon 키로 **읽기 최소**(sessions의 slug·display_no·locks·status만 select 허용, teams는 name/org/sil select 허용). **모든 쓰기는 Server Action(서비스 롤)** 경유 — 서버에서 잠금·글자수·중복을 검증한 뒤 insert/update. 뷰어 현황판은 서버 컴포넌트에서 집계 쿼리(서비스 롤). 운영자는 Supabase Auth `authenticated` + 이메일 화이트리스트.

---

## 4. 비즈니스 규칙 (동결 — 전부 서버에서 강제)

- **R1 차수 식별**: 참여자에게 차수·조 번호를 절대 묻지 않는다. slug가 유일한 차수 진실.
- **R2 번호≠ID**: display_no는 라벨. slug·QR은 번호 변경과 무관하게 유지.
- **R3 허브 순차 공개**: 허브 초기 상태는 시험공부만 열림. 나머지 4개는 **번호+자물쇠만** 표시(활동명 비노출). 운영자가 콘솔 토글을 켜면 참여자 화면에 활동명이 나타난다(Realtime 또는 15초 폴링). **잠긴 활동은 서버가 제출을 거부한다**(UI 잠금만으로 불충분).
- **R4 팀 입력**: 자동완성(2글자 검색, 영문 대소문자 무시). 선택 시 조직·실 표시. 명부에 없으면 원문을 `team_name_raw`로 저장하고 `teams`에 status='pending' 행 생성 → 콘솔 미등록 큐. 팀 선택은 localStorage에 기억되어 이후 폼에 자동 표시(변경 가능).
- **R5 팀 정체성 중복**: 같은 차수·같은 팀 재제출 = "이미 제출된 정체성이 있습니다 — 수정하시겠어요?" 흐름으로 UPDATE(+revisions 이력). **다른 차수·같은 팀 = 별건 저장** + 콘솔에 '복수 제출' 플래그 표시(대형 팀 분할 입과 대응).
- **R6 인재상**: 운영 안내는 "조별 1건", 데이터 필드는 소속 팀만. Heritage 1쌍 + Future 1쌍 + 축별 이유(각 최대 300자). 재제출 규칙은 R5와 동일(이력 없이 최신본).
- **R7 개인다짐**: 익명(이름 없음, 팀만). 같은 device_key 재제출 = 본인 것 수정, 다른 기기 = 신규.
- **R8 Pulse**: 팀을 받지 않는다. 완전 익명, 차수 단위만 집계. 객관식 4문항(전/후 각 1~7) 전부 + 주관식 10자 이상이어야 제출 가능. 수정 불가.
- **R9 콤보박스**: 형용사·명사는 Pool 전체를 **가나다순**으로 표시(포커스 시 전체 칩, 타이핑 시 필터). Pool에 없는 단어는 그대로 확정 가능(점선 칩 표시 + `_custom=true` 저장). Pool은 app_settings에서 로드 — 하드코딩 금지(부록 A가 시드).
- **R10 조사 자동 처리**: 팀 정체성 미리보기·완성 문장은 받침 판정으로 을/를·으로/로 자동 선택. ㄹ받침→로. 한글 외 문자로 끝나면 를/로 기본. 고유업이 '는/은'으로 끝나면 "을 하는"을 생략하고 "○○ 우리는"으로 연결. (프로토타입 `jEul`/`jRo`/`idSegs` 함수를 그대로 이식, 8케이스 테스트 포함: 설계를/검증을/회사를/DNA로/집요함으로/원칙으로/길로/기술로)
- **R11 현황판 공개 범위**: 통계·시각화만. **제출 원문은 절대 표시하지 않는다**(원문은 콘솔 전용 + 엑셀 다운로드).
- **R12 파일럿**: status='pilot' 차수는 현황판 집계에서 기본 제외. app_settings.include_pilot 토글로 포함 가능.
- **R13 참여 인원**: 현황판 누적 인원의 진실은 sessions.actual(운영자 입력). 미입력 차수는 expected로 잠정 집계하되 콘솔에 미입력 경고.
- **R14 숨김·재지정**: 콘솔에서 모든 제출물에 숨김(soft delete, hidden=true — 집계 제외)과 차수 재지정 가능. 삭제는 없다.
- **R15 학습자료**: /s/[slug]/study는 조회 로그 기록 후 study_url(없으면 기본값)로 302 리다이렉트. 아티팩트 장애 시 운영자가 URL만 교체하면 인쇄된 QR은 그대로 유효.
- **R16 진행률 이중 표기**: 현황판은 차수 기준과 **인원 기준**(주 지표)을 병기. 분모: 정규 40차수 / 2,659명.

---

## 5. 화면별 구현 노트 (프로토타입 대비 추가 사항만)

### 5.1 참여자 — `/docs/prototypes/participant.html` 기준
- 허브 상단 배지: display_no · 날짜 · 장소(세션 데이터 바인딩). 잠금 상태는 실시간 반영.
- **데이터 무손실 (최우선 요구)**: ① 모든 폼 입력은 keystroke마다 localStorage 초안 저장(`draft:{slug}:{form}`), 제출 성공 시 삭제. ② 제출 payload에 클라이언트 생성 uuid 포함 → 서버 upsert(멱등: 더블탭·재시도로 중복 생성 불가). ③ 실패 시 입력 보존 + "다시 시도" 버튼(지수 백오프 자동 3회 → 수동). ④ 성공은 명시적 완료 화면(프로토타입의 recap 포함)으로만 확인. ⑤ 오프라인 감지 시 "연결되면 자동 전송" 안내.
- Pulse 세그먼트·라벨("워크숍 전의 나"/"지금의 나"), 문항·플레이스홀더 등 **모든 문구는 프로토타입 텍스트와 글자 단위 동일**(부록 B가 동결 원문).

### 5.2 현황판 — `/docs/prototypes/dashboard.html` 기준
- 데이터 바인딩: 40차수의 길(sessions), 카운터 4종, 지향점 워드클라우드(team_identities.goal 형태소 아닌 **원문 어절 빈도** — goal 슬롯이 이미 짧은 구라 단순 빈도로 충분, 상위 18개), 다짐 랭킹(adj+' '+noun 조합 빈도 Top 8), Pulse 덤벨(문항별 pre/post 평균), 인재상 나비(H/F 조합 빈도 Top 4씩).
- 갱신: 30초 폴링 또는 Supabase Realtime. 헤더의 "데모 데이터" 칩 제거, 갱신 시각 표시 유지.
- 접근: `?k=` 토큰 검증(app_settings.dashboard_token) → 쿠키 세션. 실패 시 간단 안내 페이지.

### 5.3 운영 콘솔 — `/docs/prototypes/admin.html` 기준
- 오늘의 운영: 오늘 날짜 차수 자동 필터(복수 병행 지원), 카드별 허브 QR·링크 복사·**카톡 공지문 복사**(템플릿: 인사말 + 허브 링크 1개), 활동 토글 5종, 실참석 입력.
- **현황판 바로가기 (신규 요청)**: 콘솔 사이드바 하단 또는 오늘의 운영 상단에 "현황판" 카드 추가 — ① 현황판 새 탭 열기 버튼 ② **뷰어 공유 링크 복사**(토큰 포함 URL) ③ 공유용 QR 표시 ④ "토큰 재발급" 버튼(유출 시 무효화 — 재발급하면 기존 링크 즉시 만료).
- 차수 관리: CRUD 전체(추가·수정·취소), 파일럿 배지, 링크·QR 모달, `/admin/sessions/[id]/print` = A4 인쇄 시트(허브 QR 크게 + **차수번호·날짜·장소·강의실을 대형 표기** + 차수별 지정 색 테두리 — 3방 병행일 QR 혼동 방지).
- 수집 데이터: 탭 3종, 필터(차수·조직·검색), 행 액션(수정/차수 재지정/숨김/복원), 복수 제출 플래그, Pool외 점선 칩, **현재 필터 기준 엑셀 다운로드**(xlsx: 전 컬럼 + 조직·실 조인).
- Pulse 분석: 차수별 평균 델타 추이(전체 평균선 + 평균-1.0 미만 차수 경보 마커), 문항별 표(미니 덤벨), 주관식 목록(차수 필터 + 엑셀). 카테고리 코딩은 시스템 밖(수기) — 화면은 목록·검색·다운로드까지만.
- 팀 명부: 검색 테이블 + 미등록 큐(pending → "명부에 추가" = status active로 / "기존 팀에 병합" = 해당 제출들의 team_id 일괄 치환 + pending 행 merged 처리).

---

## 6. 시드 데이터

저장소 `/supabase/seed/`에 배치 후 시드 스크립트로 로드:
- `seed_teams.csv` — 164팀 (본 문서와 함께 전달. 컬럼: team_name, org_name, sil_name, headcount. 검증 완료: 164행 유일, 인원 합 2,659)
- `seed_sessions.csv` — 42건(P1·P2 파일럿 + 정규 1~40. 미정 구간 30~40은 status='tbd', 노트에 확인 필요 표기. **시드는 초기값일 뿐 — 콘솔에서 전면 수정 가능해야 함**)
- `app_settings` 초기값 — study_default_url, include_pilot=false, pool_adj/pool_noun(부록 A), dashboard_token(랜덤 생성)

---

## 7. 마일스톤

- **M0 기반**: 레포 구조, Vercel 연결, Supabase 스키마·RLS·시드, Auth(운영자 1계정), 프로토타입 3종을 `/docs/prototypes/`에 커밋
- **M1 참여자 5폼**: 허브(잠금 실시간)→study 리다이렉트→identity→finder→pledge→pulse. 데이터 무손실 스펙 전체. 서버 검증(잠금·글자수·멱등)
- **M2 콘솔**: 오늘의 운영(토글·QR·공지문·실참석), 차수 관리+인쇄 시트, 현황판 공유 카드
- **M3 현황판**: 시각화 5종 실데이터 바인딩, 토큰 접근
- **M4 데이터 관리**: 수집 데이터 브라우저(액션 전체), 엑셀 export, 팀 명부·병합, Pulse 분석
- **M5 하드닝**: 부하 테스트(§8), 모바일 크로스브라우징(iOS Safari 필수), 백업 확인, 파일럿 차수 리허설

## 8. 인수 기준 (Definition of Done)

1. 150명 동시 제출 시나리오(k6 등)에서 유실 0, 에러율 0, p95 응답 < 2s
2. 제출 버튼 연타·네트워크 단절 후 재시도에도 중복 레코드 0 (멱등 검증)
3. 잠긴 활동에 직접 URL 접근·API 호출 시 서버가 거부
4. 비행기모드에서 폼 작성 → 재연결 → 제출 성공, 초안 유실 0
5. 차수 번호 변경 후에도 기존 QR로 제출한 데이터가 올바른 차수에 귀속
6. 같은 팀 이름 재제출 시 수정 흐름 동작, 타 차수 동일 팀은 별건+플래그
7. Pulse에 팀·이름·개인식별자가 어떤 테이블에도 남지 않음
8. 현황판에 제출 원문이 노출되는 경로가 없음 (뷰어 토큰으로 콘솔 접근 불가)
9. 파일럿 토글 on/off에 따라 현황판 수치가 즉시 재계산
10. 엑셀 다운로드가 필터 상태를 정확히 반영, 한글 깨짐 없음
11. 문구 대조: 부록 B의 동결 문안과 화면 텍스트 100% 일치

## 9. 디자인 시스템 (프로토타입에서 추출)

- 참여자·콘솔(라이트): paper `#F2F4F8` / card `#FFF` / navy `#0F2B5E` / deep `#0A1F45` / gold `#C79A2A` / gold-soft `#F6EED9` / orange `#E8762C` / ok `#1E7A3C` / warn `#C0392B` / line `#E2E6EE` / field `#F7F9FC`
- 현황판(다크): bg `#0A1730` / card `#11224A` / gold `#E3B341` / pre-blue `#6FA8E8` / grid `#1A2C55`
- radius 14~20px, Pretendard, 모바일 390px 기준. 세부는 프로토타입 CSS가 명세.

---

## 부록 A. 인재상 Finder Pool (최종 동결 — app_settings 시드)

**형용사 50**: 객관적인, 주도적인, 개방적인, 존중하는, 원칙을 준수하는, 전략적인, 책임감 있는, 미래지향적인, 배려하는, 일관된, 합리적인, 성과지향적인, 창의적인, 포용적인, 투명한, 명확한, 추진력 있는, 성장을 추구하는, 고객지향적인, 진정성 있는, 세심한, 신속한, 유연한, 경계를 넘는, 공정한, 정교한, 결단력 있는, 학습 지향적인, 수평적인, 신중한, 균형 잡힌, 끈기 있는, 과감한, 겸손한, 실용적인, 선제적인, 집요한, 긍정적인, 협력적인, 효율적인, 깊이 있는, 준비된, 소신 있는, 통합적인, 신뢰를 만드는, 통찰력 있는, 완결성 있는, 설득력 있는, 장기적 관점의, 체계적인

**명사 50**: 문제해결, 전문성, 실행, 협업, 혁신, 판단, 학습, 주인의식, 연결, 도전, 의사결정, 성장, 몰입, 소통, 변화대응, 분석, 자기개발, 책임감, 조정, 기회포착, 통찰, 지식공유, 주도성, 설득, 기업가정신, 기획, 기준정립, 추진력, 관계형성, 가치창출, 검증, 데이터활용, 목표달성, 파트너십, 지속가능성, 리스크관리, 시장이해, 우선순위, 영향력, 회복탄력성, 사업감각, 완성도, 효율성, 공감, 용기, 시스템사고, 통합사고, 신뢰, 상생, 적응력

※ 표기(띄어쓰기 포함)를 유인물과 글자 단위로 동일하게 유지할 것. 화면 표시는 가나다순 정렬.

## 부록 B. 동결 문안 (화면 텍스트 — 글자 단위 준수)

**정체성 두 문장**
① 정체성: 공간과 에너지를 잇는 길 위에서, 우리의 기술로 더 나은 삶을 만듭니다.
② 미래 사업 방향: 에너지 밸류체인 진화를 이끄는 핵심 역할자.

**팀 정체성 템플릿**: "[고유업]을 하는 우리는, [고유성]으로 일하며, [지향점]을 만든다." (조사 자동 처리 R10)

**인재상 폼 섹션**
- Heritage 키워드 — 우리 주위의 우수 인재 모습 · 형용사 + 명사
- Future 키워드 — 우리 비전 달성을 위해 필요한 모습 · 형용사 + 명사
- 각 섹션 하단 "선정 이유" 300자

**개인다짐 템플릿**: "[형용사+명사]를 위해, 나는 ___을 하겠습니다" (실천 내용 80자)

**Pulse Check (전체 동결)**
안내문: 아래 문항에서 '가치체계'는 다음 두 문장을 말합니다. ①… ②… / 각 문항에 대해 [워크숍 전의 나]와 [지금의 나]를 각각 표시해 주세요. 응답은 익명이며 차수 단위로만 집계됩니다.
척도: 7점 (1 전혀 그렇지 않다 ~ 7 매우 그렇다) / 행 라벨: "워크숍 전의 나" / "지금의 나"
1. [가치체계 이해] 나는 우리 회사의 가치체계가 무엇을 의미하는지 다른 사람에게 설명할 수 있다.
2. [가치체계 공감] 나는 이 가치체계가 현대엔지니어링이 가야 할 길이라는 데 공감한다.
3. [팀 연결] 나는 가치체계 안에서 우리 팀이 맡고 있는 역할과 기여를 이해하고 있다.
4. [실천 의지] 나는 가치체계와 연결된 행동 한 가지를 내 일에서 실천할 의향이 있다.
주관식(필수, 10~300자): 오늘 워크숍에서 가장 마음에 남는 것은 무엇이고, 그래서 내 일에서 바꿔볼 한 가지는 무엇인가요?

**학습자료 기본 URL**: https://claude.ai/artifact/QpQj6eAVpJ8TDTT1WQXK3G (app_settings에서 교체 가능)

**허브 카드 순서·번호**: 2 시험공부 자료 / 3 팀 정체성 제출 / 4 조별 인재상 제출 / 5 개인다짐 제출 / 6 Pulse Check (초기: 2만 공개, 3~6은 번호+자물쇠)

## 부록 C. 미결·확인 필요 (구현 차단 아님)

- 예약시트 30~36 / 37~40 구간의 정확한 방 구성 — 콘솔에서 수정 가능하므로 시드는 잠정값
- 파일럿 P1·P2 데이터의 본 집계 포함 여부 — 기본 제외, 토글 존재
- 카톡 공지문 템플릿 문안 — 운영팀 초안 대기 (플레이스홀더로 구현)
- 어근 겹침 조합(예: 추진력 있는+추진력) 소프트 가드 — 미적용 결정 시 그대로, 적용 시 안내 배너 1줄만 (선택 차단 금지)
