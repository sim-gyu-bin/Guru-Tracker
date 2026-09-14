---
name: sec-13f
description: SEC EDGAR 13F를 수집·파싱하거나 원문을 검증할 때 사용한다.
---

이 스킬은 Stanley Druckenmiller, Michael Burry, Philippe Laffont, Brad Gerstner, David Tepper의 SEC EDGAR 13F에만 적용한다.

1. 공식 SEC EDGAR 제출 원문을 찾고 제출자, accession 또는 공식 식별자, 보고 기간, 제출일을 확인한다.
2. 정보표의 보유 필드를 원문과 대조하고, 문서·파싱·정규화 오류를 구분한다.
3. 이전 현재 스냅샷과 비교해 실제 문서 또는 정규화 데이터가 바뀌었는지 판정한다.
4. 저장·회전 변경에는 `.omp/RULES.md`의 불변 조건과 `scheduled-sync`를 적용한다. 원문 조사·파서 수정만으로 실제 데이터 회전을 실행하지 않는다. 13F를 실시간 보유 자료로 표현하지 않는다.

Burry의 옵션 포지션에서 정확한 손익을 계산하거나 추론하지 않는다. 결론에는 공식 원문 URL, 보고 기간, 제출일, 검증 필드, 변경 여부와 보류 사유를 함께 남긴다.
