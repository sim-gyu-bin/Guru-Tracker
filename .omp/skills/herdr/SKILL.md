---
name: herdr
description: Herdr 페인에서 OMP 작업자를 실행하고 작업 전달·상태 대기·결과 회수·정리를 수행한다. 사용자의 Herdr 사용 요청 또는 이 저장소의 명시적인 페인 위임 정책이 적용될 때 사용한다. HERDR_ENV=1이 필수다.
---

# Herdr 페인 오케스트레이션

공식 [Herdr 스킬](https://github.com/herdrdev/herdr/blob/master/skills/herdr/SKILL.md)과 설치된 `herdr --skill`을 바탕으로 한 한국어 프로젝트 스킬이다. CLI 문법은 설치된 실행 파일의 도움말을 우선한다. 공식 스킬의 명시 요청 조건은 이 저장소에서 사용자가 승인한 적극적인 페인 위임 정책으로 구체화한다. 다른 저장소나 Herdr 밖의 세션까지 사용 권한을 확장하지 않는다.

## 실행 조건과 역할

- 제어 명령 전에 `printenv HERDR_ENV HERDR_WORKSPACE_ID HERDR_TAB_ID HERDR_PANE_ID`로 호출 환경을 확인한다. `HERDR_ENV`가 `1`이 아니면 중단하고 알린다. 외부에서 사용자가 보고 있는 Herdr 세션을 대신 제어하지 않는다.
- 메인은 작업 분해·위임·조정·통합·최종 검증을 담당한다. 페인의 OMP는 별도 세션이며 메인의 대화·도구 상태를 자동으로 공유하지 않는다.
- 작업자에게 목표, 필요한 맥락, 수정 허용 파일, 비목표, 입력·출력 계약, 완료 기준을 전달한다. 모델은 현재 하네스의 역할 설정을 따르며 재위임은 금지한다. Guru Tracker의 `.omp/agents` 전문 역할과 관련 수집·동기화·보안 스킬을 작업 맥락에 포함한다.
- 읽기 전용 조사 작업자는 읽기 전용 도구만 허용해 실행한다. 예: `--tools read,grep,glob --no-lsp`. 자동 LSP 동작도 제외해 조사 도구 범위를 명확히 한다. 구현 작업자에게는 필요한 수정 도구를 허용하되 승인 모드를 완화하지 않는다.
- 페인 작업자와 OMP 내부 `task`는 다른 위임 경로다. 같은 작업을 양쪽에 중복 위임하지 않는다. Herdr 작업자의 결과는 `herdr agent`로 회수하며, 내부 `task` 전용 자동 결과 전달이나 작업자 ID가 생긴다고 가정하지 않는다.

## CLI 확인과 대상 식별

처음에는 다음 도움말을 확인한다. 인자 없는 `herdr`는 TUI를 열므로 탐색에 사용하지 않는다. `workspace create` 같은 변경 명령을 인자 없이 시험하지 않는다.

```bash
herdr --help
herdr agent
herdr pane
herdr integration
```

필요한 범위만 조회한다. 다른 작업자의 화면이나 세션 파일을 무관하게 읽지 않는다.

```bash
herdr pane current --current
herdr pane layout --current
herdr pane list --workspace "$HERDR_WORKSPACE_ID"
herdr integration status
```

- `--current`는 호출 페인을 뜻한다. 대상을 생략하면 사용자가 포커스한 다른 페인이 선택될 수 있으므로 호출 페인, 응답에서 얻은 명시적 ID 또는 고유 에이전트 이름을 사용한다.
- workspace/tab/pane ID는 불투명 핸들이다. 사이드바 순서나 예제의 ID로 추측하지 않는다. 생성 응답에서 새 ID를 읽는다.
- `pane split`의 새 페인은 `.result.pane.pane_id`에 있다. `workspace create`는 `.result.workspace`, `.result.tab`, `.result.root_pane`, `tab create`는 `.result.tab`, `.result.root_pane`을 반환한다.
- 페인을 이동하면 ID가 바뀔 수 있다. 이동 응답의 `.result.move_result.pane.pane_id` 또는 살아 있는 에이전트 이름으로 대상을 갱신한다.
- 에이전트 이름은 `[a-z][a-z0-9_-]{0,31}`이며 살아 있는 이름끼리 중복할 수 없다. 이름은 현재 페인 점유자에 속하며 종료·해제·교체되면 사라진다. 터미널 ID나 `omp` 같은 종류 이름을 에이전트 대상으로 사용하지 않는다.

## 페인 생성과 작업자 준비

기본은 현재 탭·현재 작업 디렉터리의 형제 페인이다. 다른 workspace, tab, worktree나 작업 디렉터리는 사용자가 요청했을 때만 만든다. 생성한 페인 ID, 작업자 이름, 담당 범위를 메인이 추적한다.

1. 호출 페인의 layout을 확인한다. 사용자 지정 방향이 없으면 넓은 페인은 오른쪽, 좁거나 세로로 긴 페인은 아래로 나눈다. 같은 방향을 반복해 읽기 어려운 크기로 만들지 않는다.
2. 초기 운영은 활성 작업자 최대 2개다. 내부 `task`와 함께 사용할 때도 전체 동시 작업자는 최대 3개이며 더 엄격한 하네스 상한이 있으면 따른다.
3. 사용자 포커스를 빼앗지 않도록 `--no-focus`와 명시적 작업 디렉터리를 사용한다.

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

새 페인이 대화형 셸 프롬프트에 있고 셸이 전경 프로세스인 것을 확인한다. 기존 명령·편집기·에이전트가 점유한 페인에는 작업자를 덮어 실행하지 않는다. `agent start`는 기존 빈 셸 페인에서만 실행하며 페인 자체를 생성하지 않는다.

```bash
herdr agent start <worker-name> --kind omp --pane <returned-pane-id> -- <omp-args>
```

- `<...>`는 실제 조회 결과와 작업별 인자로 대체한다. OMP 인자는 `--` 뒤에 전달하며 `omp --help`로 확인한다.
- `--continue`나 `--resume`으로 메인 세션을 복제하지 않는다. 별도 새 세션에서 역할·금지사항을 `--append-system-prompt`로 명시한다.
- 읽기 전용 작업자는 파일 수정, 명령 실행, 커밋, 빌드·린트·테스트, 다른 작업자 생성이 금지된 조사 역할로 시작한다. 구현 작업자도 포매터·린트·빌드·테스트는 실행하지 않고 메인의 최종 검증에 맡긴다.
- `agent start` 성공은 같은 페인에서 지정 종류를 감지하고 입력 준비가 된 상태까지 기다렸음을 뜻한다. 기본 시작 제한은 30초다. 시작 중 `agent_not_ready`가 나면 이름이 남을 수 있으므로 현재 상태를 읽고, 재실행으로 중복 생성하지 않는다.
- 시작 승인이나 질문은 사용자의 판단 없이 대신 수락하지 않는다. `--auto-approve`나 승인 모드 완화로 우회하지 않는다.

## 작업 전달과 결과 회수

작업자를 먼저 준비시킨 뒤 일을 전달한다. 독립적인 여러 작업은 모두 시작하고 각각 프롬프트를 보낸 후 결과를 기다려 실제 동시 실행이 되게 한다. 의존성이 없는 작업을 한 개씩 끝날 때까지 기다리며 직렬화하지 않는다.

```bash
herdr agent prompt <worker-name> "<목표·범위·계약·완료 기준>" --wait --timeout 120000
herdr agent get <worker-name>
herdr agent read <worker-name> --source recent-unwrapped --lines 120
```

- 독립 작업을 여러 개 전달할 때는 먼저 `prompt`를 대기 없이 보내고, 이후 `agent wait <worker-name> --timeout 120000`로 기다린다.
- 프롬프트는 현재 bracketed-paste 설정에 맞춰 텍스트와 Enter를 전달한다. `blocked` 상태에는 `agent_blocked`로 입력을 거부한다.
- `--wait`는 해당 프롬프트의 결과 ID가 아니라 에이전트 생명주기를 기다린다. 이미 작업 중인 에이전트에는 새 일을 겹쳐 보내지 않는다. 기존 작업 종료가 새 프롬프트의 완료로 오인될 수 있다.
- 비작업 상태에서 프롬프트 후 5초 안에 상태 전이가 관찰되지 않으면 `agent_prompt_stalled`가 발생할 수 있다. 먼저 상태와 출력을 확인하고 전달 여부를 판단한다. 같은 프롬프트를 맹목적으로 재전송하지 않는다.
- `agent wait`와 `prompt --wait`의 기본 종료 상태는 `idle`, `done`, `blocked`다. 특정 상태만 기다릴 때에만 `--until`을 쓴다.

| 상태 | 해석과 후속 행동 |
| --- | --- |
| `working` | 작업 중. 중복 지시하지 않고 필요한 다른 작업을 진행한다. |
| `idle` | 입력 준비 상태이며 해당 탭을 사용자가 본 상태. 결과를 읽어 완료 기준을 별도로 확인한다. |
| `done` | 백그라운드 작업 종료 후 사용자가 아직 보지 않은 idle 상태. 성공·정확성을 보장하지 않는다. |
| `blocked` | 승인·질문 UI 감지. 출력을 읽고 사용자 판단이 필요한 내용을 전달한다. |
| `unknown` | 에이전트는 있지만 상태를 확신하지 못함. 완료로 간주하지 않는다. |

포커스 이동은 탭을 본 것으로 표시하지만 CLI 조회는 표시하지 않는다. 시간 초과나 대기 실패 후에는 `agent get`과 `agent read`를 먼저 실행한다.

출력은 기본적으로 `recent-unwrapped`로 읽어 줄바꿈을 합친다. `visible`은 현재 화면, `recent`는 줄바꿈이 포함된 최근 출력, `detection`은 상태 감지용 하단 텍스트다. 색상 자체가 증거일 때만 `--format ansi`를 사용한다.

출력이 잘리면 `--lines`를 늘려 한 번 더 읽는다. 대체 화면에서 사라진 내용은 host scrollback에 없을 수 있어 계속 늘려도 복원되지 않는다. 이 경우에만 작업자에게 임시 디렉터리에 전체 결과를 Markdown으로 기록하고 경로만 답하도록 요청한 뒤 직접 읽는다. 읽기 전용 작업자에게 쓰기 도구가 없으면 짧은 분할 응답을 요청하며, 결과 회수를 위해 도구 제한을 몰래 풀지 않는다. 처음부터 모든 작업에 결과 파일을 강제하지 않는다.

## 일반 명령과 중단

에이전트 작업에는 `agent`를, 일반 셸 작업에는 `pane`을 사용한다. 장기 프로세스는 현재 하네스의 감독 도구 정책을 따르며 Herdr로 우회하지 않는다.

```bash
herdr pane run <created-pane-id> "<command>"
herdr pane wait-output <created-pane-id> --match "<expected-output>" --timeout 120000
herdr pane read <created-pane-id> --source recent-unwrapped --lines 120
herdr agent send-keys <worker-name> esc
herdr agent send-keys <worker-name> ctrl+c
```

`pane run`은 명령과 Enter를 함께 전송한다. `wait-output`은 기존 출력도 즉시 검사하므로 과거 성공 문자열이 이번 실행을 증명한다고 가정하지 않는다. `--match`는 문자열, `--regex`는 Rust 정규식이며 timeout 단위는 밀리초다. 키 입력은 전체 유효성 검사가 끝난 뒤 전송된다. 중단 키를 보내기 전에 대상과 현재 작업을 확인한다.

## 통합·검증·정리

- 같은 디렉터리의 변경은 즉시 공유된다. 수정 파일 소유권을 나누고, 공유 인터페이스를 먼저 정한다. 같은 파일을 만져야 하면 메인이 그 변경 구간만 순차 조정한다.
- 결과에는 변경 파일·핵심 판단·근거·미해결 사항을 요구한다. 작업자가 완료했다고 답해도 메인이 실제 산출물과 동작을 검증한다.
- 완료 결과를 회수하고 필요한 검증을 끝낸 뒤, 메인이 생성했다고 추적한 페인만 `herdr pane close <created-pane-id>`로 정리한다. 닫기 직전 다른 사용자의 프로세스로 바뀌지 않았는지 확인한다.
- 실패한 작업자는 원인을 확인하고 필요한 출력을 확보하기 전에는 닫지 않는다. 보존할 때는 페인 ID·상태·이유를 사용자에게 알린다.
- 기존 사용자 페인·탭·workspace·세션은 명시적 요청 없이 닫지 않는다. `herdr server stop`이나 메인 Herdr 프로세스 종료는 사용하지 않는다.
- CLI 서버 오류는 stderr JSON과 종료 코드 1, 문법 오류는 종료 코드 2다. 실패를 성공으로 처리하지 말고 응답에 따라 원인을 확인한다.

## 이전 및 검증 범위

- `multimodal-ai-poc/.omp/skills/herdr/SKILL.md`에서 Guru Tracker로 이전했다. 원본 프로젝트의 실행 검증 기록은 이 프로젝트의 검증 증거가 아니므로 포함하지 않는다.
- 이 프로젝트에서 페인 생성·작업 전달·결과 회수·정리를 실행할 때 실제 환경과 결과를 별도로 확인한다. 기존 세션에서 `skill://herdr`를 찾지 못하면 이 파일을 직접 읽고, 새 세션에서 스킬 발견 여부를 확인한다.
