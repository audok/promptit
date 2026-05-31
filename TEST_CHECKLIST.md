# promptit Test Checklist

이 문서는 promptit에서 검증해야 하는 동작과 현재 커버 상태를 추적하는 coverage ledger입니다.
실행 순서와 명령은 [TESTING.md](TESTING.md)를 기준으로 봅니다.

## 상태 기준

- `Automated`: 로컬 Playwright fixture 또는 정적 검사로 반복 가능하게 검증됨
- `Live smoke`: 실제 `chatgpt.com` 또는 `gemini.google.com/app`에서 smoke로 검증됨
- `Manual`: 사람이 release 전에 직접 확인해야 함
- `Gap`: 구현은 있지만 아직 자동화 또는 수동 테스트로 관리되지 않음

## 1. 플랫폼과 초기화

- [x] 지원 URL, 미지원 URL, test-mode localhost match 경계를 검증한다. `Automated` via `tests/e2e/platform.spec.ts`
- [x] content script runtime message로 옵션 페이지를 열고 malformed runtime message는 무시한다. `Automated` via `tests/e2e/platform.spec.ts`
- [x] runtime request/response public contract와 malformed payload rejection을 검증한다. `Automated` via `tests/e2e/runtime-contracts.spec.ts`
- [x] same-page navigation, composer replacement, content script 재주입에서도 중복 listener 없이 동작한다. `Automated` via `tests/e2e/platform.spec.ts`, `tests/e2e/host-fixture-matrix.spec.ts`
- [x] production/test manifest i18n packaging invariants와 release manifest policy를 검증한다. `Automated` via `scripts/check-production-manifest.mjs`, `tests/e2e/platform.spec.ts`
- [ ] 브라우저 툴바 promptit 아이콘 클릭으로 옵션 페이지가 열린다. `Manual`

## 2. 입력 감지와 Trigger

- [x] ChatGPT/Gemini fixture의 supported composer selector matrix에서 `/ ` trigger와 insert가 동작한다. `Automated` via `tests/e2e/host-fixture-matrix.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`
- [x] `contenteditable`, `textarea`, Gemini Quill composer, child-node event bubbling을 안정적으로 resolve한다. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`
- [x] `/` 단독, non-collapsed selection, NBSP, readonly/disabled textarea, contenteditable block boundary, detached/stale composer 경계를 검증한다. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`
- [x] IME 조합 중에는 popup open과 popup keyboard command를 실행하지 않는다. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`
- [x] close paths가 trigger text를 정리하거나 입력을 보존한다: Escape, Backspace, outside click, blur, resize, 일반 typing, composer detach. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`
- [x] popup placement, scroll reposition, long-list active row visibility, ChatGPT/Gemini wrapper anchoring을 검증한다. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`, `tests/e2e/slash-popup-ui.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`

## 3. 팝업 상호작용과 실패 복구

- [x] 팝업은 metadata-only 목록을 열고, 선택 시점의 최신 body로 insert/copy한다. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`
- [x] click, hover, keyboard navigation, Arrow key edge behavior, Tab behavior로 insert/copy/pin/open-options를 실행한다. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`, `tests/e2e/slash-popup-ui.spec.ts`
- [x] pin/unpin은 popup을 유지하고 persisted pinned state, ordering, active visual state를 갱신한다. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`, `tests/e2e/slash-popup-ui.spec.ts`
- [x] busy body read, stale popup action, storage refresh, 150-prompt scale에서도 popup state가 복구 가능하다. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`, `tests/e2e/responsive-and-scale.spec.ts`
- [x] empty state에서 옵션 페이지를 열 수 있다. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`; `Live smoke` via `tests/live/live-chatgpt.spec.ts`, `tests/live/live-gemini.spec.ts`
- [x] list/body read failure, insert/copy/open-options failure, cleanup failure, stale pin conflict를 locale별 toast와 함께 검증한다. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`, `tests/e2e/slash-popup-triggering.spec.ts`, `tests/e2e/runtime-contracts.spec.ts`
- [x] malformed IndexedDB metadata/body row와 missing body row에서도 popup/options failure UI가 반복 가능하게 검증된다. `Automated` via `tests/e2e/prompt-storage-corruption.spec.ts`

## 4. 옵션 페이지와 스토리지

- [x] options open, language/theme preference, Korean/English localization, fixed literal 보존을 검증한다. `Automated` via `tests/e2e/options-preferences.spec.ts`
- [x] prompt create/edit/delete, validation, dirty draft 보존, selected body load failure, save/delete/storage failure를 검증한다. `Automated` via `tests/e2e/options-prompts.spec.ts`, `tests/e2e/options-editor-conflicts.spec.ts`
- [x] editor reducer의 external change, save echo, delete recovery, conflict state 전이를 검증한다. `Automated` via `tests/e2e/promptEditorReducer.spec.ts`
- [x] prompt body는 IndexedDB `promptBodies`에 저장되고 `chrome.storage.local`에는 저장되지 않는다. `Automated` via `tests/e2e/options-prompts.spec.ts`
- [x] body size limit, metadata-only save, body save timestamp/char count, stale body conflict를 검증한다. `Automated` via `tests/e2e/options-prompts.spec.ts`, `tests/e2e/options-editor-conflicts.spec.ts`
- [x] pinned/normal ordering, hidden internal order fields, list pin toggle, drag/keyboard reorder, tie-break, move conflict fallback을 검증한다. `Automated` via `tests/e2e/options-ordering.spec.ts`
- [x] backup/share export JSON shape, restore preview/confirm/rollback, malformed restore, import append/no-overwrite, stale editor refresh를 검증한다. `Automated` via `tests/e2e/options-backup-share.spec.ts`
- [x] malformed IndexedDB metadata/body row가 options load/body failure UI로 이어지는지 검증한다. `Automated` via `tests/e2e/prompt-storage-corruption.spec.ts`
- [x] HTML-looking prompt title/body는 popup, options, composer에서 실행되지 않고 text로 처리된다. `Automated` via `tests/e2e/security-rendering.spec.ts`
- [x] mobile/narrow overflow와 150-prompt options/popup/backup scale을 검증한다. `Automated` via `tests/e2e/responsive-and-scale.spec.ts`

## 5. 실사이트 Smoke

- [x] 실제 `chatgpt.com`에서 popup open, insert without submit, copy, pin toggle, empty state -> options를 검증한다. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] 실제 `chatgpt.com`에서 Escape trigger cleanup, prefix-preserving insert, multiline insert without submit, pinned order after reopen, non-empty popup -> options를 검증한다. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] 실제 `gemini.google.com/app`에서 popup open, insert without submit, copy, pin toggle, empty state -> options를 검증한다. `Live smoke` via `tests/live/live-gemini.spec.ts`
- [x] 실제 `gemini.google.com/app`에서 Escape trigger cleanup, prefix-preserving insert, multiline insert without submit, pinned order after reopen, non-empty popup -> options를 검증한다. `Live smoke` via `tests/live/live-gemini.spec.ts`
- [ ] 로그인된 ChatGPT/Gemini 세션에서 같은 흐름을 반복 확인한다. `Manual`

## 6. 현재 남은 제한

- 브라우저 툴바 UI는 Playwright fixture로 안정적으로 제어하지 않는다.
- 로그인된 실제 ChatGPT/Gemini 세션은 계정 상태, 쿠키, A/B 테스트 영향을 받아 수동 테스트로 둔다.
- live smoke는 제품 회귀, 외부 사이트 DOM/동작 변경, 외부 환경 문제를 자동 분류하지 않는다.
- 실제 다운로드 위치와 OS 파일 선택기는 fixture E2E와 별도로 release 전에 수동 확인한다.

## 7. 수동 테스트

- [ ] 브라우저 툴바 promptit 아이콘 클릭이 옵션 페이지를 열거나 기존 옵션 탭에 포커스하고, 제목이 `promptit Settings`인지 확인한다. `Manual`
- [ ] 로그인된 ChatGPT와 Gemini에서 `/ ` popup, insert, copy, pin/unpin, trigger cleanup, no unintended submit을 확인한다. `Manual`
- [ ] 실제 다운로드 폴더와 OS 파일 선택기로 backup/share export, restore, import 흐름을 확인한다. `Manual`
