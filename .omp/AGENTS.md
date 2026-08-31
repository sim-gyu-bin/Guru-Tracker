# Guru Tracker 작업 지침

## 제품 범위

Guru Tracker는 가족·지인만 사용하는 PWA 우선 투자 공시 추적 서비스다. 추적 대상은 Stanley Druckenmiller, Cathie Wood, Nancy Pelosi, Michael Burry, Philippe Laffont, Brad Gerstner, David Tepper의 일곱 명이다. 계획된 구성은 Next.js App Router, Vercel Hobby, Supabase PostgreSQL 및 Storage다. 구현되지 않은 기능을 구현된 것처럼 서술하지 않는다.

## 데이터와 동기화

- Stanley Druckenmiller, Michael Burry, Philippe Laffont, Brad Gerstner, David Tepper는 공식 SEC 13F만 사용한다. 13F를 실시간 데이터처럼 호출하거나 표현하지 않는다.
- Cathie Wood는 ARK의 공식 holdings/trades만 사용한다. 접근 공백 중 누락된 일별 ARK 이력은 접속 시 재구성할 수 없다.
- Nancy Pelosi는 미국 하원의 공식 PTR만 사용한다.
- Michael Burry의 옵션 손익을 정확한 값으로 추론하거나 단정하지 않는다.
- Supabase Cron의 `pg_cron`과 `pg_net`이 보호된 Next.js 내부 동기화 엔드포인트를 매시간 호출한다. 엔드포인트 비밀값은 Supabase Vault와 서버 전용 설정에만 두며, Vercel Hobby Cron을 사용하지 않는다. Supabase Edge Function은 구현 근거가 생기기 전까지 요구하지 않는다.
- 스케줄 호출과 사용자 접근 갱신은 같은 멱등 동기화 조정자와 DB lease를 사용한다. 화면은 캐시를 먼저 보여 주고, 캐시가 오래됐거나 스케줄 작업이 뒤처졌을 때만 조정자를 호출한다.
- 검증된 새 출처와 실제 변경이 있을 때만 하나의 DB transaction에서 현재/직전 두 스냅샷을 원자적으로 교체하고 dataset version 및 변경 이벤트를 기록한다. 커밋된 이벤트만 event/document 고유 키의 outbox로 Web Push를 전송하며, 중복 전송을 막고 전송 실패로 원본 데이터를 롤백하지 않는다. 전달 outbox와 이벤트 이력은 짧은 보존 기간으로 정리한다.

## 설계와 언어

- 사용자·운영자 대상 UI 문구, README, OMP 지침·규칙·에이전트·스킬, 커밋 메시지는 한국어로 쓴다.
- 구조 이름, 파일명, frontmatter 키, 코드·API·DB 식별자는 영어와 ASCII를 사용한다.
- `.omp/config.yml`은 이 저장소에서만 OMP YOLO 승인 모드를 적용한다. 일반 도구 호출은 자동 승인하되, 호스트와 Git 이력을 크게 훼손할 수 있는 shell 패턴은 질문 대신 차단한다.
- 런타임 공시 원본은 Supabase Storage에 둔다. `.wiki/raw`에는 대표 개발 샘플을 추가하기 전까지 런타임 파일을 넣지 않는다.

## 코드 주석

- 외부로 노출되는 함수·타입·컴포넌트·훅과 수집 파서, 동기화·스냅샷 회전, DB transaction처럼 핵심 동작을 담당하는 코드는 한글 주석으로 목적, 입력·출력, 불변 조건과 실패 조건을 설명한다.
- SEC 13F·ARK·PTR의 출처 제약, 단위, 기준일·제출일, 시간대, 식별자 선택, 브라우저·플랫폼 우회처럼 코드만으로 알 수 없는 이유와 외부 의미를 해당 코드 가까이에 기록한다.
- 분기와 예외 처리가 비자명하면 무엇을 하는지 반복하지 말고 왜 그 처리가 필요한지 설명한다. 자명한 대입·반환을 줄마다 번역하는 주석은 만들지 않는다.
- 코드 변경 시 관련 주석도 함께 갱신하며, 오래되었거나 구현과 모순되는 주석은 남기지 않는다.

## LLM Wiki 소유권

- `.wiki/raw`는 사람이 소유하는 불변 증거 원본이다. LLM은 수정하거나 재서술한 원본으로 대체하지 않는다.
- `.wiki/wiki`는 LLM이 소유하는 합성 지식이다. 초기 생성 지식 페이지는 영어로 작성한다.
- Wiki 작업은 원본과 합성본의 경계를 지키고, 근거·출처·확정 여부를 분리해 기록한다.

## 작업 방식과 검증

- 관련 작업을 시작하기 전에 일치하는 `.omp/skills/<name>/SKILL.md`를 먼저 읽는다.
- 작은 수직 단위로 계획하고, 기존 관례를 확인한 뒤 최소 변경으로 구현한다. 범위 밖 리팩터링이나 추측 기반 기능 추가를 하지 않는다.
- 변경 유형에 맞는 증거를 남긴다. 수집 변경은 실제 출처 응답과 검증 결과, UI 변경은 실제 화면 동작, 버그 수정은 재현 후 해결 확인으로 검증한다.
- 비밀값은 클라이언트, 저장소, 로그, Wiki 원본에 기록하지 않는다. 커밋은 요청받은 경우에만 만든다.
