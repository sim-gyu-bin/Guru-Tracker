---
name: sec-13f
description: SEC EDGAR 공식 13F를 검증하고 안전하게 스냅샷화하는 절차
---

이 스킬은 Stanley Druckenmiller, Michael Burry, Philippe Laffont, Brad Gerstner, David Tepper의 SEC EDGAR 13F에만 적용한다.

1. 공식 SEC EDGAR 제출 원문을 찾고 제출자, accession 또는 공식 식별자, 보고 기간, 제출일을 확인한다.
2. 정보표의 보유 필드를 원문과 대조하고, 문서·파싱·정규화 오류를 구분한다.
3. 이전 현재 스냅샷과 비교해 실제 문서 또는 정규화 데이터가 바뀌었는지 판정한다.
4. 새 출처가 유효할 때만 현재와 직전 두 스냅샷을 원자적으로 교체한다. 변화가 없으면 dataset version을 증가시키지 않는다.
5. 매시간 Supabase Cron 호출과 오래된 캐시·뒤처진 스케줄에서의 사용자 접근 대체 호출은 같은 멱등 동기화 조정자와 DB lease를 통해 실행한다. 사용자에게는 캐시를 먼저 제공하며, 13F를 실시간 보유 자료처럼 표현하거나 조회하지 않는다.

Burry의 옵션 포지션에서 정확한 손익을 계산하거나 추론하지 않는다. 결론에는 공식 원문 URL, 보고 기간, 제출일, 검증 필드, 변경 여부와 보류 사유를 함께 남긴다.
