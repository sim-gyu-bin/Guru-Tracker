# Guru Tracker

> 가족·지인이 공개 공시를 더 쉽게 확인하도록 돕기 위한 투자 공개정보 추적 프로젝트

## 현재 상태

**Linear 제품 내부 UI를 기준으로 홈과 Stanley Druckenmiller 상세 조회 화면을 구현했습니다.** Stanley용 SEC 13F 수집·검증, Supabase DB·Storage 저장, 멱등 동기화 조정자와 SQL 마이그레이션이 포함됩니다. 원격 Supabase에서 실제 공시 저장과 동일 공시 재처리, 데스크톱·모바일의 95개 보유 항목 표시를 확인했습니다. 다른 여섯 대상의 수집, 로그인, 설치형 PWA, Web Push, 운영 배포와 시간별 Cron은 **계획**입니다.

## 목적

Guru Tracker는 서로 다른 공개 공시 형식을 한곳에서 읽기 쉽게 정리해, 다음 일곱 인물·기관의 공개 보유·거래 정보를 확인할 수 있게 하려는 서비스입니다.

| 추적 대상 | 예정 공식 출처 |
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
- **ARK Invest 공식 holdings/trades**: Cathie Wood 관련 데이터에는 ARK가 공개한 일별 holdings 및 trades 자료를 사용합니다. 접근 공백 중 놓친 일별 이력은 나중에 접속해서 재구성할 수 없습니다.
- **U.S. House PTR**: Nancy Pelosi 관련 데이터에는 U.S. House가 공개하는 Periodic Transaction Report를 사용합니다. PTR은 공시 문서에 기초하므로 거래 시점·금액·상세 정보의 공개 범위와 시차를 그대로 따릅니다.

Stanley 수집기는 공식 SEC 제출 목록과 원문만 사용합니다. 나머지 출처 수집기도 같은 원칙을 따를 예정이며, 13F를 실시간 데이터처럼 표시하거나 불완전한 공시에서 사실을 단정하지 않습니다.

## 동기화 구현과 운영 계획

### 시간별 동기화와 접근 시 보완

무료 등급 구성을 유지하기 위해 **Supabase Cron**을 시간마다 한 번 실행할 계획입니다. `pg_cron`과 `pg_net`이 보호된 Next.js 내부 동기화 엔드포인트를 호출하며, 호출 비밀값은 Supabase Vault 및 서버 전용 설정에만 보관합니다. 시간별 일정에는 Vercel Hobby Cron을 사용하지 않습니다. Vercel Hobby Cron은 시간별 실행에 적합하지 않기 때문입니다.

Stanley의 접근 시 갱신과 보호된 내부 진입점은 DB lease를 사용하는 동일한 멱등 조정자를 호출합니다. 화면은 저장된 데이터를 먼저 읽고, 마지막 성공 후 한 시간이 지났거나 캐시가 비었을 때 접근 갱신을 요청합니다. lease는 90초, 재시도 간격은 최소 60초이며 만료된 작업의 뒤늦은 커밋은 펜싱 토큰으로 차단합니다. 시간별 Cron은 아직 활성화하지 않았습니다. 따라서 현재 접근 갱신만으로 24시간 자동 수집이 운영되는 것은 아닙니다.

### 안전한 스냅샷 관리

Stanley 마이그레이션은 **현재 스냅샷과 직전 스냅샷만** 보존합니다. 직전은 직전 분기가 아니라 이전에 반영한 버전이며 최초 수집 때는 없습니다. 원문 검증 후 실제 정규화 데이터가 달라질 때만 하나의 transaction에서 스냅샷을 회전하고 버전·변경 이벤트를 기록합니다. 같은 데이터의 새 정정 공시는 버전을 올리지 않고 출처 메타데이터만 갱신합니다. 원문은 콘텐츠 해시 주소로 저장하며 동일 객체를 덮어쓰지 않습니다. 이벤트에는 30일 보존 기준을 기록하지만 자동 삭제 작업은 없고, 고아 원문을 포함한 실제 정리는 별도 승인 대상입니다.

### 변경 알림 Web Push

유효성 검사를 통과한 데이터베이스 트랜잭션이 실제 변경 이벤트를 만든 **뒤에만** Web Push 발송을 outbox에 넣을 계획입니다. 커밋 전에는 알림을 만들지 않으며, Push 발송 실패가 원문·스냅샷 저장을 롤백하지 않습니다. 이벤트와 문서의 고유 키, outbox를 사용해 중복 발송을 막고, 전달된 outbox 및 이벤트 이력은 짧은 보존 기간 뒤 정리합니다(정확한 기간은 구현 시 결정).

알림은 PWA service worker와 VAPID를 사용하는 표준 Web Push로 계획합니다. 권한은 사용자 동작에서만 opt-in으로 요청합니다. iOS의 일반적인 Push 흐름에서는 Home Screen에 설치한 웹 앱이 필요하지만, PWA Web Push를 위해 Apple Developer 계정은 필요하지 않습니다. 만료되었거나 유효하지 않은 subscription은 Push 서비스의 `404` 또는 `410` 응답을 받으면 제거합니다.

## 기술 구성

| 영역 | 구성 | 상태 |
| --- | --- | --- |
| 웹 애플리케이션 | Next.js App Router | Linear 스타일 홈·Stanley 상세 조회 구현 |
| 개발 도구 | pnpm, TypeScript, Biome, Husky, Tailwind CSS | 구현 |
| UI 컴포넌트 | Tailwind CSS 4, shadcn/ui (Radix 기반), Recharts | 버튼·배지·표·상태 안내·공시 비중 도넛 차트 구현 |
| 호스팅 | Vercel Hobby | 계획 |
| 데이터베이스·파일 저장소 | Supabase PostgreSQL / Storage | Stanley 실원문 저장·동일 공시 재처리 검증 완료 |
| 클라이언트 제공 방식 | PWA-first | 계획 |

공시 원문은 비공개 Supabase Storage `sec-originals` 버킷에 저장합니다. 이 저장소의 LLM Wiki 원문 보관 영역을 운영 데이터 저장소로 사용하지 않습니다.

화면 배치·반응형·상태 스타일은 JSX의 Tailwind 유틸리티로 작성합니다. `src/components/ui/`의 shadcn/ui 컴포넌트를 재사용하고, `globals.css`에는 Tailwind 로딩·공통 테마 토큰·최소 기본 스타일만 둡니다. 화면별 전역 CSS 클래스나 `@apply` 기반 별도 스타일 체계는 사용하지 않습니다. `components.json`에 CLI 설정, `src/lib/utils.ts`에 공통 클래스 병합 진입점을 둡니다.

Stanley 상세의 **13F 공시 평가금액 구성**은 저장된 스냅샷을 상위 5개와 기타로 집계합니다. CUSIP·증권 종류·PUT/CALL·수량 단위가 같은 항목만 합치며, 금액 합산·순위는 `BigInt`로 계산합니다. 도넛 옆 목록에 비중과 USD 금액을 항상 표시하고, 모바일에서는 차트 아래로 배치합니다. 차트에 키보드 포커스를 둔 뒤 좌우 방향키로 툴팁 항목을 이동할 수 있습니다. 빈 공시·총액 0은 차트를 그리지 않습니다.

마우스를 올리거나 모바일에서 조각을 탭하면 세부 툴팁을 확인할 수 있습니다. 화면의 텍스트 목록은 툴팁 사용 여부와 관계없이 유지됩니다.

이 비중은 **공시 기준일의 제출 금액 구성**이며 현재 전체 자산 배분을 뜻하지 않습니다. 옵션 금액은 매입원금·프리미엄·손익으로 해석하지 않습니다. 집계는 `src/domain/holding-allocation.ts`, 화면은 `src/components/holding-allocation-chart.tsx`가 담당하며 추가 수집이나 DB 저장은 하지 않습니다.

## 로컬 실행과 첫 수집

1. `.env.example`의 항목을 참고해 `.env.local`을 설정합니다. 기존 파일을 덮어쓰지 말고 필요한 값만 갱신합니다.
   - `NEXT_PUBLIC_SUPABASE_URL`: 활성 Supabase 프로젝트의 HTTPS URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 프로젝트 공개 키. 현재 서버 조회는 Secret key를 사용합니다.
   - `SUPABASE_SECRET_KEY`: 서버 전용 Secret key. 공개 키로 대체하지 않습니다.
   - `SEC_USER_AGENT`: 앱 이름과 실제 연락 가능한 이메일을 포함한 SEC 요청 식별자.
   - `SYNC_SECRET`: 내부 진입점의 Bearer 인증에 사용할 32자 이상 무작위 비밀값.
2. Supabase SQL Editor 또는 인증된 마이그레이션 도구에서 `supabase/migrations/202609140001_stanley.sql`을 한 번 적용합니다. 기존 DB를 초기화하는 명령은 필요하지 않습니다. 이미 적용된 마이그레이션을 재실행하지 않습니다.
3. `pnpm install`, `pnpm dev`로 실행합니다. 홈(`/`)에서 Stanley 항목을 누르면 `/gurus/stanley-druckenmiller`로 이동합니다.
4. 설정과 DB가 준비되면 빈 캐시·오래된 캐시에서 `POST /api/sync/stanley`가 자동 요청됩니다. 브라우저의 같은 Origin만 허용합니다. 운영자용 `POST /api/internal/sync/stanley`는 `Authorization: Bearer <SYNC_SECRET>`이 필요하며 같은 조정자를 사용합니다.

키·연락처를 클라이언트 코드나 로그·대화·저장소에 붙여 넣지 않습니다. 설정 누락이나 SEC 차단 응답은 성공으로 처리하지 않으며 가짜 종목을 표시하지 않습니다. 로그인과 접근 제한은 아직 없으므로 현재 상태를 가족·지인용 운영 서비스로 공개하지 않습니다.

### 공시 검증과 현재 확인 범위

- 대상 기관은 Duquesne Family Office LLC, CIK `0001536411`입니다. [공식 submissions](https://data.sec.gov/submissions/CIK0001536411.json)에서 최신 보고분기를 선택하고, 그 분기의 원본·정정 공시를 순서대로 처리합니다. `NEW HOLDINGS` 추가분과 `RESTATEMENT` 재작성은 구분하며, 다른 분기의 늦은 정정이 최신 분기를 덮지 않습니다.
- 표지의 신고기관·CIK·보고일·행 수·합계를 정보표와 대조합니다. 2023-01-03 제출부터 USD, 이전 제출은 천 달러 단위로 해석합니다. 큰 정수·CUSIP·SH/PRN을 보존하고 `Put`/`Call`은 `PUT`/`CALL`로 정규화합니다. 수집 시각만 KST로 표시합니다.
- [SEC 작성 지침](https://www.sec.gov/files/form13f.pdf)의 개별 행·총액 반올림을 반영해 합계 차이는 원문 단위에서 `floor(행 수 / 2)` 이내만 허용하며 금액 자체는 보정하지 않습니다. [공개 데이터 필드 정의](https://www.sec.gov/files/form_13f_readme.pdf)에서 nullable인 비공개 누락 표시의 생략은 허용하지만, 명시적인 비공개 누락은 반영을 보류합니다.
- 2026-09-14 [공식 표지](https://www.sec.gov/Archives/edgar/data/1536411/000153641126000006/primary_doc.xml)와 [정보표](https://www.sec.gov/Archives/edgar/data/1536411/000153641126000006/form13f_20260630.xml)의 HTTP 200 응답을 확인했습니다. 공시는 `0001536411-26-000006`, 기준일 2026-06-30, 제출일 2026-08-14이며 95개 보유 항목입니다. 원문 표지 합계 5,210,860과 행 합계 5,210,856의 차이 4는 반올림 경계 이내입니다.
- 실제 내부 동기화 호출은 최초 `updated`, 동일 공시 재처리는 `unchanged`를 반환했습니다. 원격 DB 버전은 1, 현재 보유 항목은 95개로 유지되고 직전 스냅샷은 아직 없습니다. 이전 Archives 403과 환경 설정 문제는 해소됐습니다. 인물별 전체 계좌나 실시간 보유 여부를 검증한 것은 아닙니다.
- `pnpm test`는 합성 XML 경계와 PGlite 인메모리 PostgreSQL에서 중복 반영·정정·단위·큰 정수·lease·권한·transaction 롤백을 검증합니다. 이 결과는 실제 SEC 원문 수집이나 원격 Supabase 검증을 대신하지 않습니다. `pnpm lint`, `pnpm build`로 타입·정적 검사와 빌드를 확인합니다.

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
│   ├── app/              # 홈·Stanley 상세·갱신 API
│   ├── components/       # 공통 화면·갱신 상태·shadcn/ui
│   ├── domain/           # SEC 조회 데이터 계약
│   ├── lib/              # 공통 클래스 병합 유틸리티
│   └── server/           # SEC 수집·검증·Supabase 조정자
├── supabase/migrations/  # 스냅샷·lease·권한·Storage SQL
├── tests/               # 공시 정규화와 DB 무결성 회귀 검증
├── biome.json
├── components.json      # shadcn/ui 설정
├── package.json
└── pnpm-lock.yaml
```

Stanley 흐름의 구현 파일은 `src/server/sec.ts`, `src/server/stanley.ts`와 `supabase/migrations/202609140001_stanley.sql`입니다.

## 이용 안내

Guru Tracker는 가족과 지인을 위한 개인적 용도의 프로젝트이며, Vercel Hobby와 Supabase의 무료 등급을 전제로 설계하고 있습니다. 모든 공시 데이터에는 공개 시차, 누락, 정정 및 해석 한계가 있을 수 있습니다.

**이 저장소와 향후 서비스의 정보는 투자 조언, 매수·매도 권유, 수익 보장 또는 특정 투자 판단의 근거가 아닙니다.** 투자 결정 전에는 원문 공시와 신뢰할 수 있는 전문가의 조언을 별도로 확인해야 합니다.
