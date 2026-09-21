# Guru Tracker 작업 지침

공통 언어·위임·모델·삭제 승인·비밀정보·커밋 정책은 현재 프로필의 전역 지침을 따른다. 이 파일은 프로젝트 고유 맥락과 작업별 안내만 정의한다. 데이터·동기화·주석의 불변 조건은 `.omp/RULES.md`에 둔다.

## 제품 범위

Guru Tracker는 가족·지인만 사용하는 PWA 우선 투자 공시 추적 서비스다. 추적 대상은 Stanley Druckenmiller, Cathie Wood, Nancy Pelosi, Michael Burry, Philippe Laffont, Brad Gerstner, David Tepper의 일곱 명이다. 계획된 구성은 Next.js App Router, Vercel Hobby, Supabase PostgreSQL 및 Storage다. 구현되지 않은 기능을 구현된 것처럼 서술하지 않는다.

## 원본과 Wiki

- 런타임 공시 원본은 Supabase Storage에 둔다. `.wiki/raw`에는 대표 개발 샘플을 추가하기 전까지 런타임 파일을 넣지 않는다.
- `.wiki/raw`는 사람이 소유하는 불변 증거 원본이다. LLM은 수정하거나 재서술한 원본으로 대체하지 않는다.
- `.wiki/wiki`는 LLM이 소유하는 합성 지식이다. 초기 생성 지식 페이지는 공통 문서 언어의 예외로 영어로 작성한다.
- Wiki 기록은 근거·출처·확정 여부를 분리하며 `skill://llm-wiki`를 따른다.

## 작업별 안내

- 출처 조사·수집 변경: `source-verification`과 해당 출처의 `sec-13f`, `ark-holdings`, `house-ptr` 스킬을 읽는다. 실제 공식 출처 응답과 검증 결과를 근거로 남긴다.
- 동기화 진입점·DB lease·스냅샷 회전·outbox 변경: `scheduled-sync` 스킬을 읽는다.
- Web Push 구독·전송·서비스 워커 변경: `web-push` 스킬을 읽는다. 화면 변경은 실제 화면 동작으로 검증한다.
- 제품 기능 설계: `project-brainstorm` 스킬을 읽는다. 단순 화면 수정까지 기능 설계 절차를 강제하지 않는다.
- UI 설계·구현·검토: 공식 upstream의 프로젝트 로컬 설치본인 `skill://ui-ux-pro-max`를 읽는다. 스킬을 찾지 못하면 `.omp/skills/ui-ux-pro-max/SKILL.md`를 직접 읽는다. 검색 결과는 후보이며 프로젝트 규칙을 덮어쓰지 않는다. 전체 시각 방향 변경은 대표 화면으로 방향을 확인한 뒤 확대한다.
- `ui-ux-pro-max`는 공식 upstream의 본문·스크립트·데이터·참조 자료를 유지하고 OMP 실행 경로만 최소 조정한다. 원문의 영어는 공통 한국어 작성 규칙의 예외로 보존한다. 프로젝트 고유 UI 제약은 `.omp/RULES.md`에 두며 스킬 원문에 삽입하거나 원문을 축약·번역하지 않는다. 사용자 응답과 작업 보고는 한국어로 작성한다.
- `skill://<name>`이 없으면 `.omp/skills/<name>/SKILL.md` 또는 현재 프로필의 전역 스킬 경로를 확인한다.
- `.omp/agents`의 SEC·ARK·PTR 수집, 공식 출처 조사, 프런트엔드 역할은 해당 범위를 위임할 때 사용한다. 프로젝트 고유 출처·데이터 제약을 작업 계약에 포함한다.

별도 프로젝트 `config.yml` 없이 현재 프로필의 전역 설정을 상속한다. 승인 정책과 명령 패턴을 프로젝트에서 중복 정의하지 않는다.
