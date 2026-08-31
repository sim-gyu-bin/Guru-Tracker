---
type: structured-notes
kind: configuration-decision-capture
date: 2026-08-31
language: ko
verbatim: false
status: captured
---

# 프로젝트 전용 YOLO 모드 결정

> 이것은 **대화 내용을 그대로 옮긴 것이 아닌 구조화 메모**다. Guru Tracker 저장소에 한정한 OMP 승인 정책 변경을 기록하며, 애플리케이션 기능 구현을 뜻하지 않는다.

## 사용자 결정

- Guru Tracker 프로젝트에서는 일반적인 도구 권한 질문 없이 OMP를 YOLO 모드로 사용한다.
- 이 설정은 사용자 전역 설정이나 다른 프로젝트에 영향을 주지 않아야 한다.

## 적용 방식

- 프로젝트 로컬 `.omp/config.yml`에 `tools.approvalMode: yolo`를 명시한다.
- 전역 설정에 남아 있는 `eval`, `browser`, `computer`, `github`의 명시적 `prompt` 정책은 이 프로젝트에서 `allow`로 재정의한다.
- 승인 질문을 다시 만들지 않으면서 호스트나 Git 이력을 크게 훼손할 수 있는 shell 패턴은 프로젝트 설정에서 `deny`한다.
- 프로젝트 설정은 Guru Tracker 루트에서 OMP를 시작할 때만 적용된다. CLI overlay와 runtime flag는 프로젝트 설정보다 우선할 수 있다.

## 유지되는 안전 경계

- 도구 자체의 강제 `deny` 정책과 provider-originated safety check는 프로젝트 YOLO 설정으로 우회되지 않을 수 있다.
- YOLO 모드는 사용자가 요청하지 않은 커밋, 배포, 외부 계정 변경 또는 기타 실제 행동을 자동으로 허가한다는 뜻이 아니다.
