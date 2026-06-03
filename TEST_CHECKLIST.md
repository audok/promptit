# promptit Test Checklist
This document tracks the behaviors that must be verified in promptit and the current coverage status.
Use [TESTING.md](TESTING.md) for run order and commands.

## Status Criteria
- `Automated`: repeatably verified by a local Playwright fixture or static check
- `Live smoke`: smoke-verified on real `chatgpt.com` or `gemini.google.com/app` with the test-mode `dist-test` bundle
- `Production live smoke`: smoke-verified on real `chatgpt.com` or `gemini.google.com/app` with the production `dist` bundle
- `Manual`: must be checked directly by a person before release
- `Gap`: implemented but not yet managed by automated or manual tests

## 1. Platform and Initialization
- [x] Verifies supported URLs, unsupported URLs, and test-mode localhost match boundaries. `Automated` via `tests/e2e/platform.spec.ts`
- [x] Opens the options page through a content script runtime message and ignores malformed runtime messages. `Automated` via `tests/e2e/platform.spec.ts`
- [x] Verifies the runtime request/response public contract, exact keys in literal wire-shape fixtures, omitted required key rejection, and incompatible conflict-shape rejection. `Automated` via `tests/e2e/runtime-contracts.spec.ts`
- [x] Works after same-page navigation, composer replacement, and content script reinjection without duplicate listeners. `Automated` via `tests/e2e/platform.spec.ts`, `tests/e2e/host-fixture-matrix.spec.ts`
- [x] Verifies production/test manifest i18n packaging invariants and release manifest policy. `Automated` via `scripts/check-production-manifest.mjs`, `tests/e2e/platform.spec.ts`
- [ ] Browser toolbar promptit icon click opens the options page. `Manual`

## 2. Input Detection and Trigger
- [x] `/ ` trigger and insert work across the supported composer selector matrix in ChatGPT/Gemini fixtures. `Automated` via `tests/e2e/host-fixture-matrix.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`
- [x] Stable resolution for `contenteditable`, `textarea`, Gemini Quill composer, and child-node event bubbling. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`
- [x] Verifies `/` alone, non-collapsed selection, NBSP, readonly/disabled textarea, contenteditable block boundary, and detached/stale composer boundaries. No selection/invalid selection direct calls for contenteditable are managed as adapter-level branch coverage, not host popup behavior. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`
- [x] Does not open the popup or execute popup keyboard commands during IME composition. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`
- [x] Close paths either clean up trigger text or preserve input: Escape, Backspace, outside click, blur, resize, normal typing, and composer detach. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`
- [x] Verifies popup placement, scroll repositioning, long-list active row visibility, and ChatGPT/Gemini wrapper anchoring. `Automated` via `tests/e2e/slash-popup-triggering.spec.ts`, `tests/e2e/slash-popup-ui.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`

## 3. Popup Interactions and Failure Recovery
- [x] Popup opens from a metadata-only list, then reads the latest body at selection time for insert/copy. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`
- [x] Executes insert/copy/pin/open-options through click, hover, keyboard navigation, Arrow key edge behavior, and Tab behavior. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`, `tests/e2e/slash-popup-ui.spec.ts`
- [x] Pin/unpin keeps the popup open and updates persisted pinned state, ordering, and active visual state. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`, `tests/e2e/slash-popup-ui.spec.ts`
- [x] Popup state is recoverable during busy body reads, stale popup actions, storage refreshes, and 150-prompt scale. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`, `tests/e2e/responsive-and-scale.spec.ts`
- [x] Empty state can open the options page. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`; `Live smoke` via `tests/live/live-chatgpt.spec.ts`, `tests/live/live-gemini.spec.ts`
- [x] Verifies list/body read failure, insert/copy/open-options failure, cleanup failure, and stale pin conflict with localized toasts. `Automated` via `tests/e2e/slash-popup-actions.spec.ts`, `tests/e2e/slash-popup-triggering.spec.ts`, `tests/e2e/runtime-contracts.spec.ts`
- [x] Malformed IndexedDB metadata/body rows and missing body rows produce repeatable popup/options failure UI. `Automated` via `tests/e2e/prompt-storage-corruption.spec.ts`

## 4. Options Page and Storage
- [x] Verifies options open, language/theme preferences, Korean/English localization, and fixed literal preservation. `Automated` via `tests/e2e/options-preferences.spec.ts`
- [x] Verifies prompt create/edit/delete, validation, dirty draft preservation, selected body load failure, and save/delete/storage failure. `Automated` via `tests/e2e/options-prompts.spec.ts`, `tests/e2e/options-editor-conflicts.spec.ts`
- [x] Verifies editor reducer transitions for external change, save echo, delete recovery, and conflict state. `Automated` via `tests/e2e/promptEditorReducer.spec.ts`
- [x] Prompt bodies are stored in IndexedDB `promptBodies` and not in `chrome.storage.local`. `Automated` via `tests/e2e/options-prompts.spec.ts`
- [x] Verifies body size limit, metadata-only save, body save timestamp/char count, and stale body conflict. `Automated` via `tests/e2e/options-prompts.spec.ts`, `tests/e2e/options-editor-conflicts.spec.ts`
- [x] Verifies pinned/normal ordering, hidden internal order fields, list pin toggle, drag/keyboard reorder, tie-breaks, and move conflict fallback. `Automated` via `tests/e2e/options-ordering.spec.ts`
- [x] Verifies backup/share export JSON shape, restore preview/confirm/rollback, malformed restore, import append/no-overwrite, and stale editor refresh. `Automated` via `tests/e2e/options-backup-share.spec.ts`
- [x] Malformed IndexedDB metadata/body rows lead to options load/body failure UI. `Automated` via `tests/e2e/prompt-storage-corruption.spec.ts`
- [x] HTML-looking prompt titles/bodies are treated as text and do not execute in popup, options, or composer. `Automated` via `tests/e2e/security-rendering.spec.ts`
- [x] Verifies mobile/narrow overflow and 150-prompt options/popup/backup scale. `Automated` via `tests/e2e/responsive-and-scale.spec.ts`

## 5. Real-Site Smoke
- [x] Verifies popup open, prompt text visible in composer after insert, copy, pin toggle, and empty state -> options on real `chatgpt.com`. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] Verifies Escape trigger cleanup, prefix-preserving insert with prefix-before-prompt order and `/ ` trigger cleanup, multiline prompt text visible in composer after insert, pinned order after reopen, and non-empty popup -> options on real `chatgpt.com`. `Live smoke` via `tests/live/live-chatgpt.spec.ts`
- [x] Verifies popup open, prompt text visible in composer after insert, copy, pin toggle, and empty state -> options on real `gemini.google.com/app`. `Live smoke` via `tests/live/live-gemini.spec.ts`
- [x] Verifies Escape trigger cleanup, prefix-preserving insert with prefix-before-prompt order and `/ ` trigger cleanup, multiline prompt text visible in composer after insert, pinned order after reopen, and non-empty popup -> options on real `gemini.google.com/app`. `Live smoke` via `tests/live/live-gemini.spec.ts`
- [x] Verifies that after `/ ` insert with the production `dist` bundle on real ChatGPT/Gemini composers, prompt text is visible in the composer and the popup host is dismissed. `Production live smoke` via `tests/live/live-prod-insert.spec.ts`
- [ ] Recheck the same flows and no unintended submit in logged-in ChatGPT/Gemini sessions. `Manual`

## 6. Current Remaining Limits
- Browser toolbar UI is not controlled reliably through Playwright fixtures.
- Fixture host tests verify selector/DOM compatibility and promptit's insertion paths on controlled pages. They do not guarantee internal state synchronization for real third-party editors such as ChatGPT ProseMirror, Gemini Quill, or a future Lexical editor.
- Logged-in real ChatGPT/Gemini sessions remain manual because they are affected by account state, cookies, and A/B tests.
- Live smoke verifies that prompt text is visible in the composer, but it cannot automatically guarantee no-submit because there is no selector that reliably reads submitted messages. It also does not automatically classify product regressions, external site DOM/behavior changes, or external environment issues.
- Real download locations and OS file pickers are checked manually before release, separately from fixture E2E.

## 7. Manual Tests
- [ ] Confirm that clicking the browser toolbar promptit icon opens the options page or focuses an existing options tab, and that the title is `promptit Settings`. `Manual`
- [ ] Confirm `/ ` popup, insert, copy, pin/unpin, trigger cleanup, and no unintended submit in logged-in ChatGPT and Gemini. `Manual`
- [ ] Confirm backup/share export, restore, and import flows with the actual downloads folder and OS file picker. `Manual`
