# Promptit Testing Guide

이 문서는 Promptit의 자동 테스트와 수동 최종 확인 절차를 한 곳에 정리한 문서입니다.

상세 커버리지 체크리스트와 현재 남은 갭은 [TEST_CHECKLIST.md](/home/seok/code/promptit/TEST_CHECKLIST.md)에 정리합니다.

## 목적

- 로컬 fixture 기반 결정적 회귀 테스트를 빠르게 반복한다.
- 실제 ChatGPT 사이트에서 핵심 사용자 흐름을 별도 smoke test로 확인한다.
- 자동화하기 어려운 브라우저 툴바 확장 아이콘 클릭은 수동 최종 체크로 관리한다.

## 문서 역할

- `TESTING.md`: 어떤 명령을 언제 어떤 순서로 실행할지 정리한 운영 가이드
- `TEST_CHECKLIST.md`: 무엇을 검증하는지, 어떤 항목이 자동화됐는지, 무엇이 아직 수동 또는 갭인지 정리한 상세 체크리스트

## 테스트 명령

### 1. 타입 체크

```bash
pnpm typecheck
```

- TypeScript 타입 오류를 검사한다.

### 2. 결정적 E2E

```bash
pnpm test:e2e
```

- 로컬 fixture 기반 회귀 테스트를 실행한다.
- 기본 개발 루프에서 가장 자주 돌려야 하는 테스트다.
- 현재 커버하는 대표 항목:
  - 옵션 페이지 CRUD, validation, storage sync
  - `/ ` trigger open/close/cleanup
  - insert, copy, hover, click, keyboard navigation
  - IME, NBSP, readonly/disabled textarea
  - storage normalization/recovery
  - toast 기반 실패 복구 경로
  - popup placement, long-list scroll
  - unsupported URL no-op
  - content script -> runtime message -> options open

### 3. 실사이트 Smoke

```bash
pnpm test:e2e:live
```

- 실제 `chatgpt.com`과 `chat.openai.com`에 접속해 핵심 흐름만 검증한다.
- 로컬 fixture 테스트보다 느리고 외부 사이트 상태 영향을 받는다.
- 기본 회귀 테스트가 아니라 release 전 smoke test로 사용한다.
- 현재 커버하는 대표 항목:
  - `chatgpt.com`에서 popup open + insert
  - `chatgpt.com`에서 copy
  - `chatgpt.com` empty state -> options
  - `chat.openai.com` 진입 시 Promptit 초기화

## 테스트 파일과 체크리스트 매핑

| 파일 | 주 역할 | 상세 체크리스트 섹션 |
| --- | --- | --- |
| `tests/e2e/options.spec.ts` | 옵션 페이지, CRUD, validation, storage 복구/실패 UI | `옵션 페이지와 스토리지` |
| `tests/e2e/slash-popup.spec.ts` | 입력 감지, popup 상호작용, insert/copy, toast, placement | `입력 감지와 trigger`, `팝업 상호작용`, `실패 복구와 toast` |
| `tests/e2e/platform.spec.ts` | 지원 URL 범위, runtime message 경로 | `플랫폼과 초기화` |
| `tests/live/live-chatgpt.spec.ts` | 실제 `chatgpt.com` / `chat.openai.com` smoke | `실사이트 smoke` |

## 권장 실행 순서

릴리스 전에는 아래 순서를 권장한다.

```bash
pnpm typecheck
pnpm test:e2e
pnpm test:e2e:live
```

`test:e2e`와 `test:e2e:live`는 동시에 돌리지 않는 편이 좋다. 둘 다 fixture web server를 쓰기 때문에 병렬 실행 시 포트 바인드 경고가 날 수 있다.

## 수동 최종 체크

자동화되지 않은 최종 체크는 현재 1개다.

### 브라우저 툴바 아이콘 클릭

1. Promptit 확장을 로드한 브라우저를 연다.
2. 브라우저 툴바에서 Promptit 확장 아이콘을 클릭한다.
3. 옵션 페이지가 새 탭으로 열리거나, 이미 열린 옵션 탭으로 포커스되는지 확인한다.
4. 옵션 페이지 제목이 `Promptit Settings`인지 확인한다.

이 항목을 수동으로 두는 이유:

- Playwright는 웹페이지 DOM은 안정적으로 제어하지만 브라우저 툴바 UI는 안정적으로 제어하지 못한다.
- 구현상 실제 비즈니스 로직은 `chrome.action.onClicked -> chrome.runtime.openOptionsPage()` 연결뿐이라, 비용 대비 자동화 이득이 작다.

## 언제 어떤 테스트를 돌릴지

### 구현 중

- `pnpm typecheck`
- `pnpm test:e2e`

### PR 전

- `pnpm typecheck`
- `pnpm test:e2e`

### 릴리스 전

- `pnpm typecheck`
- `pnpm test:e2e`
- `pnpm test:e2e:live`
- 브라우저 툴바 아이콘 수동 체크

## 추천 프롬프트

이 저장소에서는 사용자가 기본적으로 전체 테스트 실행을 원한다. 별도 지시가 없으면 전체 자동 테스트를 돌리는 쪽으로 해석해도 된다.

### 기본형

```text
TESTING.md와 TEST_CHECKLIST.md 기준으로 Promptit 테스트를 진행해줘.
자동 테스트는 전부 순차 실행하고, 실패가 있으면 built-in explorer 서브에이전트를 사용해서 실패 로그 정리, 체크리스트 매핑, 원인 분석을 진행해줘.
코드 수정은 하지 말고, 마지막에는 결과 요약과 내가 수동으로 확인할 항목만 남겨줘.
```

## 현재 남은 제한

- 브라우저 툴바 확장 아이콘 클릭은 자동화하지 않았다.
- 일부 브라우저/확장 플랫폼 자체 동작은 Playwright보다 수동 점검이 더 현실적이다.
- 실사이트 smoke는 OpenAI UI 변경, 로그인 유도 모달, A/B 테스트의 영향을 받을 수 있다.
- 자동화 커버리지의 세부 갭은 [TEST_CHECKLIST.md](/home/seok/code/promptit/TEST_CHECKLIST.md)를 기준으로 관리한다.

## 빠른 체크리스트

- [ ] `pnpm typecheck`
- [ ] `pnpm test:e2e`
- [ ] `pnpm test:e2e:live`
- [ ] 툴바 Promptit 아이콘 클릭
- [ ] 옵션 페이지 정상 오픈 확인
