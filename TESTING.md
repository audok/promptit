# Promptit Testing Guide

이 문서는 Promptit의 자동 테스트와 수동 최종 확인 절차를 한 곳에 정리한 문서입니다.

상세 커버리지 체크리스트와 현재 남은 갭은 [TEST_CHECKLIST.md](TEST_CHECKLIST.md)에 정리합니다.

## 목적

- 로컬 fixture 기반 결정적 회귀 테스트를 빠르게 반복한다.
- 실제 ChatGPT 사이트에서 핵심 사용자 흐름을 별도 smoke test로 확인한다.
- Gemini는 로컬 fixture로 결정적 회귀 테스트를 확인하고, 로그인된 실제 ChatGPT/Gemini 전체 흐름은 수동 최종 체크로 확인한다.
- 자동화하기 어려운 브라우저 툴바 확장 아이콘 클릭은 수동 최종 체크로 관리한다.

## 문서 역할

- `TESTING.md`: 어떤 명령을 언제 어떤 순서로 실행할지 정리한 운영 가이드
- `TEST_CHECKLIST.md`: 무엇을 검증하는지, 어떤 항목이 자동화됐는지, 무엇이 아직 수동 또는 갭인지 정리한 상세 체크리스트

## 테스트 명령

### 1. 결정적 기본 게이트

```bash
pnpm test
```

- 기본 로컬 회귀 게이트다.
- 내부적으로 `pnpm typecheck`, production `pnpm build`, `pnpm check:manifest`, `pnpm test:e2e`, 최종 production `pnpm build`, `pnpm check:manifest`를 순서대로 실행한다.
- `pnpm test:e2e`가 test-mode manifest를 생성하므로, 이 게이트는 마지막에 production manifest를 다시 생성하고 검사한다.
- 실제 사이트 smoke는 외부 사이트와 로그인 상태에 의존하므로 포함하지 않는다.

### 2. 타입 체크

```bash
pnpm typecheck
```

- TypeScript 타입 오류를 검사한다.

### 3. 결정적 E2E

```bash
pnpm test:e2e
```

- 로컬 fixture 기반 회귀 테스트를 실행한다.
- 기본 개발 루프에서 가장 자주 돌려야 하는 테스트다.
- test-mode manifest로 `dist/`를 다시 빌드한다. 확장을 수동 로드하거나 패키징하기 전에는 `pnpm build && pnpm check:manifest` 또는 `pnpm test`를 다시 실행한다.
- 현재 커버하는 대표 항목:
  - 옵션 페이지 CRUD, validation, append-by-default, hidden internal order fields, list pin toggle, removed pin checkbox, drag-handle keyboard reorder, drag-handle icon centering, initial load draft preservation, storage sync
  - 옵션 페이지 stale save/delete/move conflict와 storage 실패 UI
  - production prompt body가 `chrome.storage.local`에 쓰이지 않는 저장소 분리 회귀 테스트
  - selected body load failure와 dirty draft 보호 회귀 테스트
  - `/ ` trigger open/close/cleanup
  - insert, copy, pin/unpin, hover, click, keyboard navigation
  - hover + keyboard navigation + list scroll 조합 회귀
  - IME command suppression, IME reset, NBSP, readonly/disabled textarea
  - busy prompt body read 중 popup state와 contenteditable block-boundary trigger rejection
  - storage normalization/recovery
  - toast 기반 실패 복구 경로
  - prompt read failure, composer detach stale-open regression
  - popup placement, long-list scroll
  - popup pin action persistence, visual active state, ordering, and stale conflict handling
  - unsupported URL no-op, same-page duplicate initialization guard
  - content script -> runtime message -> options open, malformed runtime message no-op
  - ChatGPT/Gemini composer child-node event bubbling resolve
  - Gemini fixture에서 초기화, `/ ` popup open, insert, cleanup, Enter no-submit host regression, Quill clipboard 무시, wrapper anchoring

### 4. 실사이트 Smoke

```bash
pnpm test:e2e:live
```

- 실제 `chatgpt.com`과 `chat.openai.com`에 접속해 핵심 흐름만 검증한다.
- `gemini.google.com` public page smoke는 현재 skip되어 있다.
- 로컬 fixture 테스트보다 느리고 외부 사이트 상태 영향을 받는다.
- 기본 회귀 테스트가 아니라 release 전 smoke test로 사용한다.
- 완료 후 production `dist/`를 다시 빌드하고 manifest policy를 검사한다.
- 현재 커버하는 대표 항목:
  - `chatgpt.com`에서 popup open + insert
  - `chatgpt.com`에서 copy
  - `chatgpt.com` empty state -> options
  - `chat.openai.com` 진입 시 Promptit 초기화
  - Gemini public page는 Promptit 선택 후 텍스트가 composer에 남지 않고 page-level submitted state로 이동해 no-submit smoke로 안전하지 않음

## 테스트 파일과 체크리스트 매핑

| 파일 | 주 역할 | 상세 체크리스트 섹션 |
| --- | --- | --- |
| `tests/e2e/options.spec.ts` | 옵션 페이지, CRUD, validation, append-by-default, hidden internal order fields, list pin toggle, removed pin checkbox, drag-handle keyboard reorder, drag-handle icon centering, initial load, storage 복구/실패 UI, stale conflict | `옵션 페이지와 스토리지` |
| `tests/e2e/gemini-slash-popup.spec.ts` | Gemini fixture, adapter routing, Quill composer insert/cleanup, child-node resolve, Enter no-submit host regression, clipboard ignore, wrapper anchoring | `Gemini 지원` |
| `tests/e2e/slash-popup.spec.ts` | 입력 감지, popup 상호작용, child-node resolve, insert/copy/pin, toast, placement, composer detach, hover + keyboard scroll 회귀 | `입력 감지와 trigger`, `팝업 상호작용`, `실패 복구와 toast` |
| `tests/e2e/platform.spec.ts` | 지원 URL 범위, same-page duplicate initialization guard, runtime message 경로, malformed message no-op | `플랫폼과 초기화` |
| `tests/live/live-chatgpt.spec.ts` | 실제 `chatgpt.com` / `chat.openai.com` smoke | `실사이트 smoke` |
| `tests/live/live-gemini.spec.ts` | Gemini public-page smoke 후보. 현재 no-submit 조건을 만족하지 못해 skip | `실사이트 smoke` |

## Promptit 테스트 헬퍼

Promptit production prompt data는 IndexedDB에 저장되며 `promptMetas`와 `promptBodies`로 분리되어 있다.

일반 테스트 데이터는 `extension.setPromptRecords(records)`로 seed하고, 상태 확인은 `extension.getPromptMetas()`, `extension.getPromptBody(id)`, `extension.getPromptRecords()`를 사용한다.

production prompt body는 `chrome.storage.local`에 저장하지 않는 것을 옵션 페이지 E2E에서 검증한다.

Popup storage 테스트는 다음 경계를 우선 검증한다.

- list open은 metadata만 읽는다.
- insert/copy는 선택한 prompt body를 id로 읽는다.
- pin/unpin은 metadata mutation만 수행하고 persisted pinned state와 popup ordering을 갱신한다.
- body read failure는 popup이 복구 가능한 상태로 남는다.

## 권장 실행 순서

릴리스 전에는 아래 순서를 권장한다.

```bash
pnpm test
pnpm test:e2e:live
```

`test:e2e`와 `test:e2e:live`는 동시에 돌리지 않는 편이 좋다. 둘 다 fixture web server를 쓰기 때문에 병렬 실행 시 포트 바인드 경고가 날 수 있다.
확장을 수동으로 로드하거나 패키징할 때는 마지막 명령이 production `pnpm build`와 `pnpm check:manifest`를 완료한 상태여야 한다.

## 수동 최종 체크

자동화되지 않은 최종 체크는 현재 2개다.

### 브라우저 툴바 아이콘 클릭

1. Promptit 확장을 로드한 브라우저를 연다.
2. 브라우저 툴바에서 Promptit 확장 아이콘을 클릭한다.
3. 옵션 페이지가 새 탭으로 열리거나, 이미 열린 옵션 탭으로 포커스되는지 확인한다.
4. 옵션 페이지 제목이 `Promptit Settings`인지 확인한다.

이 항목을 수동으로 두는 이유:

- Playwright는 웹페이지 DOM은 안정적으로 제어하지만 브라우저 툴바 UI는 안정적으로 제어하지 못한다.
- 구현상 실제 비즈니스 로직은 `chrome.action.onClicked -> chrome.runtime.openOptionsPage()` 연결뿐이라, 비용 대비 자동화 이득이 작다.

### 로그인된 ChatGPT/Gemini 전체 흐름

1. Promptit 확장을 로드한 브라우저에서 로그인된 ChatGPT와 Gemini 세션을 각각 연다.
2. 각 서비스의 composer에 포커스하고 `/ `를 입력한다.
3. Promptit popup이 열리는지 확인한다.
4. Enter 또는 popup click으로 저장된 프롬프트 insert, copy, pin/unpin 흐름을 확인한다.
5. `/ ` trigger cleanup이 정상 동작하고, 의도치 않게 prompt가 제출되지 않는지 확인한다.

이 항목을 수동으로 두는 이유:

- 로그인 세션은 계정 상태, 쿠키, 사이트 UI 변경, A/B 테스트의 영향을 받아 반복 가능한 회귀 테스트로 고정하기 어렵다.
- 2026-05-07 자동 live smoke에서 public Gemini page는 Promptit 선택 후 텍스트가 composer에 남지 않고 page-level submitted state로 이동했다. 이 상태에서는 composer readback으로 no-submit 조건을 안전하게 증명할 수 없다.
- 로그인된 실제 ChatGPT/Gemini composer의 최종 전체 흐름은 사용자 세션에서 확인해야 한다.

## 언제 어떤 테스트를 돌릴지

### 구현 중

- `pnpm test`
- `pnpm typecheck`
- `pnpm test:e2e`

### PR 전

- `pnpm test`

### 릴리스 전

- `pnpm test`
- `pnpm test:e2e:live`
- 브라우저 테스트 후 `chrome-devtools-mcp` / 테스트용 Chrome 프로세스 정리 확인
- 브라우저 툴바 아이콘 수동 체크
- 로그인된 ChatGPT/Gemini 전체 흐름 수동 체크

### 브라우저 프로세스 정리

브라우저/DevTools/Playwright를 사용한 뒤에는 호스트 프로세스 기준으로 테스트용 브라우저가 남았는지 확인한다.

```bash
ps -ef | rg 'chrome-devtools-mcp|puppeteer_dev_chrome_profile|/opt/google/chrome/chrome'
```

테스트용 프로세스가 남아 있으면 일반 사용자 Chrome이 아닌지 확인한 뒤 종료한다.

```bash
pkill -f 'chrome-devtools-mcp|puppeteer_dev_chrome_profile'
```

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
- 실사이트 smoke는 OpenAI/Gemini UI 변경, 로그인 유도 모달, A/B 테스트의 영향을 받을 수 있다.
- Gemini public page smoke는 no-submit 조건을 만족하지 못해 skip되어 있다. 2026-05-07 결과: Promptit 선택 후 텍스트가 composer가 아니라 page-level submitted state에 표시되고 composer text readback은 빈 문자열이었다. 즉, 자동 smoke가 확인하려는 "composer 안에 삽입되고 제출되지 않는다"는 조건을 public page에서 안정적으로 관찰할 수 없었다.
- 자동화 커버리지의 세부 갭은 [TEST_CHECKLIST.md](TEST_CHECKLIST.md)를 기준으로 관리한다.

## 빠른 체크리스트

- [ ] `pnpm test`
- [ ] `pnpm test:e2e:live`
- [ ] 테스트용 Chrome/MCP 프로세스 정리 확인
- [ ] 툴바 Promptit 아이콘 클릭
- [ ] 옵션 페이지 정상 오픈 확인
- [ ] 로그인된 ChatGPT/Gemini 전체 흐름 확인
