# Harden Content Runtime State During IME and Async Popup Actions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document according to `PLANS.md` in the repository root.

## Purpose / Big Picture

Promptit opens a prompt picker when the user types `/ ` in a supported AI site editor. The F3 triage finding is that the content runtime can confuse input method editor composition with Promptit popup commands. A user composing Korean, Japanese, or Chinese text may press Enter, Escape, or Backspace to commit, cancel, or edit IME candidates; Promptit must not treat those keys as "insert the active prompt" or "close and remove the trigger" while composition is active.

This plan also covers the adjacent state-safety risks found in the same content runtime path. A `compositionend` event must not turn an already-open popup session back into an armed trigger check, input events during a busy async popup action must not close/reset the popup underneath that action, and async continuations must not mutate stale popup/session state after the session has moved on. The result should be a small safety patch, not a broad state-machine rewrite.

After implementation, a user can still type `/ ` to open the popup, use arrow keys to move, Enter to select, Escape or Backspace to close outside of IME composition, and click copy/pin/settings as before. During active Korean/Japanese/Chinese composition, IME keys remain owned by the browser/IME until composition ends.

## Progress

- [x] (2026-05-11 20:40 KST) Read `PLANS.md` and confirmed the required ExecPlan structure.
- [x] (2026-05-11 20:42 KST) Inspected `.codex/agents` and delegated read-only planning support to the project `code-mapper` and `code-reviewer` agents.
- [x] (2026-05-11 20:49 KST) Mapped the content entry points, session state, trigger debounce path, popup keyboard path, IME listeners, busy async actions, and existing slash-popup tests.
- [x] (2026-05-11 20:54 KST) Incorporated subagent findings into this plan without making implementation changes.
- [x] (2026-05-12 15:02 KST) Re-read this ExecPlan, re-inspected the content runtime diff, and confirmed the implementation scope is still limited to F3 state safety plus related tests.
- [x] (2026-05-12 15:05 KST) Added/reused focused regression coverage for IME key suppression, `compositionend` while already open, busy select/copy input handling, and stale delayed selection after composer detach.
- [x] (2026-05-12 15:08 KST) Implemented minimal controller/session guards for IME keydown, composition scheduling, busy input, and stale async popup continuations.
- [x] (2026-05-12 15:16 KST) Ran typecheck, test build, full affected slash-popup and Gemini specs, production build, diff whitespace check, and host-level browser cleanup check.
- [x] (2026-05-12 15:17 KST) Completed static self-review and received a scoped review subagent pass with no blocking runtime findings.

## Surprises & Discoveries

- Observation: The real content entry point is thin. `src/content/content-script.ts` imports `bootstrapContentScript` from `src/content/main.ts`, and `src/content/main.ts` only re-exports from `src/content/controller.ts`.
  Evidence: `src/content/content-script.ts` and `src/content/main.ts` contain only those bootstrap statements.

- Observation: `compositionend` always schedules a trigger check after clearing `session.isComposing`, even if the popup is already open or an async action is busy.
  Evidence: `src/content/controller.ts` lines 156-167 set `session.isComposing = false` and call `scheduleTriggerCheck(input, session, popup, adapter)`.

- Observation: popup key handling maps keys before checking IME state. `Enter`, `Escape`, and `Backspace` are always converted to popup select/close commands when `session.status === 'open'`.
  Evidence: `src/content/controller.ts` lines 198-220 call `getPopupKeyAction(event)` for open-popup keydown; `src/content/keyboard.ts` lines 78-100 maps Escape, Backspace, and Enter to close/select actions.

- Observation: the `input` listener closes an open popup before checking composition and without checking `session.isBusy`.
  Evidence: `src/content/controller.ts` lines 180-193 return for internal/closing, close when `status === 'open'`, then check `session.isComposing`.

- Observation: trigger opening already has a request-id stale guard, but popup actions do not. `resolveTriggerCheck` checks `triggerRequestId` before and after async prompt metadata reads; `handleSelection`, `handleCopy`, `handleTogglePinned`, and `performOpenOptionsAction` resume after awaits and mutate the shared session without a current-action token.
  Evidence: `src/content/controller.ts` lines 421-520 guard trigger checks, while lines 534-835 contain async popup action handlers without an equivalent guard.

- Observation: existing e2e coverage already protects the normal `/ ` trigger, composition-delayed opening, cleanup failure behavior, copy/pin/select flows, NBSP trigger, non-collapsed selection, and composer detach during pending trigger resolution.
  Evidence: `tests/e2e/slash-popup.spec.ts` contains tests around lines 565-940 and 1202-1688 for these paths.

- Observation: The test-only delayed prompt-body read helper was already added during the baseline work and was reused here instead of creating a second async test hook.
  Evidence: `src/content/controller.ts` exposes `deferPromptBodyRead` and `promptit:test-release-prompt-body-read` only when `VITE_PROMPTIT_TEST_MODE=1`.

- Observation: A production `pnpm build` overwrites the test-mode extension bundle. Any Playwright test that depends on `promptit:test-set-controls` must be preceded by a fresh `pnpm build:test`.
  Evidence: The focused F3 tests were run only after rebuilding with `VITE_PROMPTIT_TEST_MODE=1`; production build was run after browser validation.

- Observation: The existing "resets composing state after a popup closes during IME input" test expected composition input to close the popup. That is no longer the desired policy, so the test now closes via resize and then verifies composition state reset.
  Evidence: `tests/e2e/slash-popup.spec.ts` now asserts the popup remains visible during composition input before dispatching `resize`.

- Observation: The full slash-popup suite now has one remaining failing test, `does not open across contenteditable block boundaries`.
  Evidence: The failing assertion receives one popup host. This is the F4 adapter boundary regression intentionally carried forward to `EXECPLAN_05_ADAPTER_MUTATION_SAFETY.md`.

## Decision Log

- Decision: Keep the first implementation as a safety patch centered on `src/content/controller.ts` and `src/content/session.ts`, not a reducer migration.
  Rationale: The failures come from a few listener ordering and async continuation boundaries. A reducer could be useful in a later broader lifecycle refactor, but it is larger than needed to stop F3 regressions.
  Date/Author: 2026-05-11 / Codex

- Decision: Suppress popup command handling during composition before calling `getPopupKeyAction` or consuming the key event.
  Rationale: IME Enter/Escape/Backspace must remain available to the IME. Calling `preventDefault` or `stopImmediatePropagation` for those keys can interfere with candidate commit/cancel/edit behavior.
  Date/Author: 2026-05-11 / Codex

- Decision: Only schedule a trigger check from `compositionend` when the session is idle or already armed and not busy.
  Rationale: `armTrigger` changes `session.status` to `armed`. Calling it while a popup is open can leave a visible popup paired with non-open session state.
  Date/Author: 2026-05-11 / Codex

- Decision: Add a small popup action token or session generation helper for async popup actions.
  Rationale: The existing `triggerRequestId` pattern demonstrates the local approach for stale async work. Popup actions need a similar guard so code after `await` can prove it still owns the current open popup before mutating DOM, focus, popup state, toast, or session busy state.
  Date/Author: 2026-05-11 / Codex

- Decision: Use Playwright synthetic composition events for automated regression coverage and record real OS IME smoke testing as release confidence, not as a required CI gate.
  Rationale: Automated browser tests can reliably cover the content runtime listener contracts, but real Korean/Japanese/Chinese IME candidate windows vary by OS and cannot be fully simulated in Playwright.
  Date/Author: 2026-05-11 / Codex

- Decision: Keep the IME suppression in `src/content/controller.ts` rather than changing `src/content/keyboard.ts`.
  Rationale: The keyboard mapper can remain a pure popup-key mapper. The controller has the session composition state and can return before mapping or consuming IME-owned keys.
  Date/Author: 2026-05-12 / Codex

- Decision: Use an action-token helper that captures `actionRequestId`, `activeInput`, and `triggerContext` identity.
  Rationale: This follows the existing request-id style without introducing a reducer. It also lets stale continuations prove whether they still own the current open popup before mutating DOM, popup UI, focus, toast, or busy state.
  Date/Author: 2026-05-12 / Codex

- Decision: Add deterministic delayed e2e coverage for select/copy body-read paths and stale select detach, but not broader storage/runtime delay hooks for pin/open-options.
  Rationale: Select and copy exercise the user-visible body-read race directly. Pin and open-options now use the same token helper and were reviewed statically; adding more test-only delay surface would be larger than this F3 patch needs.
  Date/Author: 2026-05-12 / Codex

## Outcomes & Retrospective

Implemented the F3 state-safety patch in `src/content/controller.ts` and `src/content/session.ts`, with focused coverage in `tests/e2e/slash-popup.spec.ts`.

Runtime changes:

- Popup keydown now returns before key mapping or event consumption when `session.isComposing`, `event.isComposing`, or the IME `Process` key indicates composition.
- `compositionend` and `scheduleTriggerCheck()` now schedule only for connected inputs while the session is idle or armed, not busy, and not composing.
- Input events now ignore internal changes, closing sessions, busy actions, and active composition before closing an open popup for ordinary resumed typing.
- Popup async actions now use session action tokens. Stale select, copy, pin, and open-options continuations return before mutating old popup/session/input state.
- `closePopup()` and `resetSessionState()` invalidate pending action continuations.

Test changes:

- Added busy select and busy copy regression tests using the existing test-only deferred body-read hook.
- Added IME Enter/Escape/Backspace suppression coverage while a popup is open.
- Added `compositionend`-while-open coverage that proves the existing popup remains usable.
- Added stale delayed select coverage after the composer detaches.
- Adjusted the composition reset test to close via resize because composition input is now intentionally ignored while the popup is open.
- Reused the existing F4 block-boundary regression test as an expected failing input for ExecPlan 05.

Validation:

- `pnpm typecheck`: passed.
- `pnpm build:test`: passed.
- `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts -g "resets composing state|busy and open|IME keydown|compositionend|stale prompt insertion"`: passed, 7/7.
- `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts`: expected failure, 50 passed and 1 failed. The only failure was `does not open across contenteditable block boundaries`, which is F4 and belongs to ExecPlan 05.
- `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/gemini-slash-popup.spec.ts`: passed, 8/8.
- `pnpm build`: passed.
- `git diff --check -- src/content/controller.ts src/content/session.ts tests/e2e/slash-popup.spec.ts EXECPLAN_04_CONTENT_STATE_SAFETY.md`: passed before this documentation update; rerun after the update also passed.
- Host-level `ps -ef` cleanup check after Playwright showed no lingering `/opt/google/chrome/chrome` or `promptit-playwright` process. Existing `chrome-devtools-mcp` processes were present and unrelated to these Playwright runs.

Review:

- A scoped review subagent reviewed `src/content/controller.ts`, `src/content/session.ts`, `tests/e2e/slash-popup.spec.ts`, and this ExecPlan. It found no blocking runtime issues. Its only process finding was that this document still needed post-implementation updates, now addressed.

Residual risks:

- Pin and open-options stale continuations are protected by the same token helper and static review, but do not have a new deterministic delayed e2e case.
- Synthetic Playwright composition events do not fully prove native Korean/Japanese/Chinese IME candidate-window behavior. A manual OS IME smoke test remains release confidence work.
- The contenteditable hard block-boundary trigger bug remains open for ExecPlan 05.

## Context and Orientation

This repository is a Chrome extension. The content script runs inside supported AI websites and watches the active editor. When it sees the literal trigger sequence `/ ` before the caret, it opens a shadow-DOM popup listing saved prompts. The popup can insert a prompt into the editor, copy a prompt, toggle a prompt's pinned state, close, or open the options page.

The main files for this work are:

- `src/content/content-script.ts`: the content script bundle entry; it calls the bootstrap function.
- `src/content/main.ts`: re-exports `bootstrapContentScript`.
- `src/content/controller.ts`: owns runtime listeners, popup creation, trigger checks, close/reset, async select/copy/pin/open-options actions, and test-only controls.
- `src/content/session.ts`: defines `PopupSessionState`, status values, active-cell movement helpers, trigger request id invalidation, and `resetSessionState`.
- `src/content/trigger.ts`: defines `TRIGGER_SEQUENCE`, `TRIGGER_DEBOUNCE_MS`, `clearTriggerArm`, and `armTrigger`.
- `src/content/keyboard.ts`: maps keydown events to popup actions.
- `src/content/popup.ts`: renders the popup and forwards click/pointer actions to controller callbacks.
- `src/adapters/base.ts`: defines the site adapter interface and `TriggerContext`, the snapshot of the `/ ` range to remove or replace.
- `src/adapters/chatgpt.ts`, `src/adapters/gemini.ts`, and `src/adapters/editable.ts`: implement editor detection, trigger range capture, and editor mutation for ChatGPT-like and Gemini-like fixtures.
- `tests/e2e/slash-popup.spec.ts`: primary existing regression suite for the ChatGPT-style contenteditable and textarea fixtures.
- `tests/e2e/gemini-slash-popup.spec.ts`: Gemini fixture coverage.
- `tests/playwright/promptit.ts`: shared Playwright helpers for opening fixtures, dispatching test events, reading composer text, and interacting with the popup.

Important terms in this plan:

An IME, or input method editor, is the browser/operating-system layer used to compose languages such as Korean, Japanese, and Chinese from multiple keystrokes. While composition is active, Enter, Escape, Backspace, and arrows may be part of candidate selection or text composition rather than ordinary web page commands.

A popup session is the mutable object returned by `createSessionState()` in `src/content/session.ts`. It stores whether Promptit is idle, armed, open, or closing, plus the active editor element, trigger range, popup items, active row/cell, timers, composition state, internal-change suppression, busy state, and cleanup observer.

Armed means Promptit has seen a possible `/ ` trigger and has scheduled a debounce timer before opening the popup. Open means the popup is visible and the session has a `triggerContext`. Closing means Promptit is cleaning up trigger text or resetting state.

A stale async continuation is code after `await` that resumes after the session has changed. For example, `handleSelection()` may start reading a prompt body, but before the read resolves, an input event, DOM removal, or close can reset the popup. When the body read later resolves, it must not insert into an old editor or mutate a destroyed popup.

## Existing Runtime Flow

The startup flow is simple. `src/content/content-script.ts` imports `bootstrapContentScript` from `src/content/main.ts`, and `src/content/main.ts` re-exports it from `src/content/controller.ts`. `bootstrapContentScript()` resolves the adapter for the current URL, prevents duplicate initialization with `window.__promptitContentInitialized__`, creates one `PopupSessionState`, creates one `PromptPopup`, subscribes to prompt metadata changes, registers document/window/test listeners, and marks the page as ready in test mode.

The normal `/ ` trigger flow starts in the document `input` listener in `src/content/controller.ts`. The controller resolves the event target to a supported composer using `adapter.resolveTargetInput(event.target)`. It ignores Promptit internal changes and closing sessions. Today, if `session.status === 'open'`, it closes the popup for resumed typing. If `session.isComposing` is true, it returns. Otherwise, it calls `scheduleTriggerCheck()`.

`scheduleTriggerCheck()` stores `session.activeInput = input` and calls `armTrigger()` from `src/content/trigger.ts`. `armTrigger()` clears any previous armed timer, sets `session.status = 'armed'`, increments `triggerRequestId`, and schedules a 100 ms timer. The timer calls `resolveTriggerCheck()`. That function checks `shouldAbortTriggerCheck()` before and after the async metadata read. If the input is still focused, connected, active, not composing, still armed, and still has the same request id, it captures a trigger context through the adapter, reads prompt metadata, builds launcher items, sets `session.status = 'open'`, stores popup state, calls `popup.show()`, and installs a mutation observer to close if the input is removed.

The popup keyboard flow is also in `src/content/controller.ts`. A capture-phase document `keydown` listener returns unless `session.status === 'open'`. It calls `getPopupKeyAction()` in `src/content/keyboard.ts`. That mapper returns movement actions for arrows, close actions for Escape and Backspace, select-active for Enter, close-for-typing for printable keys, and passive behavior for modifier/control keys. The controller then calls `consumePopupKeyEvent()`, which can `preventDefault()` and always `stopImmediatePropagation()` for handled popup keys. If `session.isBusy` is true, the controller returns after consuming. Otherwise it closes, moves active cell, or dispatches to select/copy/pin based on the active cell.

The popup mouse path starts in `src/content/popup.ts`. `PromptPopup` renders a shadow root, prevents default on shadow `pointerdown`, updates active cell on shadow `pointermove`, and on shadow `click` calls controller callbacks for exit, open-options, pin, copy, and select.

The close/reset path is `closePopup()` in `src/content/controller.ts`. It returns false if already idle, clears the trigger arm, sets `session.status = 'closing'`, snapshots the active input and trigger context, optionally removes trigger text through the adapter, handles cleanup failure by reopening if allowed, then destroys the popup, disconnects the input observer, and calls `resetSessionState()` in `src/content/session.ts`.

The async popup action paths are `handleSelection()`, `handleCopy()`, `handleTogglePinned()`, and `performOpenOptionsAction()` in `src/content/controller.ts`. They set `session.isBusy = true`, update popup busy UI, await storage, clipboard, or runtime work, and then mutate the editor, popup, focus, toast, or session. These are the paths that need stale-continuation guards.

## Plan of Work

Start by adding focused failing or characterization tests. Prefer tests before implementation because F3 is behavioral and several current paths already have partial coverage. Use `tests/e2e/slash-popup.spec.ts` as the main file because it already contains helper functions for composition events, input events, prompt records, active popup cell labels, clipboard permissions, and popup assertions. Use `tests/e2e/gemini-slash-popup.spec.ts` only for one adapter integration check if the implementation touches adapter behavior; the expected implementation should not.

Add a small helper in `tests/e2e/slash-popup.spec.ts` if needed to dispatch composing keydown events from the composer. The helper should run in `page.evaluate()` and dispatch a bubbling, cancelable `KeyboardEvent('keydown', { key })` on `#prompt-textarea`. Browser support for setting `KeyboardEvent.isComposing` is inconsistent, so the test should primarily rely on a preceding `compositionstart` event to set `session.isComposing`. If `isComposing` can be set in the constructed event, include it as an extra signal, but do not make the test depend solely on it.

Add a test for Korean IME Enter while the popup is already open. Seed prompts, open the popup, dispatch `compositionstart` with data such as `한`, dispatch a composing Enter keydown, and assert that the popup remains visible, composer text is still `/ `, no prompt content was inserted, and the active cell label is unchanged. Then dispatch `compositionend` and assert there is still exactly one popup host and the popup remains usable.

Add a test for Japanese IME Escape while the popup is already open. Use composition data such as `あ`, dispatch Escape during composition, and assert Promptit does not close and does not remove trigger text. After `compositionend`, press Escape normally and assert the existing non-composition close-and-clean behavior still works.

Add a test for Chinese IME Backspace while the popup is already open. Use composition data such as `你`, dispatch Backspace during composition, and assert Promptit does not close and does not remove trigger text. After `compositionend`, press Backspace normally and assert the existing non-composition close-and-clean behavior still works.

Add a test that `compositionend` while the popup is already open does not arm a new trigger check or create inconsistent popup/session state. Open the popup, capture the active cell label and popup host count, dispatch `compositionstart` and `compositionend`, wait slightly longer than `TRIGGER_DEBOUNCE_MS`, and assert there is exactly one popup host, the same popup titles are visible, and pressing Enter once still selects the active prompt and closes normally. This proves the visible popup remains connected to an open session.

Keep the existing test that `/ ` typed during composition opens only after `compositionend`, and broaden it only if necessary. The current test named `waits for compositionend before opening the popup` already covers the core behavior. If the implementation changes composition scheduling, update this test to run compact cases for Korean, Japanese, and Chinese composition data while still asserting no popup before `compositionend` and visible popup after `compositionend`.

Add a deterministic busy-input test. The current test-control event in `src/content/controller.ts` can force failures but cannot pause async actions. If a race cannot be tested deterministically with existing controls, extend the existing `TEST_SET_CONTROLS_EVENT` test-only surface with a narrowly scoped delay such as `delayPromptBodyReadMs` or `delayNextPromptActionMs`. Keep it behind `IS_TEST_MODE`, reset it after use, and do not affect production. Start a select or copy action, dispatch an input event on the composer while the action is busy, release the delayed action, and assert the normal action result still happens. For select, the prompt is inserted and the popup closes. For copy, the trigger is cleaned and the clipboard contains the prompt content. This verifies busy input no longer closes/reset the popup underneath the action.

Add one stale-continuation test if feasible with the same deterministic delay hook. Start a delayed select action, remove the composer or otherwise force a legitimate session reset before the delayed body read resolves, then release the delay. Assert no prompt content is inserted, no popup host is resurrected, no stale success toast appears, and focus is not applied to the removed input. If every normal close route is intentionally blocked while busy, use composer removal because the existing mutation observer path already closes on disconnected active input.

After tests are in place, implement the minimal runtime guards. In `src/content/controller.ts`, add an IME gate at the top of the open-popup keydown branch. If `session.isComposing` or `event.isComposing` is true, return before calling `getPopupKeyAction()` and before consuming the event. If local browser traces show `event.key === 'Process'` for IME activity, include it as a non-command path too. This keeps IME keys available to the browser.

Update `compositionend` handling in `src/content/controller.ts`. It should still set `session.isComposing = false`, but it should call `scheduleTriggerCheck()` only when the session is eligible for trigger scheduling. Eligibility should mean the target input is connected and resolved, `session.isBusy` is false, and `session.status` is `idle` or `armed`. It must not schedule from `open` or `closing`. Also put the same eligibility guard inside `scheduleTriggerCheck()` so future callers cannot accidentally call `armTrigger()` while open.

Update the `input` listener ordering in `src/content/controller.ts`. The intended order is: resolve a supported input; ignore internal changes and closing; ignore busy; ignore active composition using `session.isComposing` or `event.isComposing`; if the popup is open, close for resumed typing without trigger cleanup; otherwise schedule a trigger check if eligible. This preserves ordinary typing-close behavior while preventing IME and busy events from resetting popup state.

Add a small action-generation guard in `src/content/session.ts`. Add a numeric field to `PopupSessionState`, for example `actionRequestId` or `sessionGeneration`, initialized to `0` in `createSessionState()`. Add helper functions equivalent to `invalidatePopupActionContinuations(session)`, `captureOpenPopupActionToken(session)`, and `isCurrentPopupActionToken(session, token)`. A token should capture the counter, the current `activeInput`, and the current `triggerContext` identity or cloned trigger context. The validator should require the same counter, `session.status === 'open'`, the same active input, a non-null trigger context, and a connected active input. Exact names can differ, but the contract must be obvious.

Call the invalidation helper when a real close begins and in `resetSessionState()`. Be careful with the cleanup-failure reopen branch in `closePopup()`: if cleanup fails and the popup reopens, the reopened popup must still be usable. The simplest safe pattern is to invalidate when closing starts, then have the reopened path return to open with no stale action token still current. Future actions can capture a new token.

Use the action token in `handleSelection()`, `handleCopy()`, `handleTogglePinned()`, and `performOpenOptionsAction()`. Capture a token only after the handler has confirmed it can start and before setting busy. After each `await`, and immediately before DOM mutation, clipboard write, popup update, focus, toast, close, or busy reset, check that the token is still current. If it is stale, return without touching old state. For current actions, preserve existing success and failure messages.

For `handleSelection()`, the critical guard is after `readPromptBodyForAction()` and before `adapter.focusInput()` and `adapter.insertPrompt()`. For `handleCopy()`, guard after body read before `navigator.clipboard.writeText()`, then again before `closePopup()` and success toast. For `handleTogglePinned()`, guard before applying response updates and before final busy/focus cleanup; do not broaden the patch into cancellation of a storage write that has already started. For `performOpenOptionsAction()`, guard before closing on success and before catch-path focus/toast/busy restoration.

Do not change adapter trigger parsing or popup rendering unless a test proves it is necessary. Existing adapter code owns textarea/contenteditable trigger context capture and mutation; this plan is only about controller/session safety.

## Concrete Steps

All commands are run from the repository root:

    cd /home/seok/code/promptit

Before implementation, inspect the worktree:

    git status --short

Add tests first. Edit only the minimum necessary files:

    tests/e2e/slash-popup.spec.ts
    src/content/controller.ts

The `src/content/controller.ts` edit in this test-first milestone should be limited to optional test-only delay controls behind the existing `IS_TEST_MODE` gate if deterministic busy/stale tests require them.

Run the focused new tests and expect them to fail or characterize current behavior before the production guard is added:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/slash-popup.spec.ts --grep "IME|compositionend|busy|stale"

Then implement the runtime guard changes in:

    src/content/controller.ts
    src/content/session.ts
    src/content/keyboard.ts

`src/content/keyboard.ts` only needs a change if the implementation chooses to put the `event.isComposing` guard in the mapper. It is also acceptable to keep all IME gating in `controller.ts` if tests cover it and the mapper remains a pure popup-key mapper.

Run TypeScript validation:

    pnpm run typecheck

Run the full affected slash-popup spec:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/slash-popup.spec.ts

Run the Gemini integration spec if any shared controller behavior could affect Gemini, which is expected for this patch:

    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/gemini-slash-popup.spec.ts

If the full specs are blocked by environment problems, record the exact command, the first relevant error, and whether `pnpm run typecheck` plus the grep-targeted tests passed. Do not declare the implementation complete from grep-only validation unless full affected spec execution is genuinely blocked and documented.

## Validation and Acceptance

The implementation is accepted when the following observable behavior is true.

Normal popup behavior remains unchanged. Typing `/ ` in the ChatGPT contenteditable fixture opens one popup. Pressing Enter on the title cell inserts the active prompt and closes. Pressing Escape or Backspace when not composing removes the trigger text and closes. Typing a printable character when not composing closes the popup without swallowing the typed character. Arrow key navigation across title, pin, and copy cells still works. Copy still fetches the latest body, writes the clipboard, cleans trigger text, and closes. Pin still toggles pinned state and keeps the popup open.

Existing trigger constraints remain unchanged. A single `/` does not open the popup. A non-collapsed selection does not open the popup. The non-breaking-space trigger `/\u00A0` still opens. The popup remains closed when the composer detaches while trigger resolution is pending.

Korean IME acceptance: with the popup already open, a composition session using data such as `한` can receive Enter without Promptit selecting a prompt. The popup remains visible, trigger text remains owned by the composer, and after `compositionend`, ordinary Enter selects normally.

Japanese IME acceptance: with the popup already open, a composition session using data such as `あ` can receive Escape without Promptit closing or cleaning trigger text. After `compositionend`, ordinary Escape closes and cleans as before.

Chinese IME acceptance: with the popup already open, a composition session using data such as `你` can receive Backspace without Promptit closing or cleaning trigger text. After `compositionend`, ordinary Backspace closes and cleans as before.

Composition scheduling acceptance: `/ ` typed during composition still waits until `compositionend` to open when the popup is not already open. A `compositionend` fired while the popup is already open does not re-arm the trigger, does not create a second popup host, does not flicker the popup, and does not leave the visible popup unusable.

Busy action acceptance: input events from the active composer while select/copy/pin/open-options is busy do not close/reset the popup underneath the action. The current action either completes with its normal result or, if the session has legitimately been invalidated, exits without stale UI mutation.

Stale continuation acceptance: if an async select/copy/pin/open-options continuation resumes after the popup has been closed, reset, or detached, it does not insert into stale input, destroy or update a new popup, refocus a removed input, reset busy state for a different action, or show a misleading success toast.

Validation commands should pass:

    pnpm run typecheck
    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/slash-popup.spec.ts
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/gemini-slash-popup.spec.ts

Because automated composition events are not a full OS IME, perform a manual Chrome smoke test before release if this patch is release-bound. Use Korean 2-set Hangul, Japanese Hiragana conversion, and Chinese Pinyin on a supported page or local fixture. Confirm Enter/Escape/Backspace during candidate composition do not trigger Promptit commands.

## Idempotence and Recovery

The implementation should be safe to apply incrementally. Test additions are additive. Runtime edits should be limited to the content controller/session/keyboard files named above. No new npm dependencies, state-management libraries, or browser APIs are needed.

If the test-only delay hook is added, keep it deterministic. A delay should affect only the next configured operation or be reset explicitly by each test through `promptit:test-set-controls`. It must be guarded by `IS_TEST_MODE`, so production builds cannot be delayed by test configuration.

If action-token guards cause a current action to leave the popup busy forever, inspect every token check in the handler. Current actions must still clear busy or close/reset normally. Only stale continuations should skip state mutation.

If cleanup failure behavior regresses, inspect `closePopup()`. Existing behavior intentionally reopens or keeps the popup visible when trigger cleanup fails unless `reopenOnCleanupFailure` is false. The action invalidation helper must not prevent future user actions on that reopened popup.

If Gemini tests fail, first check that the implementation did not change adapter target resolution or trigger parsing. The F3 fix should be adapter-neutral because the unsafe event ordering lives in the controller.

## Interfaces and Dependencies

Use existing TypeScript, Playwright, Vite, and Chrome extension APIs only.

At the end of implementation, `src/content/session.ts` should expose helper contracts equivalent to the following plain TypeScript shape. Exact names may differ, but the behavior must be clear and covered by tests:

    export type PopupActionToken = {
      actionRequestId: number;
      activeInput: HTMLElement;
      triggerContext: TriggerContext;
    };

    export function invalidatePopupActionContinuations(
      session: PopupSessionState,
    ): void;

    export function captureOpenPopupActionToken(
      session: PopupSessionState,
    ): PopupActionToken | null;

    export function isCurrentPopupActionToken(
      session: PopupSessionState,
      token: PopupActionToken,
    ): boolean;

The token capture function should return `null` unless the session is open, has a connected active input, and has a trigger context. The validation function should return false after `closePopup()` starts, after `resetSessionState()`, after the active input changes, or after the session is no longer open.

A small helper for trigger scheduling should exist in either `src/content/controller.ts` or `src/content/session.ts`. Its contract is:

    schedule a trigger only when the target input is valid, the session is not busy, the session is not composing, and the session status is idle or armed.

A reducer is explicitly out of scope for this plan. A reducer may be revisited later if broader lifecycle refactoring is needed, but the first patch should stop known F3 regressions with local helpers and targeted tests.

## Regressions to Guard Against

Do not break the literal `/ ` trigger or the NBSP `/\u00A0` variant. Do not open on only `/`. Do not open on a non-collapsed selection. Do not consume ordinary printable typing when not composing and not busy; normal typing should still close the popup and let the page receive the typed character. Do not break Escape/Backspace cleanup outside IME composition. Do not break Enter selection outside IME composition. Do not break pin/copy keyboard navigation. Do not break cleanup failure reopening. Do not create duplicate popup hosts. Do not update a destroyed popup from storage subscription callbacks. Do not broaden host adapter selectors or contenteditable mutation behavior in this patch.

## Residual Risks and Deferred Refactors

This plan prevents stale UI, DOM, focus, and toast mutation after a session changes. It does not guarantee cancellation of an external side effect that has already started, such as a clipboard write, runtime message, or storage write. If product requirements later demand cancellation semantics, add a dedicated action orchestration layer with abort signals or pre-side-effect token checks.

Composition state remains global to the single content runtime session. That matches the current single-active-composer model. If a future supported site exposes multiple simultaneous composers, track the composing input element explicitly instead of a single boolean.

Popup shadow event propagation boundaries and full popup accessibility are outside this F3 safety plan. They are separate findings from the broader triage and should not be folded into this patch unless they directly block F3 tests.

The full session transition helper or reducer refactor remains deferred. The first implementation should add only the helper contracts needed to keep `compositionend`, busy input, and async continuations safe.

## Artifacts and Notes

Read-only planning evidence:

    git status --short
    ?? .codex/
    ?? EXECPLAN_01_TESTING_BASELINE.md
    ?? EXECPLAN_02_STORAGE_DATA_SAFETY.md
    ?? EXECPLAN_03_OPTIONS_DATA_LOSS_GUARD.md
    ?? __Testing_Reference.md
    ?? __promptit_prd_tech_spec.md
    ?? output/

Source evidence:

    src/content/controller.ts:141-167
    compositionstart sets activeInput and isComposing; compositionend clears isComposing and always schedules trigger check.

    src/content/controller.ts:171-194
    input closes an open popup before checking composition and without a busy guard.

    src/content/controller.ts:198-220
    keydown maps open-popup keys without checking session.isComposing or event.isComposing.

    src/content/keyboard.ts:78-100
    Escape and Backspace map to close; Enter maps to select-active.

    src/content/trigger.ts:20-30
    armTrigger sets session.status to armed and increments triggerRequestId.

    src/content/controller.ts:421-520
    trigger resolution has request-id abort checks before and after async prompt metadata reads.

    src/content/controller.ts:534-835
    select, copy, pin, and open-options handlers await external work and then mutate session/popup/input without a popup action token.

    src/content/session.ts:264-282
    resetSessionState centralizes reset and already invalidates triggerRequestId; this is the right place to invalidate popup action continuations too.

Subagent planning support:

    code-mapper mapped the definitive startup, trigger, popup keyboard, mouse, close/reset, and busy action paths.
    code-reviewer recommended a small helper-based safety patch, explicit IME key suppression before event consumption, no reducer for this slice, deterministic busy/stale tests, and manual OS IME smoke testing as release confidence.

Change note:

    2026-05-11 / Codex: Initial ExecPlan created from the F3 triage and read-only inspection of content runtime, adapters, popup tests, and project-specific subagent feedback. The plan prioritizes minimal state safety guards and regression tests before any broader lifecycle refactor.
