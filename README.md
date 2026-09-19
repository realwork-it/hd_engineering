# 현대엔지니어링 가치체계 내재화 워크숍 — 다차수 운영시스템

설계서는 [SPEC.md](SPEC.md), 화면 명세는 [docs/prototypes/](docs/prototypes/). 충돌 시 SPEC.md 우선.

## 스택
Next.js (App Router, TS) · Supabase (Postgres + RLS + Auth) · Tailwind CSS · Vercel

## 처음 세팅 (M0)

```bash
npm install
cp .env.example .env.local        # Supabase 키 채우기
npx supabase login
npx supabase link                 # 프로젝트 hd_engineering 선택
npm run db:push                   # supabase/migrations 적용
npm run seed                      # 164팀 · 42차수 · app_settings
npm run admin:create              # .env.local의 ADMIN_EMAIL / ADMIN_PASSWORD 사용
npm run dev
```

### 키 없이 로컬에서 참여자 화면 보기
```bash
npm run dev:mock   # 임베디드 Postgres + 목 Supabase → http://localhost:3000/s/demo01 (전부 열림), /s/demo02 (초기 잠금)
npm test           # 조사 처리(R10) + DB 제출 규칙(R3~R8·멱등)
```

`/admin/login`으로 로그인하면 테이블별 건수가 보입니다 (sessions 42 · teams 164).

## 구조
```
SPEC.md                    설계서 v1.0 (동결본)
docs/prototypes/           화면 명세 HTML 3종
supabase/migrations/       스키마 · RLS
supabase/seed/             시드 CSV
scripts/                   seed · create-admin
src/app/s/[slug]/…         참여자 (M1)
src/app/dashboard          현황판 (M3)
src/app/admin/…            운영 콘솔 (M2, M4)
src/lib/supabase/          server(운영자 세션) · service(서비스 롤) · client
src/proxy.ts               /admin 보호
```

## SPEC 대비 결정 사항
- **anon에게 `sessions` select를 열지 않음.** 열면 anon 키로 전체 slug 열거가 가능해 R1이 깨짐. 대신 slug를 아는 경우에만 1행을 주는 `get_session_hub(slug)` RPC 제공. 허브 잠금 반영은 15초 폴링(R3 허용 범위).
- 기기 키(`device_key`)는 localStorage가 아니라 서버 발급 httpOnly 쿠키 `hec_dk`(경로 `/s`). iOS Safari의 스크립트 저장소 7일 제한을 피하고, R15 리다이렉트(GET)에서도 읽을 수 있음. Pulse에는 전달하지 않음(R8).
- 제출은 Server Action → DB 함수(`submit_*`, 서비스 롤 전용) 한 번의 호출로 잠금·팀 해석·멱등·이력을 원자적으로 처리.
- 개인다짐 문장은 프로토타입 형태(`… 위해, 나는 ___ 하겠습니다.`)에 조사 자동 처리(을/를)를 적용. 부록 B 표기(`___을 하겠습니다`)와 다름 — 확인 필요.
- 운영자 화이트리스트는 `admin_emails` 테이블 + `is_admin()`.
- 시드의 `(본부 직속)`은 `sil_name = null`로 저장. `대강의실 A`는 location `대강의실` / room `A`로 분리.
- 시드 `expected`는 비워 둠(정원 합 2,608 ≠ 총원 2,659 — 콘솔에서 입력).
