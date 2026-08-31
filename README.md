# Guru Tracker

> 가족·지인이 공개 공시를 더 쉽게 확인하도록 돕기 위한 투자 공개정보 추적 프로젝트

## 현재 상태

**이 저장소는 현재 프로젝트 정의 및 초기 설정 단계입니다.** 아직 Next.js 애플리케이션, 데이터 수집기, 데이터베이스, PWA, 배포 환경은 구현되어 있지 않습니다. 아래의 동작과 구조는 구현 완료 기능이 아니라 **계획**입니다.

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

예정된 수집기는 공식 원문을 우선하며, 13F를 실시간 데이터처럼 호출하거나 불완전한 공시로부터 사실을 단정하지 않습니다.

## 예정된 동작

### 시간별 동기화와 접근 시 보완

무료 등급 구성을 유지하기 위해 **Supabase Cron**을 시간마다 한 번 실행할 계획입니다. `pg_cron`과 `pg_net`이 보호된 Next.js 내부 동기화 엔드포인트를 호출하며, 호출 비밀값은 Supabase Vault 및 서버 전용 설정에만 보관합니다. 시간별 일정에는 Vercel Hobby Cron을 사용하지 않습니다. Vercel Hobby Cron은 시간별 실행에 적합하지 않기 때문입니다.

예약 실행과 사용자 접근 시 갱신은 데이터베이스 lease를 사용하는 동일한 멱등 동기화 coordinator를 호출합니다. 사용자가 접속하면 먼저 캐시된 데이터를 즉시 보여 주고, 데이터가 오래되었거나 예약 실행이 뒤처진 경우에만 이 coordinator로 갱신을 보완합니다. 따라서 접근 시 갱신은 시간별 예약 동기화의 대체가 아니라 장애·지연 상황을 위한 fallback이며, 출처의 갱신 주기와 실제 서비스 반영 시점은 같지 않을 수 있습니다.

### 안전한 스냅샷 관리

각 데이터셋은 **현재 스냅샷과 직전 스냅샷만** 보관할 계획입니다. 새 원문이 유효함을 확인한 뒤에만 스냅샷을 원자적으로 교체하고, 실제 변경이 있을 때만 데이터셋 버전을 증가시킵니다. 검증에 실패한 새 자료가 기존 데이터를 덮어쓰지 않도록 설계합니다.

### 변경 알림 Web Push

유효성 검사를 통과한 데이터베이스 트랜잭션이 실제 변경 이벤트를 만든 **뒤에만** Web Push 발송을 outbox에 넣을 계획입니다. 커밋 전에는 알림을 만들지 않으며, Push 발송 실패가 원문·스냅샷 저장을 롤백하지 않습니다. 이벤트와 문서의 고유 키, outbox를 사용해 중복 발송을 막고, 전달된 outbox 및 이벤트 이력은 짧은 보존 기간 뒤 정리합니다(정확한 기간은 구현 시 결정).

알림은 PWA service worker와 VAPID를 사용하는 표준 Web Push로 계획합니다. 권한은 사용자 동작에서만 opt-in으로 요청합니다. iOS의 일반적인 Push 흐름에서는 Home Screen에 설치한 웹 앱이 필요하지만, PWA Web Push를 위해 Apple Developer 계정은 필요하지 않습니다. 만료되었거나 유효하지 않은 subscription은 Push 서비스의 `404` 또는 `410` 응답을 받으면 제거합니다.

## 예정 기술 구성

| 영역 | 계획 |
| --- | --- |
| 웹 애플리케이션 | Next.js App Router |
| 호스팅 | Vercel Hobby |
| 데이터베이스·파일 저장소 | Supabase PostgreSQL / Storage |
| 클라이언트 제공 방식 | PWA-first |

공시 원문과 런타임 산출물은 Supabase Storage에 둘 예정입니다. 이 저장소의 LLM Wiki 원문 보관 영역을 운영 데이터 저장소로 사용하지 않습니다.

## 개발 워크플로

이 프로젝트는 OMP 지침과 LLM Wiki를 함께 사용해 설계 근거와 구현 지식을 분리해 관리할 예정입니다.

- `.omp/`: OMP 프로젝트 지침, 규칙, 에이전트, 스킬을 관리합니다.
- `.wiki/raw/`: 사람이 소유하는 변경 불가의 근거·원문 기록 영역입니다. 원문 언어를 보존합니다.
- `.wiki/wiki/`: LLM이 관리하는 종합 지식 영역입니다. 초기 생성 지식 문서는 영어로 작성할 수 있습니다.
- `.wiki/`: 대화의 구조화 기록, 인덱스, 로그와 Wiki 스키마를 관리합니다.

이 저장소의 `.omp/config.yml`은 Guru Tracker에서만 OMP YOLO 승인 모드를 명시한다. 일반 도구 호출은 자동 승인하지만, 호스트와 Git 이력을 크게 훼손할 수 있는 shell 패턴은 승인 질문 대신 차단한다. 사용자 전역 설정과 다른 프로젝트에는 적용되지 않는다.

OMP 파일, 스킬, 에이전트, README, UI 문구와 커밋 메시지는 한국어로 작성하는 것을 원칙으로 합니다. 다만 구조 이름, 파일명, frontmatter 키, 코드·API·데이터베이스 식별자는 영어를 사용합니다.

## 예정 저장소 구조

```text
.
├── .omp/                 # OMP 지침·규칙·에이전트·스킬
├── .wiki/                # LLM Wiki 스키마·기록·지식
│   ├── raw/              # 사람 소유의 불변 근거 원문
│   └── wiki/             # LLM 소유의 종합 지식
├── src/
│   ├── app/              # 계획된 Next.js App Router 화면과 API
│   ├── domain/           # 프레임워크 비종속 업무 규칙
│   └── server/           # 수집·저장·동기화 로직
├── supabase/             # 계획된 Supabase 스키마·설정 자산
└── README.md
```

`src/`, `supabase/`를 포함한 애플리케이션 구조는 아직 생성되지 않았으며, 실제 구현 과정에서 구체화됩니다.

## 이용 안내

Guru Tracker는 가족과 지인을 위한 개인적 용도의 프로젝트이며, Vercel Hobby와 Supabase의 무료 등급을 전제로 설계하고 있습니다. 모든 공시 데이터에는 공개 시차, 누락, 정정 및 해석 한계가 있을 수 있습니다.

**이 저장소와 향후 서비스의 정보는 투자 조언, 매수·매도 권유, 수익 보장 또는 특정 투자 판단의 근거가 아닙니다.** 투자 결정 전에는 원문 공시와 신뢰할 수 있는 전문가의 조언을 별도로 확인해야 합니다.
