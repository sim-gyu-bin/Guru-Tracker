---
type: structured-notes
kind: session-capture
date: 2026-08-31
language: ko
verbatim: false
status: captured
---

# Guru Tracker 프로젝트 브레인스토밍

> 이것은 **대화 내용을 그대로 옮긴 것이 아닌 구조화 메모**이며, 대화 전문이 아니다. 확인된 결정과 남은 질문만 보존한다.

## 사용자 목표

- 가족·지인이 사용할 비공개 Guru Tracker를 만든다.
- 다음 일곱 사람의 공개 보유·거래 정보를 한곳에서 비교하고, 변화와 출처를 이해할 수 있게 한다.
  - Stanley Druckenmiller
  - Cathie Wood
  - Nancy Pelosi
  - Michael Burry
  - Philippe Laffont
  - Brad Gerstner
  - David Tepper
- 구현 전에는 계획과 지식 기준을 정리하며, 이미 동작하는 제품처럼 표현하지 않는다.

## 제품과 데이터 결정

- 기관 운용사 다섯 명은 SEC 13F를 공식 출처로 사용한다: Stanley Druckenmiller, Michael Burry, Philippe Laffont, Brad Gerstner, David Tepper.
- Cathie Wood는 ARK의 공식 holdings/trades를 사용한다.
- Nancy Pelosi는 미국 하원 PTR(Periodic Transaction Report)을 사용한다.
- 변화는 문서·스냅샷 간 비교로 다룬다. Michael Burry의 옵션 손익을 정확하게 추론하지 않는다.
- SEC 13F를 실시간 데이터처럼 호출하거나 표시하지 않는다.

## 스택과 운영 결정

- 계획 스택은 Next.js App Router, Vercel Hobby, Supabase PostgreSQL 및 Storage이며 PWA-first를 지향한다.
- cron은 사용하지 않는다.
- 사용자가 접근하면 캐시된 DB 데이터를 먼저 보이고, 데이터가 오래되었을 때만 출처를 확인한다. 변경된 문서만 가져온 뒤 UI를 갱신한다.
- 새 출처가 검증된 후에만 현재/이전 스냅샷을 원자적으로 교체한다.
- 보존 대상은 현재와 바로 이전 스냅샷 두 개뿐이다.
- 실제 변경이 있을 때만 데이터셋 버전을 증가시킨다.

## 알려진 한계

- ARK의 일별 이력은 접근 공백 중 누락되면 나중에 접근 시 재구성할 수 없다.
- 13F는 보고 주기가 있는 공시이므로 실시간 보유 현황이 아니다.
- PTR의 공개성과 세부 형식·시점에는 원문 검증이 필요하다.
- 아직 공식 출처의 대표 샘플이나 런타임 공시 파일은 캡처하지 않았다. 런타임 파일은 Supabase Storage에만 둔다.

## 언어와 OMP 결정

- OMP 파일, skills, agents, README, UI 문구, 커밋 메시지는 한국어로 작성한다.
- 구조 이름, 파일명, frontmatter 키, 코드/API/DB 식별자는 영어를 사용한다.
- `.wiki/raw/`는 원본 언어를 보존하는 사람 소유 증거다.
- `.wiki/wiki/`는 LLM 소유 종합이며 초기 생성 지식 페이지는 영어로 작성한다.

## 미해결 질문

- 각 출처의 구체적인 stale 기준과 확인 주기.
- 각 출처 문서의 유효성 검증 규칙, 변경 판정 키, 오류 처리.
- PTR의 정확한 수집 경로와 정규화 범위.
- 사용자 인증·권한 모델, PWA 오프라인 범위, UI의 최종 화면과 수용 기준.
- 배포 환경 변수와 Storage/PostgreSQL 스키마의 세부 설계.
