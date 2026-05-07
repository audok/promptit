# Promptit Testing Guide

이 문서는 Promptit의 자동 테스트와 수동 최종 확인 절차를 한 곳에 정리한 문서입니다.

상세 커버리지 체크리스트와 현재 남은 갭은 [TEST_CHECKLIST.md](TEST_CHECKLIST.md)에 정리합니다.

## 목적

- 로컬 fixture 기반 결정적 회귀 테스트를 빠르게 반복한다.
- 실제 ChatGPT 사이트에서 핵심 사용자 흐름을 별도 smoke test로 확인한다.
- Gemini는 로컬 fixture로 결정적 회귀 테스트를 확인하고, 로그인된 실제 Gemini는 수동 최종 체크로 확인한다.
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
  - hover + keyboard navigation + list scroll 조합 회귀
  - IME, NBSP, readonly/disabled textarea
  - storage normalization/recovery
  - toast 기반 실패 복구 경로
  - popup placement, long-list scroll
  - unsupported URL no-op
  - content script -> runtime message -> options open
  - Gemini fixture에서 초기화, `/ ` popup open, insert, cleanup, Enter no-submit host regression, Quill clipboard 무시, wrapper anchoring

### 3. 실사이트 Smoke

```bash
pnpm test:e2e:live
```

- 실제 `chatgpt.com`과 `chat.openai.com`에 접속해 핵심 흐름만 검증한다.
- `gemini.google.com` public page smoke는 현재 skip되어 있다.
- 로컬 fixture 테스트보다 느리고 외부 사이트 상태 영향을 받는다.
- 기본 회귀 테스트가 아니라 release 전 smoke test로 사용한다.
- 현재 커버하는 대표 항목:
  - `chatgpt.com`에서 popup open + insert
  - `chatgpt.com`에서 copy
  - `chatgpt.com` empty state -> options
  - `chat.openai.com` 진입 시 Promptit 초기화
  - Gemini public page는 Promptit 선택 후 텍스트가 composer에 남지 않고 page-level submitted state로 이동해 no-submit smoke로 안전하지 않음

## 테스트 파일과 체크리스트 매핑

| 파일 | 주 역할 | 상세 체크리스트 섹션 |
| --- | --- | --- |
| `tests/e2e/options.spec.ts` | 옵션 페이지, CRUD, validation, storage 복구/실패 UI | `옵션 페이지와 스토리지` |
| `tests/e2e/gemini-slash-popup.spec.ts` | Gemini fixture, adapter routing, Quill composer insert/cleanup, Enter no-submit host regression, clipboard ignore, wrapper anchoring | `Gemini 지원` |
| `tests/e2e/slash-popup.spec.ts` | 입력 감지, popup 상호작용, insert/copy, toast, placement, hover + keyboard scroll 회귀 | `입력 감지와 trigger`, `팝업 상호작용`, `실패 복구와 toast` |
| `tests/e2e/platform.spec.ts` | 지원 URL 범위, runtime message 경로 | `플랫폼과 초기화` |
| `tests/live/live-chatgpt.spec.ts` | 실제 `chatgpt.com` / `chat.openai.com` smoke | `실사이트 smoke` |
| `tests/live/live-gemini.spec.ts` | Gemini public-page smoke 후보. 현재 no-submit 조건을 만족하지 못해 skip | `실사이트 smoke` |

## 권장 실행 순서

릴리스 전에는 아래 순서를 권장한다.

```bash
pnpm typecheck
pnpm test:e2e
pnpm test:e2e:live
```

`test:e2e`와 `test:e2e:live`는 동시에 돌리지 않는 편이 좋다. 둘 다 fixture web server를 쓰기 때문에 병렬 실행 시 포트 바인드 경고가 날 수 있다.

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

### 로그인된 Gemini composer

1. Promptit 확장을 로드한 브라우저에서 로그인된 Gemini 세션을 연다.
2. Gemini composer에 포커스하고 `/ `를 입력한다.
3. Promptit popup이 열리는지 확인한다.
4. Enter 또는 popup click으로 저장된 프롬프트를 선택한다.
5. `/ ` trigger가 저장된 프롬프트 본문으로 치환되고, 의도치 않게 Gemini prompt가 제출되지 않는지 확인한다.

이 항목을 수동으로 두는 이유:

- 2026-05-07 자동 live smoke에서 public Gemini page는 Promptit 선택 후 텍스트가 composer에 남지 않고 page-level submitted state로 이동했다.
- 로그인된 실제 Gemini composer의 최종 no-submit 동작은 사용자 세션에서 확인해야 한다.

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
- 로그인된 Gemini composer 수동 체크

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
- Gemini public page smoke는 no-submit 조건을 만족하지 못해 skip되어 있다. 2026-05-07 결과: Promptit 선택 후 텍스트가 composer가 아니라 page-level submitted state에 표시되고 composer text readback은 빈 문자열이었다.
- 자동화 커버리지의 세부 갭은 [TEST_CHECKLIST.md](TEST_CHECKLIST.md)를 기준으로 관리한다.

## 빠른 체크리스트

- [ ] `pnpm typecheck`
- [ ] `pnpm test:e2e`
- [ ] `pnpm test:e2e:live`
- [ ] 툴바 Promptit 아이콘 클릭
- [ ] 옵션 페이지 정상 오픈 확인
- [ ] 로그인된 Gemini composer 확인
