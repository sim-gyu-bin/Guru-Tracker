# Guru Tracker

> 가족·지인이 공개 공시를 더 쉽게 확인하도록 돕기 위한 투자 공개정보 추적 프로젝트

## 현재 상태

**Linear 제품 내부 UI를 기준으로 홈, Stanley Druckenmiller·Cathie Wood·Nancy Pelosi 상세 조회를 구현했습니다.** Stanley의 SEC 13F와 ARK 6개 펀드의 공식 holdings, Nancy Pelosi의 미국 하원 공식 PTR 최신 1건 수집·검증, Supabase DB·Storage 저장, 멱등 동기화 조정자와 SQL 마이그레이션이 포함됩니다. Stanley는 원격 저장·재처리와 95개 보유 항목 표시를 확인했습니다. ARK도 공식 CSV 6개, 원격 저장·동일 원문 재처리와 실제 캐시 화면 조회를 확인했습니다. Nancy Pelosi는 공식 PTR 문서 1건(거래 7행)의 수집·검증과 화면 렌더를 격리 환경에서 확인했고, **운영 Supabase에는 `202609160001_house_ptr.sql`을 적용하고 Vercel에 배포했으며 ARK·House 시간별 Cron도 등록했습니다.** 이전 배포 함수에는 pdfjs 워커 파일(`pdf.worker.mjs`)이 빠져 운영 동기화가 503 `HOUSE_VALIDATION`으로 거절됐고, include를 pnpm 심링크 경로(`node_modules/pdfjs-dist/…`)로 넣은 수정은 Vercel이 `Deploying outputs` 단계에서 `invalid deployment package`로 거부했습니다. include를 심링크를 푼 실제 경로로 계산하도록 고친 수정은 **최신 배포에 성공했고 운영 조회 응답 HTTP 200을 사용자 확인으로 알고 있습니다. 다만 응답 본문의 `status` 값은 아직 확인하지 않았으므로 운영 수집이 `updated`·`unchanged`를 반환했다고도, 503으로 실패했다고도 단정하지 않습니다.** 나머지 네 대상(Burry·Laffont·Gerstner·Tepper)의 수집, ARK trades, 설치형 PWA와 Web Push는 **계획**입니다. **로그인과 소유자 승인 기반 접근 제한은 저장소에 구현되어 있지만 배포 설정과 실운영 검증은 끝나지 않았습니다**(아래 "접근 정책 (저장소 구현, 배포 설정 미완료)"). ARK·House 시간별 Cron 설정 SQL은 `supabase/ark-cron.sql`, `supabase/house-cron.sql`로 작성했고 두 job 모두 등록했습니다. job 등록은 실제 수집 성공과 별개이므로 각 엔드포인트의 응답으로 성공 여부를 따로 확인합니다.

## 목적

Guru Tracker는 서로 다른 공개 공시 형식을 한곳에서 읽기 쉽게 정리해, 다음 일곱 인물·기관의 공개 보유·거래 정보를 확인할 수 있게 하려는 서비스입니다.

| 추적 대상 | 공식 출처 |
| --- | --- |
| Stanley Druckenmiller | SEC Form 13F |
| Cathie Wood | ARK Invest 공식 holdings/trades |
| Nancy Pelosi | U.S. House Periodic Transaction Report (PTR) |
| Michael Burry | SEC Form 13F |
| Philippe Laffont | SEC Form 13F |
| Brad Gerstner | SEC Form 13F |
| David Tepper | SEC Form 13F |

이는 매매 추천이나 성과 비교 서비스가 아닙니다. 공개 공시의 원문과 그 한계를 우선하는 열람 도구를 목표로 합니다.

## 공시 출처와 해석상의 한계

- **SEC Form 13F**: Stanley Druckenmiller, Michael Burry, Philippe Laffont, Brad Gerstner, David Tepper의 기관 보유 현황에는 분기별 13F 공시를 사용합니다. 13F는 실시간 보유·거래 정보가 아니며, 분기 종료 뒤 공개되는 보고서입니다. 특히 Michael Burry의 옵션 포지션에서 정확한 손익을 추정하거나 표시하지 않습니다.
- **ARK Invest 공식 holdings/trades**: 현재 Cathie Wood 화면은 ARK가 공개한 6개 펀드의 holdings만 사용하며 trades 수집은 계획입니다. 개인 계좌나 실시간 거래 내역이 아닙니다. 접근 공백 중 놓친 일별 이력은 나중에 접속해서 재구성할 수 없습니다.
- **U.S. House PTR**: Nancy Pelosi 관련 데이터에는 U.S. House가 공개하는 Periodic Transaction Report(정기 거래 보고서)를 사용합니다. PTR은 **거래 내역**이며 보유 목록·현재 보유 여부·수익률이 아니고, 거래 시점·공개 범위와 시차를 그대로 따릅니다. 금액은 원문이 구간으로 적은 값이므로 화면에서도 **거래금액 범위**로만 표시하고 합계·중간값·비중을 계산하지 않습니다. 거래유형 `P`·`S`·`S (partial)`·`E`와 소유자 코드 `SP`·`DC`·`JT`는 하원 윤리위원회 지침이 정의한 코드에 한해서만 한국어와 원문 코드를 함께 표시하며, 그 밖의 값은 해석하지 않고 수집을 실패시킵니다. 화면의 `원문 티커` 열은 제출자가 원문 자산명 끝에 함께 적은 괄호 표기를 그대로 옮긴 값이며, 원문 밖에서 조회한 현재 티커나 상장 여부의 근거가 아닙니다.

Stanley 수집기는 공식 SEC 제출 목록과 원문, ARK 수집기는 공식 holdings CSV, Nancy Pelosi 수집기는 하원 공개 색인과 원문 PDF만 사용합니다. 나머지 출처 수집기도 같은 원칙을 따를 예정이며, 13F를 실시간 데이터처럼 표시하거나 불완전한 공시에서 사실을 단정하지 않습니다.

## 동기화 구현과 운영 계획

### 시간별 동기화와 접근 시 보완

무료 등급 구성을 유지하기 위해 **Supabase Cron**으로 시간마다 한 번 수집합니다. `pg_cron`과 `pg_net`이 보호된 Next.js 내부 동기화 엔드포인트를 호출하며, 호출 비밀값은 Supabase Vault 및 서버 전용 설정에만 보관합니다. ARK·House의 job SQL은 `supabase/ark-cron.sql`, `supabase/house-cron.sql`로 작성했고 두 job 모두 등록했습니다. 등록 자체는 실제 수집 성공을 뜻하지 않으며 성공 여부는 각 엔드포인트 응답으로 확인합니다. Stanley는 접근 갱신만 사용합니다. 시간별 일정에는 Vercel Hobby Cron을 사용하지 않습니다. Vercel Hobby Cron은 시간별 실행에 적합하지 않기 때문입니다.

Stanley·ARK·Nancy Pelosi는 각각 접근 갱신과 보호된 내부 진입점이 같은 멱등 조정자·DB lease를 공유합니다. ARK의 lease와 캐시는 펀드별로 분리되고, Nancy Pelosi는 최신 PTR 문서 1건을 스냅샷 단위로 삼아 lease도 하나입니다. 화면은 저장된 데이터를 먼저 읽고, 마지막 성공 후 한 시간이 지났거나 캐시가 비었을 때 접근 갱신을 요청합니다. lease는 90초, 재시도 간격은 최소 60초이며 만료된 작업의 뒤늦은 커밋은 펜싱 토큰으로 차단합니다. 공통 갱신 컴포넌트는 펀드를 바꿀 때 요청 상태를 초기화하고 펀드별 쿨다운을 적용합니다. House 시간별 Cron은 등록되어 매시 13분에 호출합니다. 과거 배포는 PDF 워커 파일 누락으로 503 `HOUSE_VALIDATION`을 반환했고, 워커 경로를 고친 최신 배포는 성공했으며 운영 조회 HTTP 200을 사용자 확인으로 알고 있습니다. 다만 동기화 응답 본문(`status`)은 아직 확인하지 않았으므로 수집이 `updated`·`unchanged`를 반환했다고 단정하지 않습니다. ARK 시간별 job도 등록되어 매시 7분에 호출하며, 그 실제 수집 성공 여부는 이번 확인 범위가 아니므로 각 엔드포인트 응답으로 따로 확인합니다.

### 안전한 스냅샷 관리

Stanley·ARK·Nancy Pelosi 마이그레이션은 대상별 **현재 스냅샷과 직전 스냅샷만** 보존합니다. 직전은 직전 분기·거래일이 아니라 이전에 반영한 버전이며 최초 수집 때는 없습니다. 원문 검증 후 실제 정규화 데이터가 달라질 때만 하나의 transaction에서 스냅샷을 회전하고 버전·변경 이벤트를 기록합니다. 같은 데이터의 새 출처는 버전을 올리지 않고 메타데이터만 갱신합니다. ARK는 기준일·행 순서·면책 문구만 바뀐 경우 보유 변경으로 기록하지 않습니다. Nancy Pelosi는 최신 PTR 문서 1건이 스냅샷 단위이므로 제출일·문서번호가 현재보다 뒤진 문서는 거부합니다. 최신성 확인 뒤 변경 여부는 원문 해시와 정규화 해시로 판정합니다. **같은 PDF 바이트(`documentHash`)인데 정규화 결과(`normalizedHash`)가 달라지면** 조용히 덮지 않고 실패로 남기며, 정규화 내용이 같으면 버전을 올리지 않고 검증된 출처 메타데이터만 갱신합니다. PDF 바이트와 정규화 내용이 모두 달라지면 **같은 문서번호라도** 버전을 올려 직전 스냅샷을 previous로 회전합니다. 거래 변경 이벤트는 `house_ptr_events`에 같은 transaction에서 기록합니다. 원문은 콘텐츠 해시 주소로 저장하며 동일 객체를 덮어쓰지 않습니다. 이벤트에는 30일 보존 기준을 기록하지만 자동 삭제 작업은 없고, 고아 원문을 포함한 실제 정리는 별도 승인 대상입니다.

### 변경 알림 Web Push

유효성 검사를 통과한 데이터베이스 트랜잭션이 실제 변경 이벤트를 만든 **뒤에만** Web Push 발송을 outbox에 넣을 계획입니다. 커밋 전에는 알림을 만들지 않으며, Push 발송 실패가 원문·스냅샷 저장을 롤백하지 않습니다. 이벤트와 문서의 고유 키, outbox를 사용해 중복 발송을 막고, 전달된 outbox 및 이벤트 이력은 짧은 보존 기간 뒤 정리합니다(정확한 기간은 구현 시 결정).

알림은 PWA service worker와 VAPID를 사용하는 표준 Web Push로 계획합니다. 권한은 사용자 동작에서만 opt-in으로 요청합니다. iOS의 일반적인 Push 흐름에서는 Home Screen에 설치한 웹 앱이 필요하지만, PWA Web Push를 위해 Apple Developer 계정은 필요하지 않습니다. 만료되었거나 유효하지 않은 subscription은 Push 서비스의 `404` 또는 `410` 응답을 받으면 제거합니다.

## 접근 정책 (저장소 구현, 배포 설정 미완료)

Guru Tracker의 접근 방식은 **소유자 승인**으로 확정되었고, 그 코드·스키마가 저장소에 구현되어 있습니다. 아래 계약은 확정 결정이며, **운영 배포에 필요한 설정은 아직 채우지 않았습니다.**

- **로그인**: Supabase Auth의 Google OAuth만 사용합니다. 이메일/비밀번호와 Magic Link는 사용하지 않습니다.
- **상태**: 최초 Google 로그인은 접근 요청을 `pending`으로 기록하고, `approved`인 사람만 서비스를 이용합니다. `rejected`(거절)·`revoked`(승인 후 해제)는 이용할 수 없고, 다시 로그인해도 새 요청이 자동 생성되지 않으며 다음 서버·API 요청이 차단됩니다. 소유자는 같은 화면에서 거절·해제한 사람을 다시 승인할 수 있습니다.
- **소유자**: 소유자는 한 명이며 검증된 Google identity와 DB user id로 지정합니다. 서버 전용 `ADMIN_EMAIL`이 초기 소유자를 식별합니다. 실제 이메일 주소는 저장소·README·Wiki·코드·로그에 적지 않습니다. 소유자 결속은 단일 행으로 유지하고, 상태 변경은 기대 버전을 함께 받아 오래된·재생된 결정이 최신 상태를 덮지 않게 합니다.
- **라우팅**: `(public)`에 `/`(서비스 소개), `/login`(Google 로그인), `/privacy`(개인정보처리방침), `/terms`(이용약관)를 둡니다. `(private)`에 `/pending`(승인 대기), `/admin`(소유자 관리), `/main`, `/main/gurus/...`를 두며 URL은 그룹 이름 없이 유지합니다. 비공개 화면은 서버에서 검증된 세션이 없으면 로그인으로 이동하지 않고 HTTP 404를 반환합니다. 로그인한 사용자의 승인·관리자 권한 및 API 권한 검사는 유지합니다.
- **관리자 화면**: `/admin`은 승인된 관리자 외에는 로그인·승인 여부와 관계없이 HTTP 404를 반환합니다. 결정 요청 중에는 목록과 확인 패널의 버튼·링크를 잠그고 처리 중 상태를 표시합니다. 연속 제출 차단과 별개로 서버의 기대 revision 검사는 유지합니다.
- **메일 알림**: 새 `pending` 요청은 provider API로 소유자에게 알립니다. 메일의 수락·거절 링크는 해당 요청의 `/admin` 화면을 여는 GET 이동일 뿐이고, 상태 변경은 소유자가 Google 관리자로 로그인한 뒤의 POST로만 처리합니다. 메일 스캐너나 링크 미리보기가 링크를 열어도 접근 상태는 바뀌지 않습니다. 발송이 실패해도 요청은 `pending`으로 남아 `/admin`에서 처리할 수 있습니다.
- **권한 경계**: 일반 사용자의 접근은 서버·API·Row Level Security로 제한하고, 수집·동기화·스냅샷 회전·Push outbox는 서버 전용으로 유지합니다. 내부 Cron 엔드포인트는 기존 Bearer(`SYNC_SECRET`) 인증을 그대로 사용하며 소유자 승인 상태와 무관합니다.
- **설정**: 서버 전용 `ADMIN_EMAIL`·`RESEND_API_KEY`·`RESEND_FROM`·`APP_URL`과 Supabase 공개 키를 사용합니다. 실제 값과 수신 주소는 저장소·README·Wiki·코드·로그에 적지 않습니다. 이 네 값은 **아직 설정하지 않았습니다.**
- **메일 provider**: 초기 후보는 Resend이며 제품 결정이 아니라 구현 선택입니다. provider를 교체해도 승인 상태·라우팅·DB 계약은 바뀌지 않습니다.

**저장소에 구현된 것**

- **라우트**: 공개 `/`·`/privacy`·`/terms`, `/login`, `/pending`, `/admin`, `/main`, `/main/gurus/...`와 `/auth/signin`·`/auth/callback`·`/auth/signout`.
- **판정·세션**: `src/proxy.ts`가 화면 접근을 판정하면서 Supabase 세션을 갱신하고, `src/domain/access.ts`·`src/server/access-store.ts`가 상태·경로 판정을 담당합니다. 화면 판정은 DB를 읽기만 하며 가입 요청을 만들지 않습니다.
- **DB**: `supabase/migrations/202609180001_access_approval.sql`의 `public.access_users`(상태 `pending`·`approved`·`rejected`·`revoked`, 단일 관리자 부분 유니크 인덱스, 결정 세대 번호 `revision`, RLS)와 RPC `access_request_submit`·`access_confirm_admin`·`access_decide`.
- **서버 모듈**: `src/server/config.ts`(`APP_URL`·`ADMIN_EMAIL` 해석), `src/server/session.ts`, `src/server/supabase.ts`, `src/server/access.ts`, `src/server/origin.ts`(Host·`x-forwarded-host` 기준 같은 출처 판정), `src/server/mail.ts`(Resend HTTP API).
- **회귀 검증**: `tests/access-approval.test.ts`가 PGlite 인메모리 PostgreSQL에 실제 마이그레이션을 적용해 판정·RPC·RLS 경계를 검증합니다.

**아직 완료되지 않은 배포 설정**

- Google Cloud OAuth 클라이언트와 동의 화면 게시, Supabase Google provider 및 redirect 허용 목록 등록.
- 서버 전용 `APP_URL`·`ADMIN_EMAIL`·`RESEND_API_KEY`·`RESEND_FROM` 값. `.env.example`에 항목만 있고 이 저장소와 로컬 개발 환경 파일에는 값이 없습니다.
- 원격 Supabase로의 `202609180001_access_approval.sql` 적용과 Resend 발신 도메인 인증.

실제 Google 로그인·승인 알림 메일·운영 승인 흐름은 **아직 검증되지 않았습니다.** Google Cloud·Supabase·Resend 설정을 채운 배포에서 최종 확인해야 합니다. 운영에서는 `APP_URL`이 없으면 로그인이 거절됩니다. 로컬 개발 모드에서는 미설정 시 루프백 요청의 현재 포트로 OAuth 복귀 주소를 만들며, `APP_URL`이나 Resend 설정이 없으면 승인 메일만 생략된 채 요청이 `pending`으로 남습니다.

**로컬에서 확인한 범위(2026-09-18)**: `pnpm test`는 **48/48 통과**(`tests 48`, `pass 48`, `fail 0`, exit 0)했고, 이와 구분되는 런타임 가드 스윕은 로컬 릴리스 빌드에서 **50/50**(구현자 `probe-guards.sh`)과 **66/66**(검증 담당 `verify-guards.mts`)으로 전부 통과했습니다. 같은 로컬 빌드를 실제 Chromium으로 열어 대역 세션에서 상태 전이 4종(승인·거절·해제·재승인)의 `revision` 1 증가, 같은 결정 폼 2회 제출 시 두 번째 `stale` 처리, 메일 링크 GET의 상태 불변, 재로그인 무효과, 데스크톱 `/main`·상세 200과 미승인 `/pending` 이동, 옛 `/gurus/...` 404, 로그아웃 후 쿠키 제거를 확인했고, `/login`·`/admin`·`/pending`·`/main`·`/main/gurus/stanley-druckenmiller`를 데스크톱 1280x900과 모바일 390x844에서 렌더링했습니다(`/admin`은 표에서 단일 열 카드로 재배치). 이 범위는 대역 Supabase(PGlite)와 로컬 빌드 기준이며 실제 Google 세션·원격 DB·메일 발송·원격 RLS 동작을 대신하지 않습니다.

## 기술 구성

| 영역 | 구성 | 상태 |
| --- | --- | --- |
| 웹 애플리케이션 | Next.js App Router | Linear 스타일 홈·Stanley·Cathie·Nancy Pelosi 상세 조회(`/main`, `/main/gurus/...`)와 승인 화면(`/login`, `/pending`, `/admin`) 구현 |
| 개발 도구 | pnpm, TypeScript, Biome, Husky, Tailwind CSS | 구현 |
| UI 컴포넌트 | Tailwind CSS 4, shadcn/ui (Radix 기반), Recharts | 버튼·배지·표·상태 안내·공시 비중 도넛 차트 구현 |
| 호스팅 | Vercel Hobby | 배포 완료(워커 경로 수정 반영 최신 배포 성공, 운영 조회 HTTP 200은 사용자 확인 / 동기화 응답 본문은 미확인) |
| 데이터베이스·파일 저장소 | Supabase PostgreSQL / Storage | Stanley·ARK 원격 저장·동일 원문 재처리 검증 완료, Nancy Pelosi 마이그레이션 적용·수집·화면 구현(운영 수집 응답 본문은 미확인) |
| 클라이언트 제공 방식 | PWA-first | 계획 |
| 인증·접근 제어 | Supabase Auth(Google OAuth) + 소유자 승인, 서버 전용 `ADMIN_EMAIL` | 저장소 구현 완료(라우트·마이그레이션 `202609180001`·회귀 테스트), 로컬 릴리스 빌드 가드 스윕 50/50·66/66과 Chromium 데스크톱·모바일 화면 스모크 통과 / 배포 설정과 실운영 Google·메일 검증 미완료 |

공시 원문은 비공개 Supabase Storage의 `sec-originals`·`ark-originals`·`house-originals` 버킷에 출처별로 구분해 저장합니다. 이 저장소의 LLM Wiki 원문 보관 영역을 운영 데이터 저장소로 사용하지 않습니다.

화면 배치·반응형·상태 스타일은 JSX의 Tailwind 유틸리티로 작성합니다. `src/components/ui/`의 shadcn/ui 컴포넌트를 재사용하고, `globals.css`에는 Tailwind 로딩·공통 테마 토큰·최소 기본 스타일만 둡니다. 화면별 전역 CSS 클래스나 `@apply` 기반 별도 스타일 체계는 사용하지 않습니다. `components.json`에 CLI 설정, `src/lib/utils.ts`에 공통 클래스 병합 진입점을 둡니다.

내부 이동 링크는 `GuruLink`, 명령형 이동은 `useGuruRouter`를 사용합니다. 루트의 `NavigationProvider`가 Next.js의 링크 pending 상태와 React transition을 모아, 이동이 120ms 이상 걸릴 때 화면 최상단에 2px 진행 바를 표시합니다. 기존 화면은 유지하며 ARK의 `?fund=` 변경도 포함합니다. `refresh()`와 `prefetch()`는 진행 바를 시작하지 않으므로 캐시 동기화의 백그라운드 갱신은 조용하게 유지됩니다. 별도의 로딩 라이브러리는 추가하지 않았습니다.

진행 바는 8%부터 시작해 400ms마다 남은 연출 구간의 일부를 채우며 94%에 점차 접근합니다. 이동 완료 시에만 100%로 늘어난 뒤 페이드아웃합니다. 실제 전송량·완료율을 뜻하지 않으며, 모션 감소 설정에서는 길이와 투명도의 보간을 생략합니다. 지연시킨 실제 펀드 이동에서 약 8% → 47% 증가, 완료 목표 100%, 종료 후 숨김을 확인했습니다.

실제 Next.js 화면에서 RSC 요청을 지연시켜 페이지·펀드 전환, 기존 화면 유지, 앞선 요청이 끝난 뒤에도 마지막 이동의 표시 유지, 완료 후 표시 종료를 확인했습니다. 동일 URL·취소된 클릭에서 표시가 남지 않고, 실제 `router.refresh()`에서는 표시되지 않았습니다. 1440px·390px 화면과 모션 감소 설정도 확인했습니다.

Stanley 상세의 **13F 공시 평가금액 구성**은 저장된 스냅샷을 상위 5개와 기타로 집계합니다. CUSIP·증권 종류·PUT/CALL·수량 단위가 같은 항목만 합치며, 금액 합산·순위는 `BigInt`로 계산합니다. 도넛 옆 목록에 비중과 USD 금액을 항상 표시하고, 모바일에서는 차트 아래로 배치합니다. 차트에 키보드 포커스를 둔 뒤 좌우 방향키로 툴팁 항목을 이동할 수 있습니다. 빈 공시·총액 0은 차트를 그리지 않습니다.

마우스를 올리거나 모바일에서 조각을 탭하면 세부 툴팁을 확인할 수 있습니다. 화면의 텍스트 목록은 툴팁 사용 여부와 관계없이 유지됩니다.

이 비중은 **공시 기준일의 제출 금액 구성**이며 현재 전체 자산 배분을 뜻하지 않습니다. 옵션 금액은 매입원금·프리미엄·손익으로 해석하지 않습니다. 집계는 `src/domain/holding-allocation.ts`, 화면은 `src/components/holding-allocation-chart.tsx`가 담당하며 추가 수집이나 DB 저장은 하지 않습니다.

보유 종목 목록은 1024px 미만 화면에서 단일 열 카드로, 그 이상에서는 표로 표시합니다. 카드에는 종목명·티커·증권 종류·USD 평가금액·수량과 단위·CUSIP을 표시하고, PUT/CALL은 배지로 구분합니다. Stanley·Cathie 화면은 공시 원문·정보표 새 탭 버튼을 제공하지 않지만, 내부 공식 원문 수집·검증·저장과 공시 기준일 표시는 유지합니다. Nancy Pelosi 화면은 거래 내역 옆에서 그 문서의 공식 원문 PDF 링크를 제공합니다.

Stanley 13F 보유 목록의 티커는 [OpenFIGI API](https://www.openfigi.com/api/documentation)의 **현재 미국 시장 참조 정보**입니다. 공시의 CUSIP·CINS를 정확히 조회하며, [CGS 식별자 규칙](https://www.cusip.com/identifiers.html)에 따라 첫 글자가 영문자인 CINS는 `ID_CINS`, 숫자로 시작하는 CUSIP은 `ID_CUSIP`으로 요청합니다. 미국 Equity의 유일한 티커·FIGI 조합만 표시하고, 이름 추측·다른 시장·비상장 식별자 대체는 하지 않습니다. 미매핑은 `—`, 일시적인 공급자 실패는 `일시 불가`로 구분합니다. SH와 옵션 기초자산에만 적용하며 PRN에는 적용하지 않습니다. **이 OpenFIGI 매핑은 Stanley 13F 보유 목록에만 적용하며 Pelosi PTR 화면의 `원문 티커` 열과는 무관합니다. PTR 화면은 원문에 적힌 표기만 쓰고 외부 식별자 조회를 하지 않습니다.**

`src/server/tickers.ts`는 Stanley 13F 화면을 위해 API 키 없이 최대 10건씩 순차 조회하고, 검증된 배치 결과를 Next 데이터 캐시에 24시간 저장합니다. 최초 조회 중에도 기존 공시 목록·차트를 먼저 표시하며, 매핑 결과는 카드·표·차트 범례와 툴팁에 반영합니다. 실패한 배치는 정상 미매핑으로 캐시하지 않고, 다른 배치의 결과와 재검증 전 정상 캐시는 보존합니다. 참조 티커는 공시 기준일 당시의 티커가 아니며 SEC 스냅샷·dataset version·변경 이벤트를 수정하지 않습니다.

Cathie 상세(`/main/gurus/cathie-wood`)는 **ARKK를 기본값**으로 ARKQ·ARKW·ARKG·ARKF·ARKX를 선택합니다. 공식 CSV의 원문 티커를 그대로 표시하므로 `RKLB UQ` 같은 표기도 유지하며, 빈 티커와 비표준 식별자를 추측·제외하지 않습니다. ARK에는 OpenFIGI 매핑이나 SEC의 SH/PRN 단위를 적용하지 않습니다.

ARK 금액은 USD 센트, 수량은 소수 문자열로 보존하고 금액 합산·순위에는 `BigInt`를 사용합니다. 모바일 카드와 데스크톱 표는 원문 금액·수량·공식 비중을 표시합니다. 상위 5개·기타 도넛은 평가금액에서 재계산한 비중이므로 공식 반올림 비중과 조금 다를 수 있습니다. 음수 평가금액이 있으면 오해를 줄 수 있는 도넛·비중 범례 대신 안내를 표시하고 원문 표는 유지합니다. `src/domain/ark-allocation.ts`와 ARK 어댑터가 출처 차이를 처리하며, 도넛 표현과 캐시 갱신 제어는 Stanley와 공통 컴포넌트를 사용합니다.

Nancy Pelosi 상세(`/main/gurus/nancy-pelosi`)는 **최신 PTR 문서 1건**만 다루며 보유 목록이나 누적 거래 이력을 합치지 않습니다. 머리에 문서번호·제출일·서명일·수집 성공 시각을 표시하고, 캐시를 먼저 보여 주면서 조건이 맞을 때만 갱신을 요청합니다. 상태 배지는 캐시 준비·데이터 없음·조회 오류·설정 필요를 구분하고, 갱신 중이거나 오래된 캐시는 갱신 안내 문구로 함께 알립니다. 1024px 이상에서는 거래 표, 그 미만에서는 단일 열 카드로 같은 내용을 보여 줍니다. 표의 열은 자산·**원문 티커**·자산유형·거래유형·거래일·통지일·**거래금액 범위**·소유자이고, 거래유형과 소유자는 한국어 라벨과 원문 코드를 함께 표시합니다(`매수 · P`, `배우자 · SP`). 소유자 기재가 없는 본인 보유 행은 `기재 없음`으로 표시하며 추측하지 않습니다. 자산명과 원문 설명 줄이 길어도 열 폭을 늘리지 않고 줄바꿈하며, 표시하는 거래 건수는 원문 1건 표 내용 전체입니다. 적용된 마이그레이션이 없으면 화면은 자료 대신 적용 안내를 표시합니다.

**원문 티커** 열은 제출자가 원문 자산명 끝에 함께 적은 괄호 표기(`(BE)`)를 그대로 옮긴 값이며, 공시 원문 밖에서 조회한 현재 시장 티커가 아닙니다. 옵션(`OP`) 행의 값은 옵션 계약 심볼이 아니라 그 행이 가리키는 기초자산의 원문 표기이므로 **기초자산 티커**로 함께 적고, 자산유형 코드가 비상장을 명시한 `PS`만 **비상장 주식**으로 표시합니다. 표기가 없는 행은 **티커 미기재**로만 적어 상장 여부를 해석하지 않습니다(`AB`·`OT` 같은 코드는 상장 여부를 말하지 않습니다). 자산 열은 원문 자산명 전체를 그대로 유지하고 파생 값은 별도 열로만 두며, 규칙은 `src/domain/house.ts`의 `getHousePtrAssetTicker`에 있습니다. 기존 캐시 스냅샷에서 표시 시점에만 계산하므로 **DB 마이그레이션·재수집·API·스냅샷 형식 변경이 필요하지 않습니다.** 이 열은 아직 운영 배포 전입니다.

**자산별 활동 요약**은 같은 최신 PTR 문서 1건의 신고 행을 원문 자산명 문자열과 자산유형 코드 묶음으로만 세어, 거래·원문 자산·옵션 거래 건수와 자산별 건수를 보여 줍니다. 같은 원문 자산명의 주식(`ST`)·옵션(`OP`) 행은 한 항목으로 합치고, 비상장 주식(`PS`)·자산담보부증권(`AB`)처럼 다른 코드는 이름이 같아도 코드를 기준으로 나눕니다. 티커가 같다는 이유만으로 서로 다른 원문 자산명을 합치지 않으며 이름 정규화·티커 추측 매핑을 하지 않습니다. 막대는 최다 건수를 기준으로 한 상대 길이이고 금액·보유 비중·보유 현황이 아니며, 옵션 거래 건수는 전체 거래 건수에 포함된 부분집합입니다. 집계는 `src/domain/house-activity.ts`, 화면은 `src/components/house-activity-summary.tsx`가 담당합니다. 기존 캐시 스냅샷에서 표시 시점에만 계산하므로 **DB 마이그레이션·재수집·API·스냅샷 형식 변경이 필요하지 않습니다.** 이 요약도 아직 운영 배포 전입니다.

## 로컬 실행과 첫 수집

1. `.env.example`의 항목을 참고해 `.env.local`을 설정합니다. 기존 파일을 덮어쓰지 말고 필요한 값만 갱신합니다.
   - `NEXT_PUBLIC_SUPABASE_URL`: 활성 Supabase 프로젝트의 HTTPS URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 프로젝트 공개 키. 현재 서버 조회는 Secret key를 사용합니다.
   - `SUPABASE_SECRET_KEY`: 서버 전용 Secret key. 공개 키로 대체하지 않습니다.
   - `SEC_USER_AGENT`: 앱 이름과 실제 연락 가능한 이메일을 포함한 SEC 요청 식별자.
   - `SYNC_SECRET`: 내부 진입점의 Bearer 인증에 사용할 32자 이상 무작위 비밀값.
   - `APP_URL`: 운영 OAuth callback과 승인 메일의 고정 HTTPS origin(예: `https://example.com`). 경로·쿼리 없이 설정합니다. 로컬 `pnpm dev`에서는 `APP_URL=`로 비워 두면 `localhost`·`127.0.0.1`의 현재 접속 포트를 사용합니다. 명시된 값이 잘못됐으면 자동 감지하지 않습니다. 운영 및 `pnpm start`에서는 필수이며 로컬 자동 감지를 사용하지 않습니다. 승인 메일은 자동 감지하지 않으므로 로컬에서도 메일을 시험하려면 접근 가능한 고정 `APP_URL`이 필요합니다.
   - `ADMIN_EMAIL`: 초기 소유자를 식별하는 서버 전용 주소. 실제 주소는 저장소·README·Wiki·코드·로그에 적지 않습니다.
   - `RESEND_API_KEY`·`RESEND_FROM`: 승인 요청 알림을 보내는 Resend 자격 증명과 발신 주소. 없으면 메일만 생략되고 요청은 `pending`으로 남습니다.
   - Supabase **Authentication → URL Configuration → Redirect URLs**에 개발용 `http://localhost:*/auth/callback`과 `http://127.0.0.1:*/auth/callback`을 등록합니다. 운영은 `https://실제서비스도메인/auth/callback`을 정확히 등록하고 Site URL도 운영 origin으로 설정합니다.
   - Vercel **Production** 환경의 `APP_URL`은 실제 서비스 origin으로 설정한 뒤 재배포합니다. Preview에서 로그인까지 사용할 경우 그 배포의 고정 origin과 정확한 callback 허용 목록을 별도로 설정합니다. `NODE_ENV`는 직접 설정하지 않습니다.
2. Supabase SQL Editor 또는 인증된 마이그레이션 도구에서 `supabase/migrations/202609140001_stanley.sql`, `supabase/migrations/202609150001_ark.sql`, `supabase/migrations/202609160001_house_ptr.sql`, `supabase/migrations/202609180001_access_approval.sql`을 순서대로 한 번씩 적용합니다. 기존 DB를 초기화하지 않으며 이미 적용된 파일은 재실행하지 않습니다. 접근 승인 마이그레이션이 적용되지 않았거나 `ADMIN_EMAIL`이 없으면 승인 화면은 목록 대신 "가입 승인 설정이 필요합니다" 안내를 표시합니다.
3. `pnpm install`, `pnpm dev`로 실행합니다. 홈(`/`)은 로그인 없이 서비스 소개를 표시합니다. 로그인 버튼으로 기존 승인 흐름에 진입하고, 승인된 사용자는 조회 홈 `/main`에서 Stanley·Cathie·Nancy Pelosi 항목으로 이동합니다. Nancy Pelosi 화면은 위 마이그레이션을 적용하지 않았으면 적용 안내를 표시합니다. Cathie의 펀드 선택은 `?fund=ARKQ`처럼 URL에 유지되며 지원하지 않는 값·중복 펀드 선택은 404입니다.
4. 빈 캐시·오래된 캐시에서 `POST /api/sync/stanley`, `POST /api/sync/ark?fund=ARKK`, `POST /api/sync/house`가 자동 요청됩니다. 브라우저의 같은 Origin만 허용합니다. 운영자용 `/api/internal/sync/stanley`, `/api/internal/sync/ark?fund=ARKK`, `/api/internal/sync/house`는 `Authorization: Bearer <SYNC_SECRET>`이 필요하며 각각 같은 조정자를 사용합니다. ARK 요청에는 6개 중 하나의 대문자 펀드 코드가 필요하고, House 요청은 최신 PTR 문서 1건만 대상으로 하므로 추가 파라미터가 없습니다.

키·연락처를 클라이언트 코드나 로그·대화·저장소에 붙여 넣지 않습니다. 설정 누락이나 공식 출처 차단 응답은 성공으로 처리하지 않으며 가짜 종목을 표시하지 않습니다. 로그인과 승인 기반 접근 제한은 저장소에 구현되어 있지만 Google Cloud·Supabase OAuth 설정, `APP_URL`·`ADMIN_EMAIL`·`RESEND_*` 값, 원격 마이그레이션 적용과 실운영 검증이 끝나지 않았으므로 현재 상태를 가족·지인용 운영 서비스로 공개하지 않습니다. 접근 계약과 구현·배포 설정의 구분은 위 "접근 정책" 절을 따릅니다.

Google 브랜딩의 홈페이지·개인정보처리방침·약관에는 배포한 운영 origin의 `/`·`/privacy`·`/terms`를 각각 등록합니다. 페이지 배포와 Google 브랜드 인증은 별개이며, 도메인 소유권 확인과 Google 심사 결과는 보장하지 않습니다. 정책에는 실제 인증·승인·선택적 관리자 메일 처리를 반영했으며, 운영자는 배포 전 연락 방법과 실제 인프라 보존·처리 조건이 맞는지 검토해야 합니다.

같은 Wi-Fi의 휴대폰에서는 `http://192.168.0.17:3000`처럼 개발 PC의 LAN 주소로 접속할 수 있습니다. `next.config.ts`의 `allowedDevOrigins: ["**.*"]`는 점으로 구분된 IPv4 주소·일반 도메인을 폭넓게 허용하므로 개발 PC의 IP가 바뀌어도 목록을 수정할 필요가 없습니다. `localhost`는 기본 허용됩니다. 개발용 WebSocket이 차단되면 설정 반영 여부를 확인하고 페이지를 새로고침합니다. 이 설정은 개발 전용이며 Vercel 프로덕션에는 적용되지 않습니다. 방화벽·공유기·터널을 자동으로 개방하는 설정은 아니므로 다른 네트워크에서 접속하려면 별도의 네트워크 경로가 필요합니다.

### ARK 시간별 동기화 활성화

1. 운영 HTTPS origin에 배포하고 서버 환경 변수를 설정합니다. 로컬 `localhost`나 LAN 주소는 Supabase에서 호출할 수 없습니다.
2. Supabase Dashboard의 Vault 화면에서 `guru_tracker_base_url`에 배포 origin, `guru_tracker_sync_secret`에 서버 `SYNC_SECRET`과 동일한 값을 추가합니다. SQL Editor에 비밀값이 포함된 `create_secret` 문을 넣으면 실행 이력에 남으므로 사용하지 않습니다.
3. `supabase/ark-cron.sql`을 실행합니다. `guru_tracker_ark_hourly` 한 개 job이 매시 7분에 6개 펀드의 보호된 엔드포인트를 각각 호출합니다. 재실행 시 같은 job만 갱신하며 기존 job을 삭제하지 않습니다. 운영에는 이 job을 등록했으며, 등록과 실제 수집 성공은 별개이므로 성공 여부는 4번 조회 예시로 확인합니다. ARK 마이그레이션 적용만으로 Cron이 활성화되지는 않습니다.
4. 파일 끝의 조회 예시로 일정·응답 상태 코드를 확인하고 각 펀드의 마지막 성공 시각을 확인합니다. 요청 헤더·Vault 원문·`net.http_request_queue` 내용을 로그에 복사하지 않습니다. 이 SQL은 Stanley Cron을 등록하지 않습니다.

### House 시간별 동기화 활성화

1. 운영 HTTPS origin에 배포하고 서버 환경 변수를 설정합니다. 로컬 `localhost`나 LAN 주소는 Supabase에서 호출할 수 없습니다.
2. Supabase Dashboard의 Vault 화면에 `guru_tracker_base_url`(배포 origin)과 `guru_tracker_sync_secret`(서버 `SYNC_SECRET`과 같은 값)이 있는지 확인합니다. ARK 절차와 같은 값이며, SQL Editor에 비밀값이 포함된 `create_secret` 문을 넣으면 실행 이력에 남으므로 사용하지 않습니다.
3. `supabase/house-cron.sql`을 실행합니다. `guru_tracker_house_hourly` 한 개 job이 매시 13분에 보호된 엔드포인트 `/api/internal/sync/house`를 한 번 호출하고 제한 시간은 60초입니다. 재실행 시 같은 job만 갱신하며 기존 job을 삭제하지 않습니다. 운영에는 이 job을 등록했습니다. `202609160001_house_ptr.sql`을 적용하지 않았거나 Vault 값이 없으면 이 job은 자료를 만들지 않습니다.
4. 파일 끝의 조회 예시로 일정·응답 상태 코드와 마지막 성공 시각을 확인합니다. 요청 헤더·Vault 원문·`net.http_request_queue` 내용을 로그에 복사하지 않습니다. 이 SQL은 Stanley·ARK Cron을 등록하지 않습니다.
5. `next.config.ts`의 `outputFileTracingIncludes`가 수집을 실행하는 두 house 라우트와 PDF 워커 파일을 함께 지정하는지 확인합니다. pdfjs는 Node에서 워커를 opaque dynamic import로 불러 `@vercel/nft`가 추적하지 못하므로, 이 설정이 없으면 배포 함수에 `pdf.worker.mjs`가 빠지고 PDF 텍스트 추출이 런타임에 실패해 동기화가 503 `HOUSE_VALIDATION`으로 거절됩니다. 현재 설정은 `/api/sync/house`와 `/api/internal/sync/house` 각각에 `realpathSync`로 심링크를 푼 실제 `pdf.worker.mjs` 경로를 프로젝트 루트 기준 POSIX 상대 경로로 넣습니다. **심링크를 거친 경로는 include에 쓰지 않습니다.** pnpm은 `node_modules/pdfjs-dist`를 `.pnpm/pdfjs-dist@<버전>/…`로 가는 심링크로 두는데, 심링크 디렉터리를 거친 파일이 배포 함수 파일 목록에 들어가면 Vercel이 패키징을 거부합니다. 버전 폴더는 하드코딩하지 않고 매번 실제 경로에서 계산합니다.
6. 배포 뒤 `POST /api/internal/sync/house`를 `Authorization: Bearer <SYNC_SECRET>`로 호출해 응답 본문의 `status`를 확인합니다. 최신 배포의 운영 조회 HTTP 200은 사용자 확인이지만 응답 본문은 아직 확인하지 않았으므로 `{"status":"updated"}`·`{"status":"unchanged"}`를 단정하지 않습니다. 503 `HOUSE_VALIDATION`이 오면 함수 번들에 `pdf.worker.mjs`가 들어갔는지 확인합니다.

### 공시 검증과 현재 확인 범위

- 대상 기관은 Duquesne Family Office LLC, CIK `0001536411`입니다. [공식 submissions](https://data.sec.gov/submissions/CIK0001536411.json)에서 최신 보고분기를 선택하고, 그 분기의 원본·정정 공시를 순서대로 처리합니다. `NEW HOLDINGS` 추가분과 `RESTATEMENT` 재작성은 구분하며, 다른 분기의 늦은 정정이 최신 분기를 덮지 않습니다.
- 표지의 신고기관·CIK·보고일·행 수·합계를 정보표와 대조합니다. 2023-01-03 제출부터 USD, 이전 제출은 천 달러 단위로 해석합니다. 큰 정수·CUSIP·SH/PRN을 보존하고 `Put`/`Call`은 `PUT`/`CALL`로 정규화합니다. 수집 시각만 KST로 표시합니다.
- [SEC 작성 지침](https://www.sec.gov/files/form13f.pdf)의 개별 행·총액 반올림을 반영해 합계 차이는 원문 단위에서 `floor(행 수 / 2)` 이내만 허용하며 금액 자체는 보정하지 않습니다. [공개 데이터 필드 정의](https://www.sec.gov/files/form_13f_readme.pdf)에서 nullable인 비공개 누락 표시의 생략은 허용하지만, 명시적인 비공개 누락은 반영을 보류합니다.
- 2026-09-14 [공식 표지](https://www.sec.gov/Archives/edgar/data/1536411/000153641126000006/primary_doc.xml)와 [정보표](https://www.sec.gov/Archives/edgar/data/1536411/000153641126000006/form13f_20260630.xml)의 HTTP 200 응답을 확인했습니다. 공시는 `0001536411-26-000006`, 기준일 2026-06-30, 제출일 2026-08-14이며 95개 보유 항목입니다. 원문 표지 합계 5,210,860과 행 합계 5,210,856의 차이 4는 반올림 경계 이내입니다.
- 실제 내부 동기화 호출은 최초 `updated`, 동일 공시 재처리는 `unchanged`를 반환했습니다. 원격 DB 버전은 1, 현재 보유 항목은 95개로 유지되고 직전 스냅샷은 아직 없습니다. 이전 Archives 403과 환경 설정 문제는 해소됐습니다. 인물별 전체 계좌나 실시간 보유 여부를 검증한 것은 아닙니다.
- `pnpm test`는 합성 XML 경계와 PGlite 인메모리 PostgreSQL에서 중복 반영·정정·단위·큰 정수·lease·권한·transaction 롤백을 검증합니다. 이 결과는 실제 SEC 원문 수집이나 원격 Supabase 검증을 대신하지 않습니다. `pnpm lint`, `pnpm build`로 타입·정적 검사와 빌드를 확인합니다.

### ARK 원문 검증과 현재 확인 범위

- [ARKK](https://www.ark-funds.com/funds/arkk)·[ARKQ](https://www.ark-funds.com/funds/arkq)·[ARKW](https://www.ark-funds.com/funds/arkw)·[ARKG](https://www.ark-funds.com/funds/arkg)·[ARKF](https://www.ark-funds.com/funds/arkf)·[ARKX](https://www.ark-funds.com/funds/arkx)의 공식 다운로드 경로를 확인했습니다. 서버 수집기는 검증된 `assets.ark-funds.com/fund-documents/funds-etf-csv/`의 펀드별 CSV를 직접 요청합니다. 소개 HTML의 서버 요청이 403이어도 로그인·차단 우회는 하지 않으며, CSV 자체가 실패하면 기존 캐시를 유지합니다.
- 실제 수집기로 기준일 **2026-09-14**의 ARKK 47행, ARKQ 39행, ARKW 44행, ARKG 33행, ARKF 41행, ARKX 35행을 확인했습니다. 합계 239행 중 티커가 비어 있는 17행도 보존했습니다. 이는 해당 기준일의 공식 펀드 holdings 검증이며 개인 계좌나 거래 이력의 검증이 아닙니다.
- 필수 CSV 열, 인용 필드, 펀드·기준일 일치, 면책 문구까지의 완전성, 금액과 반올림 비중을 검증합니다. 미국 동부 시간 기준 미래 날짜, 혼합 펀드·날짜, 중복 자산, 잘린 파일은 반영하지 않습니다. 검증된 원문 전체를 비공개 Storage에 보관한 다음에만 스냅샷을 커밋합니다.
- 실제 수집 CSV와 서버·API 함수를 인메모리 PostgreSQL에 연결한 통합 스모크에서 6개 펀드의 최초 반영, 동일 원문 재처리, 캐시 우선 조회, 접근·Cron의 lease 공유, 원문 손상 시 캐시 보존을 확인했습니다. 별도로 마이그레이션 적용 후 실제 Supabase Storage·DB에 6개 펀드를 수집하여 모두 `updated`, 동일 원문 재처리에서 모두 `unchanged`를 확인했습니다. 각 버전은 1, 직전 스냅샷은 null로 유지됩니다. 실제 원격 캐시를 사용하는 Next.js 화면에서 펀드별 총 239행의 데스크톱 표와 ARKK 모바일 카드·도넛을 확인했습니다.
- 회귀 테스트는 CSV 경계, 센트 정밀도·음수 자산, 펀드별 lease, 오래된 펜스, 이벤트 충돌 시 원자 롤백, 익명·로그인 역할의 캐시·RPC·원문 접근 차단을 검증합니다. Cron SQL은 PostgreSQL에서 재등록·요청 구성·설정 오류를 확인했지만 실제 `pg_cron` 실행과 외부 전달은 배포 후 별도 확인해야 합니다.
- 실제 페이지 컴포넌트에 공식 수집 자료를 연결한 **격리 브라우저**에서 1440px 표와 390px 카드의 6개 펀드 전체 행·빈 티커 보존, 도넛, 키보드·터치 툴팁을 확인했습니다. 320px에서는 금액과 수량을 한 열로 쌓아 센트 금액을 한 줄로 읽게 했습니다. 펀드 전환 시 재시도 분리, 음수 자료의 차트 제외·원문 보존, 갱신 성공 뒤 조회 실패의 오류 표시도 확인했습니다. 이 화면 검증은 운영 DB를 사용하지 않았습니다.
- 기존 Stanley는 실제 저장된 캐시로 데스크톱 95행·모바일 95개 카드, 티커·PUT/CALL 표시와 상위 5개·기타 도넛이 유지됨을 확인했습니다. 실제 Next.js 경로에서 잘못된·중복 펀드의 404, 접근 API의 잘못된 펀드 400·다른 Origin 403, 내부 API의 인증 누락 401도 확인했습니다.

### Nancy Pelosi PTR 원문 검증과 현재 확인 범위

- 출처는 하원 공식 공시 서버 `disclosures-clerk.house.gov`의 연도별 색인 zip(`/public_disc/financial-pdfs/2026FD.zip`)과 원문 PDF(`/public_disc/ptr-pdfs/2026/…`)뿐이며 제3자 요약·13F를 쓰지 않습니다. 색인 XML에서 문서번호·이름·주/선거구·연도·제출일을 검증하고, 연도를 올해부터 전년도까지 보며 그 해의 Pelosi PTR(`FilingType` `P`) 중 제출일·문서번호가 가장 뒤인 1건만 고릅니다. 고른 문서번호와 PDF 안의 문서번호·제출자·주/선거구가 모두 일치할 때만 사용하며, PDF 바이트 SHA-256을 `documentHash`, 파싱 결과 JSON의 SHA-256을 `normalizedHash`로 기록해 같은 문서·같은 내용인지 판정합니다.
- 2026 색인의 Pelosi PTR 항목은 `20033725`(제출 1/23)·`20034836`(6/23)·`20035143`(8/21)이고, 확인된 최신 문서는 문서번호 **20035143**, 제출일·서명일 **2026-08-21**, 제출자 Hon. Nancy Pelosi(Member, CA11), 거래 **7행**입니다. [원문 PDF](https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035143.pdf) 기준 `documentHash`는 `d745987c4b51ed65f9c8955932ca5c94a916f758201128d6f9978b4438fdb9e0`, `normalizedHash`는 `92aa1049f0d0ac05f26b3179cacc1302e3d45fdbff19ffdfa2d90c13ec137cdd`입니다.
- 7행은 Bloom Energy 보통주 `ST`·옵션 `OP`(7/24·7/28), Intel 보통주 `ST`·옵션 `OP`(7/24), REOF XXV, LLC(원문 자산유형 `AB`, 7/27)이고 전부 거래유형 `P`(매수)·소유자 코드 `SP`(배우자)입니다. 금액은 원문이 적은 범위 그대로이며 최대는 `$1,000,001 - $5,000,000`입니다. 합계·중간값·비중을 계산하지 않고, 원문에 없는 티커·보유 수량·평가액을 만들지 않습니다. 원문 자산명 끝에 함께 적힌 괄호 표기는 `원문 티커` 열로 그대로 옮기기만 하고 이름이나 다른 출처로 값을 채우지 않습니다.
- 파서는 PDF 텍스트 조각의 좌표를 읽습니다. 표 밖 값은 라벨 x=22, 값 x=99인 조각만 인정하고, 페이지마다 반복되는 표 헤더에서 열 기준 x를 다시 읽으며 거래 행은 페이지 경계를 넘어 이어집니다. 표 종료는 각주 `* For the complete list` 줄로만 판정하고 그 줄을 만나지 못하면 전체를 실패시킵니다. `D:`·`L:`·`C:` 같은 원문 접두는 유지하고, 줄바꿈으로 갈라진 설명·금액 조각은 이어 붙입니다.
- **`Cap. Gains > $200?` 열은 파싱하지 않습니다.** 자산명은 원문 문자열 그대로이고 공식 자산유형 코드표 48종에 없는 코드, 지침에 없는 거래유형, 존재하지 않는 날짜, 원문에 없는 금액 표기는 부분 수용 없이 전체를 실패시킵니다. 원문이 구간이 아닌 단일 금액을 적은 거래(예: `$15.00`)는 표기 그대로 보존합니다.
- Pelosi가 제출한 공식 PTR 문서 6건(2025년 제출 3건·2026년 제출 3건, 1~3페이지, 거래 1~18행, 다중 페이지 표·설명 행·줄바꿈 금액 포함)으로 파서를 대조했고, 문서번호 20035143의 7행은 독립 추출 스냅샷과 모든 필드가 일치했습니다. 색인 XML·PDF를 손상·변형한 입력은 모두 반영되지 않았습니다.
- 실제 수집기가 공식 원문에서 만든 커밋 payload를 **인메모리 PostgreSQL**에 적용한 E2E에서 최초 반영이 `updated`, 같은 원문 재처리가 `unchanged`였습니다. 원문과 색인은 비공개 버킷 `house-originals`에 `house/{documentHash}` 접두사로 저장하도록 구성했습니다. **운영 Supabase에는 이 마이그레이션을 적용하고 배포했습니다. 과거 배포 함수에 pdfjs 워커 파일이 없어 운영 수집이 503 `HOUSE_VALIDATION`을 반환했고, 워커 경로를 고친 최신 배포는 운영 조회 HTTP 200까지 사용자 확인을 받았지만 동기화 응답 본문은 아직 확인하지 않았습니다.**
- 회귀 테스트는 합성 조각의 페이지 경계·금액 분리·설명 행·파일링 상태(`tests/house-parse.test.ts`)와 PGlite 인메모리 PostgreSQL의 lease·스냅샷 회전·오래된 제출 거부·같은 원문 해시의 정규화 불일치 실패·펜스 불일치 차단(`tests/house-ptr-state.test.ts`)을 검증합니다. 이 결과는 실제 원문 수집이나 원격 Supabase 검증을 대신하지 않습니다.
- 실제 페이지 컴포넌트에 검증된 스냅샷을 연결한 **격리 브라우저**에서 1440px 표와 390px 카드로 거래 7행, `매수 · P`·`배우자 · SP`·`거래금액 범위` 표기, 320px~1440px 가로 오버플로 없음, 캐시 준비·데이터 없음·조회 오류·설정 필요·갱신 중·오래된 캐시·이전 스냅샷 상태 전환을 확인했습니다. 같은 격리 화면에서 데스크톱 표와 모바일 카드의 `원문 티커` 열이 공식 최신 원문 7행의 `(BE)`·`(INTC)` 괄호 표기를 그대로 옮긴 `BE`·`INTC`로 표시되고, 표기가 없는 `REOF XXV, LLC` 행은 `티커 미기재`로 표시되는 것을 확인했습니다. 이어서 검증용 행을 별도로 추가해 `AB` 자산유형에서도 원문 괄호 티커가 보존되는지와 `PS` 행이 `비상장 주식`으로 표시되는지도 확인했습니다. 이 화면 검증은 운영 DB를 사용하지 않았습니다.
- 같은 격리 화면에서 **자산별 활동 요약**을 실제 Next.js로 확인했습니다. 1440px·390px·320px 모두에서 총 거래 7건·원문 자산 3개·옵션 거래 3건, 자산별 `BE` 4건·`INTC` 2건·`REOF XXV, LLC` 1건과 최다 건수 기준 막대 상대 길이(4·2·1건 → 100%·50%·25%)를 확인했고, 320px에서도 세 지표가 한 줄에 유지됐습니다. 거래가 없는 요약의 안내 문구, 긴 자산명의 줄바꿈, 같은 이름의 주식·옵션 병합과 `AB`·`PS` 분리 경계, 옵션 거래 건수가 전체 거래 건수의 부분집합으로 표시되는지도 함께 확인했습니다. 이 화면 검증도 운영 DB를 사용하지 않았습니다.
- **운영 Supabase에는 `supabase/migrations/202609160001_house_ptr.sql`을 적용했고 House Cron도 등록했습니다.** 화면은 적용 전에만 자료 대신 적용 안내를 표시하므로 지금은 설정 누락 상태가 아닙니다. 워커 경로를 고친 최신 배포는 운영 조회 HTTP 200까지 사용자 확인을 받았지만 `POST /api/internal/sync/house`의 응답 본문(`{"status":"updated"}`·`{"status":"unchanged"}`)은 아직 확인하지 않아 운영 수집 결과를 단정하지 않습니다(§ House 시간별 동기화 활성화). 기존 Stanley·ARK 자료에는 영향이 없습니다.

## 개발 워크플로

이 프로젝트는 OMP 지침과 LLM Wiki를 함께 사용해 설계 근거와 구현 지식을 분리해 관리할 예정입니다.

- `.omp/`: OMP 프로젝트 지침, 규칙, 에이전트, 스킬을 관리합니다.
- `.wiki/raw/`: 사람이 소유하는 변경 불가의 근거·원문 기록 영역입니다. 원문 언어를 보존합니다.
- `.wiki/wiki/`: LLM이 관리하는 종합 지식 영역입니다. 초기 생성 지식 문서는 영어로 작성할 수 있습니다.
- `.wiki/`: 대화의 구조화 기록, 인덱스, 로그와 Wiki 스키마를 관리합니다.

별도의 프로젝트 `.omp/config.yml` 없이 현재 프로필의 전역 설정을 상속합니다. 프로젝트 고유 작업 지침은 `.omp/AGENTS.md`, 공식 출처·동기화·코드 주석의 불변 조건은 `.omp/RULES.md`에서 관리합니다. 승인 정책과 명령 패턴은 프로젝트에서 중복 정의하지 않습니다.

OMP 파일, 스킬, 에이전트, README, UI 문구와 커밋 메시지는 한국어로 작성하는 것을 원칙으로 합니다. 다만 구조 이름, 파일명, frontmatter 키, 코드·API·데이터베이스 식별자는 영어를 사용합니다.

## 현재 저장소 구조

```text
.
├── .husky/               # Git hook 진입점
├── .omp/                 # OMP 지침·규칙·에이전트·스킬
├── .wiki/                # LLM Wiki 스키마·기록·지식
│   ├── raw/              # 사람 소유의 불변 근거 원문
│   └── wiki/             # LLM 소유의 종합 지식
├── huskyhooks/           # 타입·Biome 커밋/병합 검사
├── src/
│   ├── proxy.ts          # 접근 상태 판정과 Supabase 세션 갱신
│   ├── app/              # 홈·승인 화면(`/login`·`/pending`·`/admin`)·조회 홈과 상세·갱신 API
│   ├── components/       # 공통 차트·갱신 상태·출처별 어댑터·shadcn/ui
│   ├── domain/           # SEC·ARK·PTR 데이터 계약·금액 집계·접근 상태 판정
│   ├── hooks/            # Guru 전용 명령형 라우터
│   ├── lib/              # 십진 금액·클래스 병합 유틸리티
│   └── server/           # SEC·ARK·PTR 수집·검증·Supabase 조정자·가입 승인 저장소·메일
├── supabase/             # 마이그레이션과 ARK·House Cron 운영 SQL, 접근 승인 테이블
├── tests/                # 공시 정규화·DB 무결성·가입 승인 회귀 검증
├── biome.json
├── components.json      # shadcn/ui 설정
├── package.json
└── pnpm-lock.yaml
```

Stanley 흐름은 `src/server/sec.ts`, `src/server/stanley.ts`와 `supabase/migrations/202609140001_stanley.sql`, ARK 흐름은 `src/server/ingestion/ark/`, `src/server/ark.ts`와 `supabase/migrations/202609150001_ark.sql`, Nancy Pelosi 흐름은 `src/server/ingestion/house/`, `src/server/house.ts`, `src/components/house-refresh.tsx`와 `supabase/migrations/202609160001_house_ptr.sql`이 담당하며 동기화 Cron은 `supabase/house-cron.sql`로 등록합니다. 가입 승인 흐름은 `src/proxy.ts`(화면 접근 판정과 세션 갱신), `src/domain/access.ts`(상태·경로 판정), `src/server/access.ts`·`src/server/access-store.ts`(가입 요청·결정 RPC), `src/server/mail.ts`(provider API 알림)와 `supabase/migrations/202609180001_access_approval.sql`이 담당하고, 회귀 검증은 `tests/access-approval.test.ts`가 맡습니다.

## 이용 안내

Guru Tracker는 가족과 지인을 위한 개인적 용도의 프로젝트이며, Vercel Hobby와 Supabase의 무료 등급을 전제로 설계하고 있습니다. 모든 공시 데이터에는 공개 시차, 누락, 정정 및 해석 한계가 있을 수 있습니다.

**이 저장소와 향후 서비스의 정보는 투자 조언, 매수·매도 권유, 수익 보장 또는 특정 투자 판단의 근거가 아닙니다.** 투자 결정 전에는 원문 공시와 신뢰할 수 있는 전문가의 조언을 별도로 확인해야 합니다.
