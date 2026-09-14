# 프로젝트 불변 조건

## 공식 출처

- Stanley Druckenmiller, Michael Burry, Philippe Laffont, Brad Gerstner, David Tepper는 공식 SEC 13F만 사용한다. 13F를 실시간 데이터로 표현하지 않으며 Burry 옵션의 정확한 손익을 추론하거나 단정하지 않는다.
- Cathie Wood는 ARK 공식 holdings/trades만 사용한다. 접근 공백 중 누락된 일별 ARK 이력은 접속 시 재구성할 수 없다.
- Nancy Pelosi는 미국 하원 공식 PTR만 사용한다.

## 동기화와 전달

- Supabase Cron(`pg_cron` + `pg_net`)만 보호된 Next.js 내부 엔드포인트를 매시간 호출한다. 비밀값은 Supabase Vault와 서버 전용 설정에 둔다. Vercel Hobby Cron은 사용하지 않으며 Supabase Edge Function은 구현 근거 없이 요구하지 않는다.
- 스케줄과 접근 대체 경로는 하나의 멱등 조정자와 DB lease를 공유한다. 화면은 캐시를 먼저 보여 주고 캐시가 오래됐거나 스케줄 작업이 뒤처졌을 때만 조정자를 호출한다.
- 검증된 새 출처와 실제 변경이 있을 때만 하나의 DB transaction에서 현재/직전 두 스냅샷 원자 회전·dataset version·변경 이벤트를 기록한다. 커밋된 이벤트만 event/document 고유 키 outbox로 전송하고 중복을 막는다. 푸시 실패는 원본 데이터를 롤백하지 않으며 전달 outbox·이벤트 이력은 짧은 보존 기간으로 정리하도록 설계한다. 실제 데이터 정리 실행은 전역 삭제 승인 정책을 따른다.
- Web Push는 서비스 워커와 VAPID를 쓰고 사용자 제스처로만 opt-in한다. iOS 일반 흐름에는 홈 화면 PWA 설치가 필요하며 Apple Developer 계정·Firebase·네이티브 푸시는 요구하지 않는다.

## 코드 주석

- 외부로 노출되는 함수·타입·컴포넌트·훅과 수집 파서, 동기화·스냅샷 회전, DB transaction의 핵심 코드는 한글 주석으로 목적, 입력·출력, 불변 조건과 실패 조건을 설명한다.
- 출처 제약·단위·기준일과 제출일·시간대·식별자 선택·브라우저 및 플랫폼 우회처럼 코드만으로 알 수 없는 외부 의미를 해당 코드 가까이에 기록한다.
- 비자명한 분기·예외는 처리 이유를 설명한다. 자명한 코드를 줄마다 번역하지 않는다. 변경 시 관련 주석을 갱신하고 구현과 모순되는 주석을 남기지 않는다.
