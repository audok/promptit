# promptit Testing Guide

이 문서는 promptit의 자동 테스트와 수동 최종 확인 절차를 한 곳에 정리한 문서입니다.

상세 커버리지 체크리스트와 현재 남은 갭은 [TEST_CHECKLIST.md](TEST_CHECKLIST.md)에 정리합니다.

## 목적

- 로컬 fixture 기반 결정적 회귀 테스트를 빠르게 반복한다.
- 실제 ChatGPT/Gemini 사이트에서 핵심 사용자 흐름을 별도 smoke test로 확인한다.
- 로그인된 실제 ChatGPT/Gemini 전체 흐름은 수동 최종 체크로 확인한다.
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
  - 옵션 페이지 i18n: Korean-pinned regression path plus English override for hero/list/editor/validation/save toast/confirm dialogs, fixed literals, and untranslated Korean prompt data
  - production prompt body가 `chrome.storage.local`에 쓰이지 않는 저장소 분리 회귀 테스트
  - selected body load failure와 dirty draft 보호 회귀 테스트
  - `/ ` trigger open/close/cleanup
  - insert, copy, pin/unpin, hover, click, keyboard navigation
  - hover + keyboard navigation + list scroll 조합 회귀
  - IME command suppression, IME reset, NBSP, readonly/disabled textarea
  - busy prompt body read 중 popup state와 contenteditable block-boundary trigger rejection
  - storage read failure/recovery
  - toast 기반 실패 복구 경로
  - prompt read failure, composer detach stale-open regression
  - popup placement, long-list scroll
  - malformed IndexedDB prompt metadata/body rows, missing body rows, and options load/body failure recovery
  - runtime request/response public contract parser coverage and descriptor-backed feedback translation
  - ChatGPT/Gemini selector matrix via query-driven local fixture variants
  - same-page composer replacement and reinjection duplicate-listener guard
  - HTML-looking prompt title/body text rendering without script execution
  - mobile-width overflow checks and 150-prompt popup/options/backup scale checks
  - popup pin action persistence, visual active state, ordering, and stale conflict handling
  - popup/content i18n: explicit English popup chrome/aria labels, English empty state, localized failure toasts, fixed `promptit`/`/`, and untranslated prompt insert/copy data
  - unsupported URL no-op, same-page duplicate initialization guard
  - content script -> runtime message -> options open, malformed runtime message no-op
  - extension manifest i18n packaging invariants: `default_locale`, raw manifest placeholders, locale file key parity, and fixed `promptit` app name
  - ChatGPT/Gemini composer child-node event bubbling resolve
  - Gemini fixture에서 초기화, `/ ` popup open, insert, cleanup, Enter no-submit host regression, Quill clipboard 무시, wrapper anchoring

### 4. 실사이트 Smoke

```bash
pnpm test:e2e:live
```

- 실제 `chatgpt.com`과 `gemini.google.com/app`에 접속해 같은 핵심 흐름을 검증한다.
- ChatGPT와 Gemini 각각 5개 smoke를 실행한다: popup open, saved prompt insert, saved prompt copy, pin toggle, empty state -> options.
- 실패는 `[promptit-live:environment-blocked]` 또는 `[promptit-live:actual-site-behavior-failure]` prefix와 Playwright annotation으로 분류된다.
- 로컬 fixture 테스트보다 느리고 외부 사이트 상태 영향을 받는다.
- 기본 회귀 테스트가 아니라 release 전 smoke test로 사용한다.
- fresh temporary Chromium profile에서 실행되므로 사용자의 실제 로그인 브라우저 세션을 대표하지 않는다.
- 완료 후 production `dist/`를 다시 빌드하고 manifest policy를 검사한다.
- `environment-blocked`는 network, HTTP block, login wall, bot verification, consent/onboarding, unavailable-region, clipboard/browser capability 같은 환경 문제를 뜻한다.
- 로그인/회원가입/cookie/consent 문구만으로는 `environment-blocked`로 분류하지 않는다. Live helper는 먼저 production-supported composer를 기다리고 `Ask anything` 같은 public composer affordance 문구를 확인한다.
- `actual-site-behavior-failure`는 사이트가 충분히 로드된 뒤 Promptit 흐름이 실패했다는 뜻이다. 제품 회귀와 외부 사이트 DOM/동작 변경은 자동화만으로 안전하게 구분할 수 없어서 같은 분류로 보고한다.

## 테스트 파일과 체크리스트 매핑

| 파일 | 주 역할 | 상세 체크리스트 섹션 |
| --- | --- | --- |
| `tests/e2e/controller-helpers.spec.ts` | popup controller helper의 refresh/active-cell fallback 단위 회귀 | `팝업 상호작용` |
| `tests/e2e/gemini-slash-popup.spec.ts` | Gemini fixture, adapter routing, Quill composer insert/cleanup, child-node resolve, Enter no-submit host regression, clipboard ignore, wrapper anchoring | `플랫폼과 초기화`, `입력 감지와 trigger`, `팝업 상호작용` |
| `tests/e2e/host-fixture-matrix.spec.ts` | ChatGPT/Gemini selector variants, same-page composer insertion, composer replacement plus reinjection duplicate handling | `플랫폼과 초기화`, `입력 감지와 trigger`, `팝업 상호작용` |
| `tests/e2e/options-backup-share.spec.ts` | backup/share/restore/import JSON shape, preview, rollback, stale editor refresh, malformed runtime messages | `옵션 페이지와 스토리지` |
| `tests/e2e/options-editor-conflicts.spec.ts` | editor draft 보존, validation, delete, selected body load 실패, stale save/delete/body conflict, save/delete 실패 | `옵션 페이지와 스토리지` |
| `tests/e2e/options-ordering.spec.ts` | pinned/normal ordering, list pin toggle, drag-handle keyboard/pointer reorder, conflict/error paths | `옵션 페이지와 스토리지` |
| `tests/e2e/options-preferences.spec.ts` | options open, theme/language preference, options localization | `옵션 페이지와 스토리지`, `릴리스 체크용 빠른 체크리스트` |
| `tests/e2e/options-prompts.spec.ts` | prompt create/update, append-by-default, IndexedDB body storage, body size, metadata-only/body save, runtime mutation conflicts | `옵션 페이지와 스토리지` |
| `tests/e2e/platform.spec.ts` | 지원 URL 범위, same-page duplicate initialization guard, runtime message 경로, malformed message no-op | `플랫폼과 초기화` |
| `tests/e2e/prompt-storage-corruption.spec.ts` | raw IndexedDB malformed metadata/body and missing body rows across content popup and options page failure UI | `팝업 상호작용`, `실패 복구와 toast`, `옵션 페이지와 스토리지` |
| `tests/e2e/promptEditorReducer.spec.ts` | prompt editor reducer conflict/delete recovery state transitions | `옵션 페이지와 스토리지` |
| `tests/e2e/responsive-and-scale.spec.ts` | mobile overflow, narrow popup overflow, 150-prompt keyboard/options/backup scale | `팝업 상호작용`, `옵션 페이지와 스토리지`, `릴리스 체크용 빠른 체크리스트` |
| `tests/e2e/runtime-contracts.spec.ts` | public runtime request/response contract builders/parsers and descriptor-backed content feedback | `플랫폼과 초기화`, `실패 복구와 toast` |
| `tests/e2e/security-rendering.spec.ts` | popup/options/composer rendering of HTML-looking prompt text without execution | `팝업 상호작용`, `옵션 페이지와 스토리지` |
| `tests/e2e/slash-popup-actions.spec.ts` | insert/copy/pin/open-options actions, metadata/body reads, busy state, storage refresh, action error toasts | `팝업 상호작용`, `실패 복구와 toast` |
| `tests/e2e/slash-popup-triggering.spec.ts` | trigger detection/cleanup, IME, selection boundaries, composer detach, multiline insert, scroll/placement | `입력 감지와 trigger`, `팝업 상호작용`, `실패 복구와 toast` |
| `tests/e2e/slash-popup-ui.spec.ts` | popup open, theme/localization, accessibility, toast semantics/appearance, Tab behavior, width/focus/icon UI | `팝업 상호작용`, `릴리스 체크용 빠른 체크리스트` |
| `tests/live/live-chatgpt.spec.ts` | 실제 `chatgpt.com` classified smoke | `실사이트 smoke` |
| `tests/live/live-gemini.spec.ts` | 실제 `gemini.google.com/app` classified smoke | `실사이트 smoke` |

## promptit 테스트 헬퍼

promptit production prompt data는 IndexedDB에 저장되며 `promptMetas`와 `promptBodies`로 분리되어 있다.

일반 테스트 데이터는 `extension.setPromptRecords(records)`로 seed하고, 상태 확인은 `extension.getPromptMetas()`, `extension.getPromptBody(id)`, `extension.getPromptRecords()`를 사용한다.

production prompt body는 `chrome.storage.local`에 저장하지 않는 것을 옵션 페이지 E2E에서 검증한다.

Popup storage 테스트는 다음 경계를 우선 검증한다.

- list open은 metadata만 읽는다.
- insert/copy는 선택한 prompt body를 id로 읽는다.
- pin/unpin은 metadata mutation만 수행하고 persisted pinned state와 popup ordering을 갱신한다.
- body read failure는 popup이 복구 가능한 상태로 남는다.

Data portability 테스트는 옵션 페이지 UI를 통해 검증한다. 백업/공유/복원/가져오기 자동 테스트는 `tests/e2e/options-backup-share.spec.ts`에 있다. 2026-05-29 요구사항 변경으로 `promptit.backup`은 saved prompts, language setting, theme setting을 모두 포함한다. `themePreference`가 없는 old backup file compatibility는 요구하지 않는다. 최근 확인된 fixture E2E 결과는 `182 passed`이고 inventory는 `182 tests in 17 files`다. 자동화는 다음 경계를 반복 가능하게 확인한다.

- backup download JSON은 `type: "promptit.backup"`, `appVersion`, `exportedAt`, `data.prompts`, `data.settings.languagePreference`, `data.settings.themePreference`를 포함한다.
- prompt share download JSON은 `type: "promptit.prompts"`, `appVersion`, `exportedAt`, `data.prompts`를 포함하며 공유 prompt object는 `title`과 `content`만 포함한다.
- 저장된 프롬프트가 없을 때 `프롬프트 전체 공유`는 disabled이고 `저장된 프롬프트가 없습니다.` 안내가 표시되거나 연결된다.
- restore는 파일 선택 후 preview를 먼저 보여주고, confirm 전에는 current prompts/settings를 바꾸지 않는다.
- restore confirm은 current prompts, language setting, theme setting을 backup 내용으로 교체하며, validation, language write failure, theme write failure 같은 persistence 실패 시 이전 prompts, language setting, theme setting을 보존한다.
- `data.settings.themePreference`가 없는 old backup file은 invalid restore로 취급하고 current prompts/settings를 보존한다.
- restore가 같은 prompt id/timestamps를 가진 backup으로 교체해도 열린 editor body가 stale 상태로 남지 않는다.
- import는 shared prompt file의 prompts를 새 record로 append하고 existing prompts를 overwrite하거나 remove하지 않는다.

## 권장 실행 순서

릴리스 전에는 아래 순서를 권장한다.

```bash
pnpm test
pnpm test:e2e:live
```

`test:e2e:live`는 live config에서 fixture web server를 제거했으므로 로컬 fixture server를 시작하지 않는다.
그래도 `pnpm build`, `pnpm build:test`, `pnpm test:e2e`, `pnpm test:e2e:live`는 같은 `dist/`를 공유하므로 같은 작업트리에서 병렬 실행하지 않는다. 실행 중 `dist/`가 production manifest로 바뀌면 localhost fixture가 content script match에서 빠져 `data-promptit-ready`가 붙지 않는 실패처럼 보일 수 있다. 이 경우 제품 회귀로 판단하기 전에 `pnpm build:test` 후 실패한 e2e를 다시 실행한다.
확장을 수동으로 로드하거나 패키징할 때는 마지막 명령이 production `pnpm build`와 `pnpm check:manifest`를 완료한 상태여야 한다.

## 수동 최종 체크

자동화되지 않은 최종 체크는 현재 3개다.

### 브라우저 툴바 아이콘 클릭

1. promptit 확장을 로드한 브라우저를 연다.
2. 브라우저 툴바에서 promptit 확장 아이콘을 클릭한다.
3. 옵션 페이지가 새 탭으로 열리거나, 이미 열린 옵션 탭으로 포커스되는지 확인한다.
4. 옵션 페이지 제목이 `promptit Settings`인지 확인한다.

이 항목을 수동으로 두는 이유:

- Playwright는 웹페이지 DOM은 안정적으로 제어하지만 브라우저 툴바 UI는 안정적으로 제어하지 못한다.
- 구현상 실제 비즈니스 로직은 `chrome.action.onClicked -> chrome.runtime.openOptionsPage()` 연결뿐이라, 비용 대비 자동화 이득이 작다.

### 로그인된 ChatGPT/Gemini 전체 흐름

1. promptit 확장을 로드한 브라우저에서 로그인된 ChatGPT와 Gemini 세션을 각각 연다.
2. 각 서비스의 composer에 포커스하고 `/ `를 입력한다.
3. promptit popup이 열리는지 확인한다.
4. Enter 또는 popup click으로 저장된 프롬프트 insert, copy, pin/unpin 흐름을 확인한다.
5. `/ ` trigger cleanup이 정상 동작하고, 의도치 않게 prompt가 제출되지 않는지 확인한다.

이 항목을 수동으로 두는 이유:

- 로그인 세션은 계정 상태, 쿠키, 사이트 UI 변경, A/B 테스트의 영향을 받아 반복 가능한 회귀 테스트로 고정하기 어렵다.
- 2026-05-07 자동 live smoke에서 public Gemini page는 promptit 선택 후 텍스트가 composer에 남지 않고 page-level submitted state로 이동했다. 현재 live smoke는 이런 경우 skip하지 않고 `actual-site-behavior-failure`로 분류한다.
- 로그인된 실제 ChatGPT/Gemini composer의 최종 전체 흐름은 사용자 세션에서 확인해야 한다.

### 백업/공유 실제 다운로드와 파일 선택

1. promptit 확장을 로드한 브라우저에서 옵션 페이지를 연다.
2. `백업/공유`를 열고 `백업`과 `프롬프트 전체 공유`가 실제 다운로드 폴더에 JSON 파일을 만드는지 확인한다.
3. 백업 JSON을 `복원`에 다시 선택했을 때 preview가 먼저 표시되고, confirm 후 데이터가 교체되는지 확인한다.
4. 공유 JSON을 `프롬프트 가져오기`에 선택했을 때 기존 프롬프트가 유지되고 새 프롬프트가 추가되는지 확인한다.

이 항목을 수동으로 두는 이유:

- Playwright는 다운로드 파일 shape와 file input flow를 자동화할 수 있지만, 실제 사용자의 브라우저 다운로드 위치, OS 파일 선택기, 확장 수동 로드 상태는 환경 차이가 있다.
- Release 전에는 자동화와 별도로 실제 패키징/수동 로드 환경에서 파일이 사용자에게 도달하는지 확인해야 한다.

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
- 백업/공유 실제 다운로드와 파일 선택 수동 체크
- 로그인된 ChatGPT/Gemini 전체 흐름 수동 체크

### 브라우저 프로세스 정리

브라우저/DevTools/Playwright를 사용한 뒤에는 호스트 프로세스 기준으로 테스트용 브라우저가 남았는지 확인한다.

```bash
ps -ef | rg '[c]hrome-devtools-mcp|[p]uppeteer_dev_chrome_profile|/opt/google/[c]hrome/chrome|[p]romptit-playwright'
```

테스트용 프로세스가 남아 있으면 일반 사용자 Chrome이 아닌지 확인한 뒤 종료한다.

```bash
pkill -f 'chrome-devtools-mcp|puppeteer_dev_chrome_profile|promptit-playwright'
```

## 추천 프롬프트

이 저장소에서는 사용자가 기본적으로 전체 테스트 실행을 원한다. 별도 지시가 없으면 전체 자동 테스트를 돌리는 쪽으로 해석해도 된다.

### 기본형

```text
TESTING.md와 TEST_CHECKLIST.md 기준으로 promptit 테스트를 진행해줘.
자동 테스트는 전부 순차 실행하고, 실패가 있으면 built-in explorer 서브에이전트를 사용해서 실패 로그 정리, 체크리스트 매핑, 원인 분석을 진행해줘.
코드 수정은 하지 말고, 마지막에는 결과 요약과 내가 수동으로 확인할 항목만 남겨줘.
```

## 현재 남은 제한

- 브라우저 툴바 확장 아이콘 클릭은 자동화하지 않았다.
- 일부 브라우저/확장 플랫폼 자체 동작은 Playwright보다 수동 점검이 더 현실적이다.
- 실사이트 smoke는 OpenAI/Gemini UI 변경, 로그인 유도 모달, A/B 테스트의 영향을 받을 수 있다.
- 실제 ChatGPT/Gemini에는 안정적인 submitted/page-level text selector가 없다. Live insert smoke는 저장 프롬프트가 composer에 남지 않으면 `actual-site-behavior-failure`로 분류한다. 2026-05-07 Gemini 결과는 이 분류의 대표 예시다.
- 백업/공유/복원/가져오기 옵션 E2E는 deterministic fixture에서 통과했지만, 실제 사용자의 다운로드 폴더, OS 파일 선택기, 수동 로드된 확장 상태는 release 전 수동 체크로 남긴다.
- 자동화 커버리지의 세부 갭은 [TEST_CHECKLIST.md](TEST_CHECKLIST.md)를 기준으로 관리한다.

## 빠른 체크리스트

- [ ] `pnpm test`
- [ ] `pnpm test:e2e:live`
- [ ] 테스트용 Chrome/MCP 프로세스 정리 확인
- [ ] 툴바 promptit 아이콘 클릭
- [ ] 옵션 페이지 정상 오픈 확인
- [ ] 백업/공유 실제 다운로드와 파일 선택 확인
- [ ] 로그인된 ChatGPT/Gemini 전체 흐름 확인
