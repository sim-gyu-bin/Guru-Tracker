# Guru Tracker

> 가족·지인이 공개 공시를 더 쉽게 확인하도록 돕기 위한 투자 공개정보 추적 프로젝트

## 현재 상태

**Linear 제품 내부 UI를 기준으로 홈, Stanley Druckenmiller와 Cathie Wood 상세 조회를 구현했습니다.** Stanley의 SEC 13F와 ARK 6개 펀드의 공식 holdings 수집·검증, Supabase DB·Storage 저장, 멱등 동기화 조정자와 SQL 마이그레이션이 포함됩니다. Stanley는 원격 저장·재처리와 95개 보유 항목 표시를 확인했습니다. ARK도 공식 CSV 6개, 원격 저장·동일 원문 재처리와 실제 캐시 화면 조회를 확인했습니다. 나머지 다섯 대상의 수집, ARK trades, 로그인, 설치형 PWA, Web Push와 운영 배포는 **계획**입니다. ARK 시간별 Cron 설정 SQL은 작성했지만 활성화하지 않았습니다.

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
- **U.S. House PTR**: Nancy Pelosi 관련 데이터에는 U.S. House가 공개하는 Periodic Transaction Report를 사용합니다. PTR은 공시 문서에 기초하므로 거래 시점·금액·상세 정보의 공개 범위와 시차를 그대로 따릅니다.

Stanley 수집기는 공식 SEC 제출 목록과 원문, ARK 수집기는 공식 holdings CSV만 사용합니다. 나머지 출처 수집기도 같은 원칙을 따를 예정이며, 13F를 실시간 데이터처럼 표시하거나 불완전한 공시에서 사실을 단정하지 않습니다.

## 동기화 구현과 운영 계획

### 시간별 동기화와 접근 시 보완

무료 등급 구성을 유지하기 위해 **Supabase Cron**을 시간마다 한 번 실행할 계획입니다. `pg_cron`과 `pg_net`이 보호된 Next.js 내부 동기화 엔드포인트를 호출하며, 호출 비밀값은 Supabase Vault 및 서버 전용 설정에만 보관합니다. 시간별 일정에는 Vercel Hobby Cron을 사용하지 않습니다. Vercel Hobby Cron은 시간별 실행에 적합하지 않기 때문입니다.

Stanley와 ARK는 각각 접근 갱신과 보호된 내부 진입점이 같은 멱등 조정자·DB lease를 공유합니다. ARK의 lease와 캐시는 펀드별로 분리됩니다. 화면은 저장된 데이터를 먼저 읽고, 마지막 성공 후 한 시간이 지났거나 캐시가 비었을 때 접근 갱신을 요청합니다. lease는 90초, 재시도 간격은 최소 60초이며 만료된 작업의 뒤늦은 커밋은 펜싱 토큰으로 차단합니다. 공통 갱신 컴포넌트는 펀드를 바꿀 때 요청 상태를 초기화하고 펀드별 쿨다운을 적용합니다. 시간별 Cron은 아직 활성화하지 않았으므로 접근 갱신만으로 24시간 자동 수집이 운영되는 것은 아닙니다.

### 안전한 스냅샷 관리

Stanley와 ARK 마이그레이션은 대상별 **현재 스냅샷과 직전 스냅샷만** 보존합니다. 직전은 직전 분기·거래일이 아니라 이전에 반영한 버전이며 최초 수집 때는 없습니다. 원문 검증 후 실제 정규화 데이터가 달라질 때만 하나의 transaction에서 스냅샷을 회전하고 버전·변경 이벤트를 기록합니다. 같은 데이터의 새 출처는 버전을 올리지 않고 메타데이터만 갱신합니다. ARK는 기준일·행 순서·면책 문구만 바뀐 경우 보유 변경으로 기록하지 않습니다. 원문은 콘텐츠 해시 주소로 저장하며 동일 객체를 덮어쓰지 않습니다. 이벤트에는 30일 보존 기준을 기록하지만 자동 삭제 작업은 없고, 고아 원문을 포함한 실제 정리는 별도 승인 대상입니다.

### 변경 알림 Web Push

유효성 검사를 통과한 데이터베이스 트랜잭션이 실제 변경 이벤트를 만든 **뒤에만** Web Push 발송을 outbox에 넣을 계획입니다. 커밋 전에는 알림을 만들지 않으며, Push 발송 실패가 원문·스냅샷 저장을 롤백하지 않습니다. 이벤트와 문서의 고유 키, outbox를 사용해 중복 발송을 막고, 전달된 outbox 및 이벤트 이력은 짧은 보존 기간 뒤 정리합니다(정확한 기간은 구현 시 결정).

알림은 PWA service worker와 VAPID를 사용하는 표준 Web Push로 계획합니다. 권한은 사용자 동작에서만 opt-in으로 요청합니다. iOS의 일반적인 Push 흐름에서는 Home Screen에 설치한 웹 앱이 필요하지만, PWA Web Push를 위해 Apple Developer 계정은 필요하지 않습니다. 만료되었거나 유효하지 않은 subscription은 Push 서비스의 `404` 또는 `410` 응답을 받으면 제거합니다.

## 기술 구성

| 영역 | 구성 | 상태 |
| --- | --- | --- |
| 웹 애플리케이션 | Next.js App Router | Linear 스타일 홈·Stanley·Cathie 상세 조회 구현 |
| 개발 도구 | pnpm, TypeScript, Biome, Husky, Tailwind CSS | 구현 |
| UI 컴포넌트 | Tailwind CSS 4, shadcn/ui (Radix 기반), Recharts | 버튼·배지·표·상태 안내·공시 비중 도넛 차트 구현 |
| 호스팅 | Vercel Hobby | 계획 |
| 데이터베이스·파일 저장소 | Supabase PostgreSQL / Storage | Stanley·ARK 원격 저장·동일 원문 재처리 검증 완료 |
| 클라이언트 제공 방식 | PWA-first | 계획 |

공시 원문은 비공개 Supabase Storage의 `sec-originals`와 `ark-originals` 버킷에 구분해 저장합니다. 이 저장소의 LLM Wiki 원문 보관 영역을 운영 데이터 저장소로 사용하지 않습니다.

화면 배치·반응형·상태 스타일은 JSX의 Tailwind 유틸리티로 작성합니다. `src/components/ui/`의 shadcn/ui 컴포넌트를 재사용하고, `globals.css`에는 Tailwind 로딩·공통 테마 토큰·최소 기본 스타일만 둡니다. 화면별 전역 CSS 클래스나 `@apply` 기반 별도 스타일 체계는 사용하지 않습니다. `components.json`에 CLI 설정, `src/lib/utils.ts`에 공통 클래스 병합 진입점을 둡니다.

내부 이동 링크는 `GuruLink`, 명령형 이동은 `useGuruRouter`를 사용합니다. 루트의 `NavigationProvider`가 Next.js의 링크 pending 상태와 React transition을 모아, 이동이 120ms 이상 걸릴 때 화면 최상단에 2px 진행 바를 표시합니다. 기존 화면은 유지하며 ARK의 `?fund=` 변경도 포함합니다. `refresh()`와 `prefetch()`는 진행 바를 시작하지 않으므로 캐시 동기화의 백그라운드 갱신은 조용하게 유지됩니다. 별도의 로딩 라이브러리는 추가하지 않았습니다.

진행 바는 8%부터 시작해 400ms마다 남은 연출 구간의 일부를 채우며 94%에 점차 접근합니다. 이동 완료 시에만 100%로 늘어난 뒤 페이드아웃합니다. 실제 전송량·완료율을 뜻하지 않으며, 모션 감소 설정에서는 길이와 투명도의 보간을 생략합니다. 지연시킨 실제 펀드 이동에서 약 8% → 47% 증가, 완료 목표 100%, 종료 후 숨김을 확인했습니다.

실제 Next.js 화면에서 RSC 요청을 지연시켜 페이지·펀드 전환, 기존 화면 유지, 앞선 요청이 끝난 뒤에도 마지막 이동의 표시 유지, 완료 후 표시 종료를 확인했습니다. 동일 URL·취소된 클릭에서 표시가 남지 않고, 실제 `router.refresh()`에서는 표시되지 않았습니다. 1440px·390px 화면과 모션 감소 설정도 확인했습니다.

Stanley 상세의 **13F 공시 평가금액 구성**은 저장된 스냅샷을 상위 5개와 기타로 집계합니다. CUSIP·증권 종류·PUT/CALL·수량 단위가 같은 항목만 합치며, 금액 합산·순위는 `BigInt`로 계산합니다. 도넛 옆 목록에 비중과 USD 금액을 항상 표시하고, 모바일에서는 차트 아래로 배치합니다. 차트에 키보드 포커스를 둔 뒤 좌우 방향키로 툴팁 항목을 이동할 수 있습니다. 빈 공시·총액 0은 차트를 그리지 않습니다.

마우스를 올리거나 모바일에서 조각을 탭하면 세부 툴팁을 확인할 수 있습니다. 화면의 텍스트 목록은 툴팁 사용 여부와 관계없이 유지됩니다.

이 비중은 **공시 기준일의 제출 금액 구성**이며 현재 전체 자산 배분을 뜻하지 않습니다. 옵션 금액은 매입원금·프리미엄·손익으로 해석하지 않습니다. 집계는 `src/domain/holding-allocation.ts`, 화면은 `src/components/holding-allocation-chart.tsx`가 담당하며 추가 수집이나 DB 저장은 하지 않습니다.

보유 종목 목록은 1024px 미만 화면에서 단일 열 카드로, 그 이상에서는 표로 표시합니다. 카드에는 종목명·티커·증권 종류·USD 평가금액·수량과 단위·CUSIP을 표시하고, PUT/CALL은 배지로 구분합니다. 사용자 화면의 공시 원문·정보표 새 탭 버튼은 제공하지 않지만, 내부 공식 원문 수집·검증·저장과 공시 기준일 표시는 유지합니다.

티커는 [OpenFIGI API](https://www.openfigi.com/api/documentation)의 **현재 미국 시장 참조 정보**입니다. 공시의 CUSIP·CINS를 정확히 조회하며, [CGS 식별자 규칙](https://www.cusip.com/identifiers.html)에 따라 첫 글자가 영문자인 CINS는 `ID_CINS`, 숫자로 시작하는 CUSIP은 `ID_CUSIP`으로 요청합니다. 미국 Equity의 유일한 티커·FIGI 조합만 표시하고, 이름 추측·다른 시장·비상장 식별자 대체는 하지 않습니다. 미매핑은 `—`, 일시적인 공급자 실패는 `일시 불가`로 구분합니다. SH와 옵션 기초자산에만 적용하며 PRN에는 적용하지 않습니다.

`src/server/tickers.ts`는 API 키 없이 최대 10건씩 순차 조회하고, 검증된 배치 결과를 Next 데이터 캐시에 24시간 저장합니다. 최초 조회 중에도 기존 공시 목록·차트를 먼저 표시하며, 매핑 결과는 카드·표·차트 범례와 툴팁에 반영합니다. 실패한 배치는 정상 미매핑으로 캐시하지 않고, 다른 배치의 결과와 재검증 전 정상 캐시는 보존합니다. 참조 티커는 공시 기준일 당시의 티커가 아니며 SEC 스냅샷·dataset version·변경 이벤트를 수정하지 않습니다.

Cathie 상세(`/gurus/cathie-wood`)는 **ARKK를 기본값**으로 ARKQ·ARKW·ARKG·ARKF·ARKX를 선택합니다. 공식 CSV의 원문 티커를 그대로 표시하므로 `RKLB UQ` 같은 표기도 유지하며, 빈 티커와 비표준 식별자를 추측·제외하지 않습니다. ARK에는 OpenFIGI 매핑이나 SEC의 SH/PRN 단위를 적용하지 않습니다.

ARK 금액은 USD 센트, 수량은 소수 문자열로 보존하고 금액 합산·순위에는 `BigInt`를 사용합니다. 모바일 카드와 데스크톱 표는 원문 금액·수량·공식 비중을 표시합니다. 상위 5개·기타 도넛은 평가금액에서 재계산한 비중이므로 공식 반올림 비중과 조금 다를 수 있습니다. 음수 평가금액이 있으면 오해를 줄 수 있는 도넛·비중 범례 대신 안내를 표시하고 원문 표는 유지합니다. `src/domain/ark-allocation.ts`와 ARK 어댑터가 출처 차이를 처리하며, 도넛 표현과 캐시 갱신 제어는 Stanley와 공통 컴포넌트를 사용합니다.

## 로컬 실행과 첫 수집

1. `.env.example`의 항목을 참고해 `.env.local`을 설정합니다. 기존 파일을 덮어쓰지 말고 필요한 값만 갱신합니다.
   - `NEXT_PUBLIC_SUPABASE_URL`: 활성 Supabase 프로젝트의 HTTPS URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 프로젝트 공개 키. 현재 서버 조회는 Secret key를 사용합니다.
   - `SUPABASE_SECRET_KEY`: 서버 전용 Secret key. 공개 키로 대체하지 않습니다.
   - `SEC_USER_AGENT`: 앱 이름과 실제 연락 가능한 이메일을 포함한 SEC 요청 식별자.
   - `SYNC_SECRET`: 내부 진입점의 Bearer 인증에 사용할 32자 이상 무작위 비밀값.
2. Supabase SQL Editor 또는 인증된 마이그레이션 도구에서 `supabase/migrations/202609140001_stanley.sql`, `supabase/migrations/202609150001_ark.sql`을 순서대로 한 번씩 적용합니다. 기존 DB를 초기화하지 않으며 이미 적용된 파일은 재실행하지 않습니다.
3. `pnpm install`, `pnpm dev`로 실행합니다. 홈(`/`)에서 Stanley 또는 Cathie 항목으로 이동합니다. Cathie의 펀드 선택은 `?fund=ARKQ`처럼 URL에 유지되며 지원하지 않는 값·중복 펀드 선택은 404입니다.
4. 빈 캐시·오래된 캐시에서 `POST /api/sync/stanley` 또는 `POST /api/sync/ark?fund=ARKK`가 자동 요청됩니다. 브라우저의 같은 Origin만 허용합니다. 운영자용 `/api/internal/sync/stanley`, `/api/internal/sync/ark?fund=ARKK`는 `Authorization: Bearer <SYNC_SECRET>`이 필요하며 각각 같은 조정자를 사용합니다. ARK 요청에는 6개 중 하나의 대문자 펀드 코드가 필요합니다.

키·연락처를 클라이언트 코드나 로그·대화·저장소에 붙여 넣지 않습니다. 설정 누락이나 공식 출처 차단 응답은 성공으로 처리하지 않으며 가짜 종목을 표시하지 않습니다. 로그인과 접근 제한은 아직 없으므로 현재 상태를 가족·지인용 운영 서비스로 공개하지 않습니다.

같은 Wi-Fi의 휴대폰에서는 `http://192.168.0.17:3000`처럼 개발 PC의 LAN 주소로 접속할 수 있습니다. `next.config.ts`의 `allowedDevOrigins: ["**.*"]`는 점으로 구분된 IPv4 주소·일반 도메인을 폭넓게 허용하므로 개발 PC의 IP가 바뀌어도 목록을 수정할 필요가 없습니다. `localhost`는 기본 허용됩니다. 개발용 WebSocket이 차단되면 설정 반영 여부를 확인하고 페이지를 새로고침합니다. 이 설정은 개발 전용이며 Vercel 프로덕션에는 적용되지 않습니다. 방화벽·공유기·터널을 자동으로 개방하는 설정은 아니므로 다른 네트워크에서 접속하려면 별도의 네트워크 경로가 필요합니다.

### ARK 시간별 동기화 활성화

1. 운영 HTTPS origin에 배포하고 서버 환경 변수를 설정합니다. 로컬 `localhost`나 LAN 주소는 Supabase에서 호출할 수 없습니다.
2. Supabase Dashboard의 Vault 화면에서 `guru_tracker_base_url`에 배포 origin, `guru_tracker_sync_secret`에 서버 `SYNC_SECRET`과 동일한 값을 추가합니다. SQL Editor에 비밀값이 포함된 `create_secret` 문을 넣으면 실행 이력에 남으므로 사용하지 않습니다.
3. `supabase/ark-cron.sql`을 실행합니다. `guru_tracker_ark_hourly` 한 개 job이 매시 7분에 6개 펀드의 보호된 엔드포인트를 각각 호출합니다. 재실행 시 같은 job만 갱신하며 기존 job을 삭제하지 않습니다. ARK 마이그레이션 적용만으로 Cron이 활성화되지는 않습니다.
4. 파일 끝의 조회 예시로 일정·응답 상태 코드를 확인하고 각 펀드의 마지막 성공 시각을 확인합니다. 요청 헤더·Vault 원문·`net.http_request_queue` 내용을 로그에 복사하지 않습니다. 이 SQL은 Stanley Cron을 등록하지 않습니다.

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
│   ├── app/              # 홈·Stanley·Cathie 상세·갱신 API
│   ├── components/       # 공통 차트·갱신 상태·출처별 어댑터·shadcn/ui
│   ├── domain/           # SEC·ARK 데이터 계약과 금액 집계
│   ├── hooks/            # Guru 전용 명령형 라우터
│   ├── lib/              # 십진 금액·클래스 병합 유틸리티
│   └── server/           # SEC·ARK 수집·검증·Supabase 조정자
├── supabase/             # 마이그레이션 및 ARK Cron 운영 SQL
├── tests/               # 공시 정규화와 DB 무결성 회귀 검증
├── biome.json
├── components.json      # shadcn/ui 설정
├── package.json
└── pnpm-lock.yaml
```

Stanley 흐름은 `src/server/sec.ts`, `src/server/stanley.ts`와 `supabase/migrations/202609140001_stanley.sql`, ARK 흐름은 `src/server/ingestion/ark/`, `src/server/ark.ts`와 `supabase/migrations/202609150001_ark.sql`이 담당합니다.

## 이용 안내

Guru Tracker는 가족과 지인을 위한 개인적 용도의 프로젝트이며, Vercel Hobby와 Supabase의 무료 등급을 전제로 설계하고 있습니다. 모든 공시 데이터에는 공개 시차, 누락, 정정 및 해석 한계가 있을 수 있습니다.

**이 저장소와 향후 서비스의 정보는 투자 조언, 매수·매도 권유, 수익 보장 또는 특정 투자 판단의 근거가 아닙니다.** 투자 결정 전에는 원문 공시와 신뢰할 수 있는 전문가의 조언을 별도로 확인해야 합니다.
