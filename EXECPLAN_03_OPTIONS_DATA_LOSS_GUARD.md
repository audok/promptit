# Options Editor Data-Loss Guard

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is self-contained and assumes the reader has only the current working tree plus this file.

## Purpose / Big Picture

Promptit has an options page where users create, edit, delete, pin, and reorder saved prompts. The previous triage identified F2: the editor can become unsafe when a selected prompt body fails to load, and unsaved form input can be silently discarded when the user switches prompts, starts add mode, or cancels editing.

After this plan is implemented, users cannot accidentally save an edit whose body did not load, and dirty input is not discarded by select, add, or cancel transitions without explicit confirmation. The proof is a small set of deterministic Playwright tests in the existing options suite: body-load failure leaves stored records unchanged and disables or blocks saving, while dirty create/edit text remains visible when the user cancels the discard confirmation.

## Progress

- [x] (2026-05-11 21:34:04+09:00) Read `PLANS.md` and confirmed the required ExecPlan structure.
- [x] (2026-05-11 21:34:04+09:00) Inspected `.codex/agents` and delegated read-only planning support to project `code-mapper` and `code-reviewer` subagents.
- [x] (2026-05-11 21:34:04+09:00) Inspected `src/options/usePromptEditor.ts`, `src/options/App.tsx`, `src/prompt/storage.ts`, `src/prompt/schema.ts`, `tests/e2e/options.spec.ts`, and `tests/playwright/extension.ts`.
- [x] (2026-05-11 21:34:04+09:00) Created this ExecPlan as the only new file for this planning task.
- [x] (2026-05-12 14:44:00+09:00) Reused the already added body-load failure tests from `EXECPLAN_01_TESTING_BASELINE.md` as `already covered`, then added dirty create/add, dirty edit/select, dirty edit/cancel, prompt-specific delete-label, and dirty-edit discard plus selected-body-failure coverage in `tests/e2e/options.spec.ts`.
- [x] (2026-05-12 14:44:00+09:00) Added the smallest production guards for body-load error, unloaded edit submit, and dirty select/add/cancel transitions in `src/options/usePromptEditor.ts` and `src/options/App.tsx`.
- [x] (2026-05-12 14:44:00+09:00) Added confirmation-path tests showing dismissed dirty transitions preserve input and accepted dirty transitions proceed.
- [x] (2026-05-12 14:44:00+09:00) Updated list delete accessible names to include the prompt title because `App.tsx` was already edited for F2.
- [x] (2026-05-12 14:44:00+09:00) Deferred external-delete-while-dirty recovery because it is outside the requested select/add/cancel UI transitions and needs a product recovery decision.
- [x] (2026-05-12 14:50:47+09:00) Ran focused and broad validation. F2/options checks passed; the full `pnpm test` gate still fails only on the expected pre-fix F3/F4 slash-popup tests that are inputs to `EXECPLAN_04_CONTENT_STATE_SAFETY.md` and `EXECPLAN_05_ADAPTER_MUTATION_SAFETY.md`.

## Surprises & Discoveries

- Observation: `usePromptEditor()` already tracks `isDirty` and returns it to `App`, but `App` does not currently destructure or use it.
  Evidence: `UsePromptEditorResult` includes `isDirty`, `updateField()` sets it to true, and `App` destructures many hook fields but not `isDirty`.

- Observation: Body-load failure leaves the editor in edit mode with metadata copied into the form, empty content, `activePrompt` still null, and `bodyLoadState.status === "error"`.
  Evidence: `loadPromptRecord()` sets loading state and `createLoadingFormFromMeta(prompt)` before calling `getPromptRecord()`. On catch, it only sets `bodyLoadState` to error and sets an alert.

- Observation: Save and field disabled conditions do not treat body-load error as blocking.
  Evidence: `isEditorLoading` is derived only from `bodyLoadState.status === "loading"`. `App` uses `editorDisabled = isSaving || isEditorLoading`, and the submit button only adds `loadState.status === "error"`.

- Observation: Existing tests cover many storage and conflict flows, but not selected prompt body-load failure or dirty select/add/cancel guards.
  Evidence: `tests/e2e/options.spec.ts` has coverage for create/update, validation, initial list-load draft preservation, external delete, stale save/delete/body conflicts, and save/delete failures, but no test asserts dirty form protection on direct UI transitions.

- Observation: The list delete accessible name and the list-card button structure are both in `src/options/App.tsx`, but they differ in scope.
  Evidence: all list delete buttons use `aria-label="목록에서 프롬프트 삭제"`, which is a small same-file fix. The card selection button contains nested block structure, which is a broader semantic/layout change.

- Observation: The body-load failure tests from `EXECPLAN_01_TESTING_BASELINE.md` were already present before this plan's implementation.
  Evidence: `tests/e2e/options.spec.ts` already contained `preserves dirty create draft when selected prompt body load fails` and `disables save when selected prompt body did not load`; this plan reused and tightened them instead of creating duplicate coverage.

- Observation: A review pass found that preserving any dirty draft on selected-body failure was too broad.
  Evidence: dirty edit -> accept discard -> selected prompt body-load failure could leave the previous dirty edit active and saveable because the error `promptId` did not match the old edit `mode.promptId`.

- Observation: Running `pnpm build` concurrently with a Playwright run can clobber the test-mode `dist` built by `pnpm build:test`.
  Evidence: one full `tests/e2e/options.spec.ts` run failed only in `legacy compatibility list skips records with missing bodies` because `window.__promptitTestGetPrompts` was unavailable. Rebuilding with `pnpm build:test` and rerunning the suite alone passed 43/43.

## Decision Log

- Decision: Add tests before production changes for both halves of F2: body-load failure save blocking and dirty transition protection.
  Rationale: These are data-loss risks. The test should prove the broken behavior before the implementation changes state handling.
  Date/Author: 2026-05-11 / Codex

- Decision: Do not introduce a full editor reducer or discriminated state machine in the first F2 patch.
  Rationale: The current slices already distinguish load state, body-load state, save state, mode, conflict state, and dirty state. The immediate bug is missing guards at transition and submit boundaries. A full `loading/ready/dirty/loadError/saving/conflict` model would touch most of `usePromptEditor.ts` and should be reserved for a later refactor if the small guards become hard to reason about.
  Date/Author: 2026-05-11 / Codex

- Decision: Use the existing `window.confirm` pattern for the first dirty-discard guard.
  Rationale: The options page already uses `window.confirm` for deletion. Reusing it avoids adding a modal component while still making the discard explicit and testable. A custom accessible modal can be a later UX improvement.
  Date/Author: 2026-05-11 / Codex

- Decision: Include unique list delete `aria-label` only if `App.tsx` is already being edited, and defer card button structure repair.
  Rationale: The delete label is a low-risk same-file accessibility fix. Restructuring the prompt card selection button is a broader F7 semantic/layout change and should not ride with the data-loss guard unless implementation tests reveal it is necessary.
  Date/Author: 2026-05-11 / Codex

- Decision: Preserve dirty input on selected-body failure only for dirty create mode.
  Rationale: In create mode, a failed attempt to load another prompt should not destroy a new unsaved prompt. In dirty edit mode, accepting the discard confirmation means the old edit may be discarded; if the selected prompt body then fails to load, the UI must be in the selected prompt's edit/error state so save is blocked and metadata-scoped delete remains possible.
  Date/Author: 2026-05-12 / Codex

- Decision: Defer external-delete-while-dirty behavior to a later product recovery path.
  Rationale: The requested F2 scope is body-load failure and explicit select/add/cancel UI transitions. When the underlying edited record disappears externally, preserving dirty fields would require a new recovery contract such as copy-to-new-prompt; inventing that in this patch would expand the scope beyond the plan.
  Date/Author: 2026-05-12 / Codex

## Outcomes & Retrospective

Implemented. `App` now uses `isDirty` to confirm dirty select/add/cancel transitions before calling the hook transition methods. Dismissing the confirmation leaves the current form and mode intact; accepting it proceeds. `usePromptEditor()` now blocks edit submission before validation when the selected prompt body is still loading, failed to load, or no active record is available, so disabled UI is not the only safety boundary.

Body-load failure is visible through the existing alert and an additional persistent status panel. Clean edit body-load failure leaves the selected prompt metadata in edit mode with save disabled and delete still available. Dirty create plus selected-body failure preserves the create draft. Dirty edit plus accepted discard and selected-body failure moves to the selected prompt's blocked edit/error state, preventing the stale dirty edit from being saved.

Validation results:

    pnpm typecheck
    # passed

    pnpm build:test
    # passed

    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts -g "dirty create draft|dirty edit draft|prompt-specific accessible names|dirty edit discard|disables save when selected prompt body did not load"
    # passed: 7/7

    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts
    # passed: 43/43 after rerunning with a fresh test-mode build

    pnpm build
    # passed

    pnpm test
    # expected current failure: 101 passed, 3 failed
    # failed tests are the known pre-fix F3/F4 regression tests:
    # - tests/e2e/slash-popup.spec.ts:814 keeps the popup busy and open while prompt insertion is pending
    # - tests/e2e/slash-popup.spec.ts:1777 does not open across contenteditable block boundaries
    # - tests/e2e/slash-popup.spec.ts:1844 does not treat IME keydown events as popup commands while composing

Host-level browser cleanup after Playwright found no remaining test-owned Chrome/Playwright processes with the project cleanup filter.

Residual risk: external deletion while the user has dirty edit input still follows the existing create-mode recovery path. That is intentionally deferred because it requires a product decision about preserving orphaned edits or copying them into a new prompt.

## Context and Orientation

The repository root is `/home/seok/code/promptit`. The options page entry is `src/options/main.tsx`, which renders `src/options/App.tsx`. `App` is the React component that wires UI buttons, form fields, list items, delete buttons, drag handlers, and alerts. The state owner is `src/options/usePromptEditor.ts`, a custom React hook that stores form state, load state, body-load state, save state, edit/create mode, dirty state, conflict state, and prompt metadata.

The storage facade is `src/prompt/storage.ts`. Options code calls functions such as `getPromptMetas()`, `getPromptRecord()`, `createPrompt()`, `updatePromptMeta()`, `updatePromptBody()`, and `deletePrompt()`. Those functions send typed runtime messages to the extension background service worker. Validation rules for prompt drafts live in `src/prompt/schema.ts`: titles must be 1 to 40 trimmed characters, content must be non-empty, and content must be at most 500 KiB in UTF-8 bytes.

Important terms:

Dirty means the user has changed the editor form since the last clean load or save. In this code, `updateField()` sets `isDirty` to true.

Body load means loading the full prompt body content for a selected prompt. The prompt list initially has metadata such as title and character count, but edit mode needs `getPromptRecord(id)`, which combines metadata with the body.

Body-load error means metadata was available but the body request failed. The current hook records this as `bodyLoadState: { status: "error", promptId, message }`.

Create mode means the editor is adding a new prompt. Edit mode means it is editing an existing prompt and carries expected timestamps for conflict detection.

Conflict state means another tab or background operation changed the prompt. The existing code uses `conflictState.status === "stale"` to show a warning.

Current F2 failure flow for body load:

1. The user clicks a prompt card in `App`.
2. `App` calls `selectPrompt(prompt)`.
3. `selectPrompt()` calls `loadPromptRecord(prompt)`.
4. `loadPromptRecord()` switches to edit mode, sets `activePrompt` to null, sets body load status to loading, and fills the form with metadata and empty content.
5. If `getPromptRecord(prompt.id)` fails, the hook sets `bodyLoadState` to error and shows an alert.
6. `App` disables fields only for saving or loading, not for body-load error.
7. The submit button is not disabled for body-load error.
8. A later submit can enter edit mode with no `activePrompt`, then recovery code may move to create mode and discard current form state.

Current F2 failure flow for dirty transitions:

1. The user types in the editor, so `updateField()` sets `isDirty` to true.
2. The user clicks another prompt card, the top "프롬프트 추가" button, or the edit "편집 취소" button.
3. `App` directly calls `selectPrompt(prompt)` or `startCreateMode()`.
4. The hook clears or replaces form state without asking whether to discard the dirty input.

## Plan of Work

Start with tests in `tests/e2e/options.spec.ts`. Reuse existing helpers such as `openOptionsPage()`, `patchRuntimeMessageFailure()`, `patchRuntimeMessageResponse()`, `getTitleInput()`, `getContentInput()`, `getPromptCard()`, and `getPromptSubmitButton()`.

Add the first failing test for body-load failure. Seed two prompt records. Open the options page. Patch `chrome.runtime.sendMessage` for `promptit/get-prompt-body` so selecting one target prompt fails body loading. Click that target prompt. Assert that the body-load error message is visible, the save button is disabled or blocked, and the underlying records from `extension.getPromptRecords()` are unchanged. To prove the hook guard and not only the disabled UI, the test may also call the form submit path programmatically with `requestSubmit()` and assert no record changes. This test should fail before the fix if the current UI allows save or transitions incorrectly.

Add dirty transition tests before production changes. Cover the minimum user flows that discard form state:

In create mode, type a title and body, click the top "프롬프트 추가" button, dismiss the confirmation dialog, and assert the editor remains in create mode with the typed title and body still present.

In edit mode, select a prompt, edit title and body, click another prompt card, dismiss the confirmation dialog, and assert the original dirty title and body are still present. Then repeat with the confirmation accepted and assert the selected target prompt loads.

In edit mode, select a prompt, edit title and body, click "편집 취소", dismiss the confirmation dialog, and assert the dirty title and body remain. Then repeat with the confirmation accepted and assert the editor returns to create mode with empty fields.

If these three flows make the test suite too slow or repetitive, merge the create add and edit cancel checks into one test while keeping prompt selection in its own test. Do not skip the body-load failure test.

Then implement the smallest production guards.

In `src/options/usePromptEditor.ts`, add a submit guard before `parsePromptForm()`. If the current mode is edit and either `activePromptRef.current` is null or `bodyLoadState` for that prompt is error/loading, do not validate or save. Instead, set an alert such as the existing body-load error message and keep the user in the current mode. This is the last line of defense even if a button is mistakenly enabled or a form submit is triggered programmatically.

In the same hook, expose enough transition information for `App` to guard dirty transitions. The lowest-risk path is to keep `startCreateMode()` and `selectPrompt()` unchanged as imperative transitions, and make `App` call them only through a small local confirmation wrapper. If implementation finds repeated logic awkward, add hook-level methods such as `canDiscardCurrentDraft()` or `confirmDiscardMessage`, but do not introduce a reducer in this slice.

In `src/options/App.tsx`, destructure `isDirty` from the hook. Add a local helper such as `confirmDiscardDirtyForm()` that returns true if the form is not dirty or if `window.confirm()` accepts discarding changes. Use this helper before:

The top "프롬프트 추가" button.

The edit "편집 취소" button.

Prompt card selection.

The confirmation message should be clear and specific, for example: "저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?" The exact Korean text can follow the existing UI tone, but tests should match only stable key words if possible.

In `App`, include `bodyLoadState.status === "error"` in `editorDisabled` or in a separate `editorBlocked` derived flag. The submit button must be disabled when body-load error is active. Prefer a derived name that makes the behavior explicit, such as `editorUnavailable = isEditorLoading || bodyLoadState.status === "error"`, then `editorDisabled = isSaving || editorUnavailable`. Keep delete behavior deliberate: deleting the active prompt after body-load failure may still be allowed if `activePromptMeta` exists and the user confirms deletion, but saving must not be allowed.

Render a persistent body-load error panel near the existing loading panel. The panel should use `role="alert"` or be covered by the existing alert banner. It must be visible after body-load failure so users know why editing/saving is blocked.

For same-file accessibility, update the list delete button accessible name from the generic "목록에서 프롬프트 삭제" to include the prompt title, such as `${prompt.title} 삭제`. Add a small test assertion using `getByRole('button', { name: /.../ })`. Do not restructure the prompt card button in this plan unless it becomes necessary to implement dirty transition tests. Record card structure as deferred F7 work.

After production guards pass focused tests, review whether external deletion while dirty should be included. The current `applyIncomingPrompts()` moves to create mode when the edited prompt disappears, regardless of dirty state. That is not one of the requested select/add/cancel UI transitions, and it may require a product decision because the underlying record no longer exists. If implementation time is limited, record this as a deferred risk. If included, the behavior should be: dirty fields remain visible with an alert explaining the prompt was deleted elsewhere and cannot be saved as the same prompt, or the UI offers an explicit "copy into new prompt" path. Do not invent this broader recovery inside the minimal F2 patch unless the user asks.

## Concrete Steps

Work from the repository root:

    cd /home/seok/code/promptit

Confirm the starting state:

    git status --short
    rg -n "bodyLoadState|isDirty|startCreateMode|selectPrompt|activePromptRef|prompt-card|목록에서 프롬프트 삭제" src/options tests/e2e/options.spec.ts

Milestone 1 adds the body-load failure test. Edit only `tests/e2e/options.spec.ts` for this milestone unless a narrow helper is unavoidable. Use the existing `patchRuntimeMessageFailure()` helper to make `promptit/get-prompt-body` fail. Run:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "body|본문|load|불러"

Acceptance for Milestone 1 is that the new test demonstrates the current bug before the fix or is documented as unexpectedly passing. The expected broken behavior is that body-load error does not fully block edit/save state.

Milestone 2 adds dirty transition tests. Edit `tests/e2e/options.spec.ts`. Use Playwright dialog handling with `page.once('dialog', async (dialog) => dialog.dismiss())` for the cancel path and `dialog.accept()` for the discard path. Run:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "dirty|discard|변경사항|편집 취소|프롬프트 추가"

Acceptance for Milestone 2 is that canceling the discard confirmation preserves typed values, and accepting it proceeds with the intended transition.

Milestone 3 implements body-load error guards. Edit `src/options/usePromptEditor.ts` and `src/options/App.tsx`. Add the submit guard in the hook and disable or block editing/saving in the UI when `bodyLoadState.status === "error"`. Run the focused body-load command again:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "body|본문|load|불러"

Acceptance for Milestone 3 is that selecting a prompt whose body fails to load leaves stored records unchanged, visibly reports the failure, and prevents save both through the visible button and through form submit.

Milestone 4 implements dirty transition guards. Edit `src/options/App.tsx` first. If needed, make a small hook API addition in `src/options/usePromptEditor.ts`, but keep the transition behavior simple. Run the focused dirty transition command again:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "dirty|discard|변경사항|편집 취소|프롬프트 추가"

Acceptance for Milestone 4 is that select, add, and cancel transitions never silently discard dirty input. They either preserve the current form when the user dismisses the confirmation or proceed only after the user accepts discarding changes.

Milestone 5 applies same-file accessibility cleanup. Change the list delete button in `src/options/App.tsx` to include the prompt title in its accessible name. Add or update a small assertion in `tests/e2e/options.spec.ts`. Run a focused command around delete and labels:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "delete|삭제|aria|label"

Acceptance for Milestone 5 is that each list delete button can be queried by an item-specific accessible name and existing delete confirmation behavior still works.

Milestone 6 runs full deterministic validation. If `EXECPLAN_01_TESTING_BASELINE.md` has already been implemented and `pnpm test` exists, run:

    pnpm test

If the default test script has not yet been implemented, run the current repository commands:

    pnpm typecheck
    pnpm build
    pnpm test:e2e

After Playwright runs, check host-level test browser cleanup:

    ps -ef | rg 'chrome-devtools-mcp|puppeteer_dev_chrome_profile|/opt/google/chrome/chrome'

Only stop processes that are clearly test-owned. Do not stop the user's normal browser.

## Validation and Acceptance

The F2 fix is accepted only when deterministic tests prove all of the following:

When a selected prompt body fails to load, the user sees a persistent error and cannot save an edit for that prompt.

Programmatic form submission after body-load failure also does not mutate storage.

Stored prompt records remain unchanged after body-load failure.

Dirty create-mode input is preserved when the user cancels the discard confirmation for the "프롬프트 추가" transition.

Dirty edit-mode input is preserved when the user cancels the discard confirmation for selecting another prompt.

Dirty edit-mode input is preserved when the user cancels the discard confirmation for "편집 취소".

Accepting the discard confirmation lets the selected transition proceed.

Existing initial load draft preservation still passes.

Existing stale save, stale body save, stale delete, validation, create/update, and delete tests still pass.

The list delete button has an item-specific accessible name if the same-file accessibility cleanup is included.

No full reducer or large state-machine refactor is required unless the small-guard implementation cannot satisfy these tests without scattered fragile conditions. If that happens, stop and update this ExecPlan before implementing a broader state model.

## Idempotence and Recovery

All planned tests are deterministic and can be rerun. `pnpm build:test` rebuilds the extension in test mode and Playwright uses a fresh persistent context per test fixture. If a test fails after a browser crash, close test-owned processes before retrying.

The dirty guard uses confirmation before destructive UI transitions. Dismissing the confirmation must leave all form values, mode, active prompt, and alerts as they were before the attempted transition. Accepting the confirmation may clear or replace form state according to the requested transition.

The body-load error guard must not destroy metadata. Users should still see which prompt failed to load. Saving is blocked because the full body is unknown, not because the prompt disappeared. Delete can remain available if the prompt metadata is present and the user confirms deletion.

If later work introduces a custom modal instead of `window.confirm`, keep the same observable behavior and update the tests to interact with the modal by role and accessible name. Do not change the product contract that dirty data is never silently discarded.

## Artifacts and Notes

Planning-session evidence:

    src/options/usePromptEditor.ts owns bodyLoadState, isDirty, mode, activePrompt, form, and submit().
    loadPromptRecord() sets mode to edit, activePrompt to null, bodyLoadState to loading, and form content to empty before getPromptRecord().
    loadPromptRecord() catch sets bodyLoadState to error and alertMessage only.
    isEditorLoading is bodyLoadState.status === 'loading'; bodyLoadState.status === 'error' is not included.
    App currently computes editorDisabled as isSaving || isEditorLoading.
    App currently disables submit for editorDisabled || loadState.status === 'error', not body-load error.
    App currently calls selectPrompt(prompt) and startCreateMode directly.
    updateField() sets isDirty true, but App does not use isDirty.
    tests/e2e/options.spec.ts has patchRuntimeMessageFailure() and patchRuntimeMessageResponse() helpers that can simulate runtime failures.
    tests/e2e/options.spec.ts already verifies initial prompt load preserves create draft while list loading resolves.
    tests/e2e/options.spec.ts already verifies stale save/body/delete conflicts and save/delete failure alerts.

Useful focused commands:

    rg -n "bodyLoadState|isDirty|startCreateMode|selectPrompt|activePromptRef|prompt-card|목록에서 프롬프트 삭제" src/options tests/e2e/options.spec.ts
    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "body|본문|load|불러"
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "dirty|discard|변경사항|편집 취소|프롬프트 추가"
    pnpm typecheck
    pnpm build
    pnpm test:e2e

## Interfaces and Dependencies

Use only existing dependencies: React, TypeScript, Vite, and Playwright. Do not add a form library, modal library, state-machine library, or test framework.

In `src/options/usePromptEditor.ts`, keep the existing public hook surface unless a small addition clearly reduces duplication. The hook currently returns:

    isDirty: boolean
    bodyLoadState: PromptEditorBodyLoadState
    isEditorLoading: boolean
    startCreateMode: () => void
    selectPrompt: (prompt: PromptMeta) => Promise<void>
    submit: () => Promise<void>

The implementation may add a derived field such as:

    isEditorUnavailable: boolean

or a helper such as:

    canSubmitCurrentEditor: boolean

Only add these if they make `App.tsx` simpler and keep behavior obvious. Do not replace the hook with a reducer in this slice.

In `src/options/App.tsx`, add a local confirmation helper. A simple shape is:

    function confirmDiscardDirtyForm(): boolean {
      return !isDirty || window.confirm('저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?');
    }

Use it before the three destructive transitions: top add, edit cancel, and prompt card select. Keep delete's existing separate confirmation.

For body-load error, derive a UI block flag from `bodyLoadState.status === "error"` and use it in field and submit disabled behavior. The submit guard in `usePromptEditor.ts` is still required, because disabled buttons do not protect against programmatic submit.

For tests, use existing Playwright helpers in `tests/e2e/options.spec.ts`. Avoid adding new helper files. If a helper is useful, keep it inside `options.spec.ts` near existing helper functions.

## Change Notes

- 2026-05-11 / Codex: Initial ExecPlan created from the 7/7 triage and read-only options/storage inspection. The plan prioritizes F2 body-load error save blocking and dirty select/add/cancel guards, explicitly avoids a full state-machine refactor for the first patch, includes only the small delete accessible-name fix, and defers card button structure and external-delete dirty recovery unless scope expands.
