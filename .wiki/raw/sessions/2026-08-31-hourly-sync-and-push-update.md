---
type: structured-notes
kind: decision-correction-capture
date: 2026-08-31
language: ko
verbatim: false
status: captured
supersedes: 2026-08-31-project-brainstorm.md#stack-and-operations
---

# 시간별 동기화 및 푸시 알림 결정 보정

> 이것은 **대화 내용을 그대로 옮긴 것이 아닌 구조화 메모**이며, 이전 브레인스토밍의 동기화 결정을 보정한다. 제품이 구현되었거나 외부 출처가 수집되었다는 뜻은 아니다.

## 대체되는 동기화 결정

- 이전의 "cron을 사용하지 않는다"는 결정을 대체한다.
- 시간별 예약 동기화가 기본 경로다. Vercel Hobby Cron은 시간별 실행을 지원하지 않으므로 사용하지 않는다.
- Supabase Cron의 `pg_cron`과 `pg_net`이 보호된 Next.js 내부 동기화 엔드포인트를 한 시간에 한 번 호출한다.
- 엔드포인트 비밀값은 Supabase Vault 및 서버 전용 구성에 보관한다.
- 구현 근거가 나중에 필요하다고 확인되지 않는 한 Supabase Edge Function은 요구하지 않는다.
- 사용자 접근 동기화는 보조(fallback) 경로다. 화면은 먼저 캐시된 DB 데이터를 표시하고, 데이터가 오래되었거나 예약 작업이 뒤처졌을 때만 동기화를 시도한다.
- 예약 경로와 사용자 접근 경로는 DB lease를 사용하는 동일한 멱등 동기화 조정자를 호출한다.

## 변경과 Web Push 결정

- 검증된 DB 트랜잭션이 실제 변경 이벤트를 만든 뒤에만 Web Push 알림을 outbox에 넣는다. 커밋 전에 알리지 않는다.
- 푸시 전송 실패는 출처 데이터 트랜잭션을 되돌리지 않는다.
- 중복 방지를 위해 이벤트와 문서에 고유 키를 두고 outbox를 사용한다. 전달된 outbox와 이벤트 이력은 짧은 보존 기간 뒤 정리하되, 정확한 기간은 아직 정하지 않는다.
- 예정된 전송 방식은 service worker와 VAPID를 사용하는 표준 Web Push다. 권한 요청은 사용자 제스처에서 opt-in으로만 한다.
- iOS의 일반적인 흐름에서는 Home Screen에 설치한 웹 앱이 필요하다. PWA Web Push에 Apple Developer 계정은 필요하지 않다.
- 만료된 구독은 전송 응답 404 또는 410에서 제거한다.

## 유지되는 제품 결정과 미해결 항목

- 비공개 가족·지인용, 일곱 명 추적, 공식 출처, Next.js/Vercel/Supabase/PWA-first, 현재·이전 두 스냅샷, 원자적 교체, 실제 변경에서만 데이터셋 버전 증가 결정은 유지한다.
- 알림 종류·수신 대상·사용자별 환경설정과 outbox/event 이력의 정확한 보존 기간은 미해결이다.
