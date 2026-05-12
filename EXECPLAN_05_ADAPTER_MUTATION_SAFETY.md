# Harden Adapter Mutation and Trigger Boundaries

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document according to `PLANS.md` in the repository root.

## Purpose / Big Picture

Promptit opens a popup when the user types `/ ` in a supported AI site editor, then later replaces that exact trigger with a saved prompt or removes it during cleanup. The F4 triage finding is that the contenteditable adapter can mutate editor DOM from a saved range even after focus or live selection has moved, and trigger detection can flatten contenteditable structure so `/` before a line or block boundary and a space after that boundary are treated as one `/ ` trigger.

After this work, Promptit should mutate contenteditable editors only when the original trigger range is still present and the current live selection still belongs to the same focused editor at the expected trigger endpoint. Unfocused or invalid selection states should fail safely with the existing adapter error path instead of directly deleting or inserting DOM. Trigger detection should remain strict to one visual line or block segment, while normal textarea insertion and normal contenteditable insertion continue to work.

## Progress

- [x] (2026-05-11 21:07 KST) Read `PLANS.md` and confirmed the required ExecPlan structure.
- [x] (2026-05-11 21:08 KST) Inspected `.codex/agents` and delegated read-only planning support to the project `code-mapper` and `code-reviewer` agents.
- [x] (2026-05-11 21:15 KST) Inspected `src/adapters/base.ts`, `src/adapters/chatgpt.ts`, `src/adapters/editable.ts`, `src/adapters/gemini.ts`, `src/adapters/registry.ts`, `src/content/controller.ts`, existing e2e tests, and contenteditable fixtures.
- [x] (2026-05-11 21:18 KST) Incorporated subagent findings into this plan without making implementation changes.
- [x] (2026-05-12 15:19 KST) Re-read this ExecPlan end to end, re-inspected relevant adapter/controller/test files, and delegated read-only path mapping plus spec-only regression coverage.
- [x] (2026-05-12 15:25 KST) Added/reused focused Range/Selection and boundary regression tests in `tests/e2e/slash-popup.spec.ts`.
- [x] (2026-05-12 15:26 KST) Implemented shared contenteditable hard-boundary rejection and focused live-selection mutation preflight in `src/adapters/editable.ts`; added the cleanup focus seam in `src/content/controller.ts`.
- [x] (2026-05-12 15:34 KST) Ran typecheck, test build, focused F4 Playwright grep, full slash-popup spec, Gemini spec, production build, diff check, and host-level browser cleanup check.
- [x] (2026-05-12 15:35 KST) Completed implementation self-review and requested scoped code-reviewer review.
- [x] (2026-05-12 15:40 KST) Added a non-collapsed live-selection mutation regression test to close the reviewer's low coverage gap, then reran focused and full slash-popup validation.

## Surprises & Discoveries

- Observation: textarea trigger and mutation paths already have relatively strong local checks.
  Evidence: `src/adapters/chatgpt.ts` lines 180-207 require a collapsed textarea selection ending with exact `/ `; lines 98-131 verify connection, bounds, and current expected text before `setRangeText()`.

- Observation: contenteditable trigger creation already requires a collapsed range contained by the input, but it does not require actual focus ownership.
  Evidence: `src/adapters/editable.ts` lines 17-35 use `window.getSelection()`, range count, collapsed state, and `input.contains(...)`, but do not check `document.activeElement`.

- Observation: contenteditable trigger detection reads all text before the caret from the root and accepts `.endsWith('/ ')`.
  Evidence: `src/adapters/editable.ts` lines 37-42 select root contents up to the caret; lines 355-381 normalize the entire pre-caret text and accept `/ ` even if the two characters are separated by structure that contributes no `textContent`, such as `<br>`.

- Observation: backward trigger range resolution walks previous text nodes across the whole contenteditable root.
  Evidence: `src/adapters/editable.ts` lines 297-341 step through previous text nodes without a hard stop for `<br>` or block elements.

- Observation: contenteditable mutation validates the saved node paths and expected trigger text, but can still mutate when the editor is unfocused or the live selection moved elsewhere.
  Evidence: `src/adapters/editable.ts` lines 411-449 resolve the stored range and compare expected text; lines 468-505 use `execCommand` only if focused, then fall back to `range.deleteContents()` and `insertNode()` when `execCommand` is not used.

- Observation: the content controller calls adapter mutation from two places. Insert focuses first; cleanup does not.
  Evidence: `src/content/controller.ts` lines 563-570 focus then call `adapter.insertPrompt()`, while lines 764-773 call `adapter.removeTriggerText()` during cleanup without first focusing the input.

- Observation: existing tests cover many positive paths but not the F4 negative boundary. There is coverage for contenteditable insertion, nested child input events, multiline break preservation, NBSP trigger, non-collapsed selection rejection, textarea fallback, and stale textarea mutation failure.
  Evidence: `tests/e2e/slash-popup.spec.ts` lines 565-740, 1139-1200, and 1566-1688.

- Observation: The F4 block-boundary regression added in the baseline was still failing before this plan's source fix and now passes.
  Evidence: Before ExecPlan 05, full `slash-popup.spec.ts` failed only `does not open across contenteditable block boundaries`; after the shared editable fix, the full spec passed 55/55.

- Observation: A trigger fully after an existing `<br>` must still be valid, while a slash before `<br>` and a space after `<br>` must be rejected.
  Evidence: `preserves the multiline break when inserting and cleaning up a prompt from contenteditable` remains passing, and `does not open across a contenteditable br line boundary` now passes.

- Observation: The safe mutation preflight must run after the saved trigger range is resolved and expected text is verified, but before selecting the saved range or using the direct DOM fallback.
  Evidence: `replaceContenteditableRange()` now returns a mutation failure before `selection.removeAllRanges()`, `execCommand`, `deleteContents()`, or `insertNode()` when the live selection is outside the editor or not at the trigger endpoint.

- Observation: The test runner command must use `pnpm exec playwright`; direct `playwright ...` is not on `PATH` in this workspace.
  Evidence: The spec-only test subagent saw direct `playwright` fail, then the same focused grep passed through `pnpm exec playwright`.

- Observation: Review found no blocking runtime issues, but identified missing direct coverage for non-collapsed live selection after the popup opens.
  Evidence: Added `blocks contenteditable insertion when the live selection is not collapsed`; the focused F4 grep passed 6/6 and the full slash-popup spec passed 56/56.

## Decision Log

- Decision: Keep the F4 runtime fix in shared contenteditable helpers, not ChatGPT-only adapter code.
  Rationale: ChatGPT and Gemini both delegate contenteditable trigger and mutation to `src/adapters/editable.ts`. Fixing the shared layer gives one policy for focus, selection, Range snapshots, and line-boundary behavior.
  Date/Author: 2026-05-11 / Codex

- Decision: Preserve textarea behavior unless a new test proves it is affected.
  Rationale: The F4 risks come from DOM Range and contenteditable framework-state mismatch. The textarea path already uses offsets and `setRangeText()` with expected-text checks.
  Date/Author: 2026-05-11 / Codex

- Decision: Require live focused selection compatibility before contenteditable mutation.
  Rationale: A saved node-path snapshot can remain valid after the user focus or caret has moved. Mutation should proceed only when the editor is still focused and the live collapsed selection is still at the saved trigger endpoint.
  Date/Author: 2026-05-11 / Codex

- Decision: Treat ChatGPT selector brittleness as observe/defer for this plan.
  Rationale: Selector drift usually makes the extension fail closed by not finding a composer. The urgent F4 risk is wrong mutation after a trigger context exists. Broadening selectors in the same patch would increase mutation surface area and blur the safety validation.
  Date/Author: 2026-05-11 / Codex

- Decision: Keep direct DOM fallback only behind the same focused, same-root, correct-selection preflight for this patch.
  Rationale: Removing the fallback entirely may be viable later, but the smallest F4 safety step is to prevent unfocused or invalid-selection DOM mutation. Existing fixture behavior should continue when the editor is focused and the trigger range is valid.
  Date/Author: 2026-05-11 / Codex

- Decision: Detect hard boundaries by inspecting the accepted candidate trigger `Range` with `cloneContents()`.
  Rationale: This keeps the text traversal behavior intact for inline wrappers and NBSP normalization, but rejects candidates whose actual DOM range crosses `<br>` or block-like elements.
  Date/Author: 2026-05-12 / Codex

- Decision: Reuse existing adapter mutation failure reasons instead of extending `AdapterMutationFailureReason`.
  Rationale: The existing `invalid-context` and `stale-context` reasons already express missing/non-collapsed/outside selection and changed live endpoint. No public adapter contract change is needed.
  Date/Author: 2026-05-12 / Codex

- Decision: Focus the active input before cleanup, but keep the adapter preflight authoritative.
  Rationale: Normal Escape/Backspace/copy cleanup should still use the editor-focused path when the saved caret remains valid. If focus cannot restore a collapsed live selection at the saved trigger endpoint, mutation still fails safely.
  Date/Author: 2026-05-12 / Codex

## Outcomes & Retrospective

Implemented the F4 adapter mutation and trigger-boundary safety patch.

Runtime changes:

- `src/adapters/editable.ts` now rejects contenteditable trigger candidates whose resolved trigger `Range` crosses hard boundaries such as `<br>` and common block elements.
- Inline wrappers remain valid because the boundary check is structural and does not treat inline elements as hard stops.
- `replaceContenteditableRange()` now requires a focused connected contenteditable input, exactly one collapsed live selection inside that input, and a live selection endpoint equal to the saved trigger range endpoint before any `execCommand` or direct DOM fallback mutation.
- `src/content/controller.ts` now focuses a connected active input before cleanup mutation, while leaving the adapter preflight as the final safety gate.

Test changes:

- Added `blocks contenteditable insertion when the live selection moved outside the composer`.
- Added `blocks contenteditable insertion when the live selection is not collapsed`.
- Added `keeps the trigger when same-root cleanup selection is not at the trigger endpoint`.
- Added `does not open across a contenteditable br line boundary`.
- Added `opens across inline wrappers within one contenteditable line`.
- Reused the existing `does not open across contenteditable block boundaries` regression as already covered by the baseline.

Validation:

- `pnpm typecheck`: passed.
- `pnpm build:test`: passed.
- `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts -g "live selection|same-root cleanup|br line boundary|block boundaries|inline wrappers"`: passed, 6/6 after adding the non-collapsed live-selection case.
- `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts -g "block boundaries|multiline break|non-breaking-space|selection is not collapsed|textarea fallback|trigger cleanup fails|prompt insertion fails"`: passed, 8/8.
- `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts`: passed, 56/56.
- `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/gemini-slash-popup.spec.ts`: passed, 8/8.
- `pnpm build`: passed.
- `git diff --check -- src/adapters/editable.ts src/content/controller.ts tests/e2e/slash-popup.spec.ts EXECPLAN_05_ADAPTER_MUTATION_SAFETY.md`: passed before and after this documentation update.
- Host-level `ps -ef` cleanup check after Playwright showed no lingering `/opt/google/chrome/chrome` or `promptit-playwright` browser process. Existing `chrome-devtools-mcp` processes were present and unrelated.

Review:

- A read-only mapping subagent confirmed the minimal source seams in `src/adapters/editable.ts` and the cleanup focus seam in `src/content/controller.ts`.
- A spec-only test subagent added the focused F4 tests, validated them with `pnpm exec playwright`, and self-reviewed the test changes.
- A scoped code-reviewer review found no blocking issues. Its only low finding was missing direct coverage for cleared or non-collapsed live selection; the non-collapsed branch now has regression coverage.

Residual risks:

- The hard-boundary tag list covers common block-like elements and `<br>`, but it is still a heuristic. Future host-specific block structures may need additional tags if evidence appears.
- Direct DOM fallback remains available for focused, endpoint-valid contenteditable mutation. Removing it entirely is deferred until there is live-host evidence that framework-backed editors can rely on a stricter path.
- ChatGPT selector brittleness remains classified as observe/defer and was not changed in this plan.

## Context and Orientation

This repository is a Chrome extension. The content script runs on supported AI sites, watches the active editor, and opens a popup after the user types the trigger sequence `/ `. A site adapter hides the differences between textarea editors and contenteditable editors.

The adapter contract is in `src/adapters/base.ts`. A `TriggerContext` is the saved description of where the trigger text was found. For textarea, it is numeric `start` and `end` offsets plus `expectedText`. For contenteditable, it is two node-path snapshots plus `expectedText`. A node path is an array of child indexes from the contenteditable root to a boundary node; it lets the adapter find the same DOM node later if the DOM has not changed.

`src/adapters/chatgpt.ts` detects ChatGPT-like editors. It handles textarea directly in `replaceTextareaRange()` and delegates contenteditable trigger capture and mutation to `src/adapters/editable.ts`. `src/adapters/gemini.ts` also delegates to the same contenteditable helpers after filtering out Gemini's hidden `.ql-clipboard`.

`src/content/controller.ts` owns the runtime flow. It calls `adapter.createTriggerContext(input)` in `resolveTriggerCheck()` before opening the popup. Later, `handleSelection()` calls `adapter.insertPrompt(activeInput, content, triggerContext)` to replace `/ ` with prompt content, and `closePopup()` calls `adapter.removeTriggerText(activeInput, triggerContext)` to clean `/ ` during Escape, Backspace, copy, blur, resize, or outside-click cleanup.

A Range is the browser DOM object representing a span between two boundary points. A Selection is the browser's current caret or selected text, available from `window.getSelection()`. In this plan, "same-root selection" means the live selection range, the saved trigger range, and the target contenteditable editor all belong to the same contenteditable root element. It is not enough for the saved trigger nodes still to exist; the live caret must still be in that same editor at the saved trigger endpoint before mutation.

A hard line or block boundary is DOM structure that should break trigger scanning. At minimum this includes `<br>` and block-like elements such as `p`, `div`, `li`, `pre`, `blockquote`, and headings. Inline wrappers such as `span`, `strong`, and `em` should not be hard boundaries by themselves.

## Existing Runtime Flow

The startup path begins in `src/content/content-script.ts`, which calls `bootstrapContentScript()` through `src/content/main.ts`. `bootstrapContentScript()` in `src/content/controller.ts` resolves the adapter using `resolveAdapterForUrl()`, creates a `PopupSessionState`, creates `PromptPopup`, subscribes to prompt metadata changes, and registers document/window listeners.

The trigger path starts when an `input` or `compositionend` event reaches `registerDocumentListeners()` in `src/content/controller.ts`. The controller calls `adapter.resolveTargetInput(event.target)` to find the supported editor, then `scheduleTriggerCheck()`, which calls `armTrigger()` from `src/content/trigger.ts`. After a 100 ms debounce, `resolveTriggerCheck()` runs. It aborts if the session is stale, composing, disconnected, not focused, or no longer armed. It then calls `adapter.createTriggerContext(input)`.

For ChatGPT textarea editors, `ChatGPTAdapter.createTriggerContext()` checks that textarea selection is collapsed, at least two characters from the start, and that the two characters before the caret are exactly `/ `. For contenteditable editors, ChatGPT and Gemini call `createContenteditableTriggerContext(input, setTriggerDebug?)` in `src/adapters/editable.ts`.

`createContenteditableTriggerContext()` currently gets the first browser selection range, requires it to be collapsed and contained by the input, reads all text before the caret, normalizes NBSP to ordinary space, and accepts the trigger when the normalized text ends with `/ `. It then walks backward two text characters to build a DOM Range for the trigger, verifies the Range text normalizes to `/ `, snapshots the start and end boundaries, and returns a contenteditable trigger context.

When the popup is open, selection actions eventually call `replaceContenteditableRange(input, triggerContext, text)`. That function resolves the stored node paths, verifies the current trigger Range still has the expected text, clones the Range, gets `window.getSelection()`, and if `document.activeElement === input`, sets selection to the trigger Range and tries `document.execCommand('insertText', false, text)`. If that is not used, it directly calls `range.deleteContents()` and optionally `range.insertNode(textNode)`, then dispatches an input event.

## Plan of Work

Start with tests because F4 is about observable safety around DOM Range and Selection behavior. Use `tests/e2e/slash-popup.spec.ts` as the primary test file. It already has helpers for contenteditable setup, input dispatch, composer DOM snapshots, popup assertions, toast assertions, and textarea fallback. Keep fixture changes out of the first attempt; construct edge-case DOM inside the test with `page.evaluate()` so the plan stays localized.

Add a helper in `tests/e2e/slash-popup.spec.ts` that can set arbitrary contenteditable child nodes and collapse the selection at a named text node. Reuse the existing style of `setMultilineContenteditableComposerState()`, but allow cases such as `Text("/")`, `<br>`, `Text(" ")`, and block elements with text nodes inside. Add another helper that moves or clears the live browser selection after the popup is already open.

Add a negative trigger test for a line boundary. Prepare the contenteditable root as a slash text node, a `<br>`, and a space text node. Put the caret after the space text node, dispatch an `input` event from the composer, wait longer than the trigger debounce, and assert that `[data-testid="promptit-popup"]` is hidden. Also assert the test debug attribute is not `contenteditable-match`; if the implementation adds a more specific value such as `contenteditable-boundary-crossed`, assert that value.

Add a negative trigger test for block boundaries. Prepare DOM such as `<p>/</p><p> </p>` or `<div>/</div><div> </div>` inside the contenteditable root, put the caret after the second block's space, dispatch input, and assert the popup stays closed. Keep this test compact; one block-pair case is enough if the boundary helper covers the list of block-like elements.

Keep a positive boundary control. The existing test `preserves the multiline break when inserting and cleaning up a prompt from contenteditable` proves `<br>` followed by a same-line text node containing `/\u00A0` still opens and preserves the `<br>`. Keep it in the focused validation run. If a new helper makes it clearer, add a positive inline-split case where `/` and the space are in adjacent inline spans within the same visual line; that should still open.

Add a contenteditable insertion preflight test. Open the popup normally in the contenteditable fixture, then move the live selection outside the composer or clear the selection before pressing Enter. The expected behavior after implementation is that the popup remains visible or reopens through the existing error path, the composer still contains `/ `, the prompt body is not inserted, and the toast reports the existing adapter insertion failure message. This proves an unfocused or outside-root selection cannot cause direct DOM mutation.

Add a same-root wrong-selection cleanup test. Open the popup normally, then set a collapsed selection at the start of the same composer instead of at the saved trigger endpoint, press Escape, and assert that `/ ` is still present and the cleanup failure toast appears. This proves "same root" alone is not enough; the live selection must be at the trigger endpoint.

Add a stale contenteditable trigger-text test if it can stay short. Open the popup, replace the contenteditable DOM without dispatching an input event so the session still has the old trigger context, press Enter, and assert no partial DOM corruption. There is already a textarea stale mutation test named `shows an error toast when prompt insertion fails`; this new test covers the same safety contract for contenteditable Range snapshots.

Then implement the runtime changes in `src/adapters/editable.ts`. Add a focused live selection helper for contenteditable mutation. Its contract should be: return a cloned collapsed Range only when the input is connected, the input itself or a descendant is the `document.activeElement`, `window.getSelection()` exists, exactly one selection range exists, the range is collapsed, and both range boundaries are inside the input. If any condition fails, return an adapter mutation failure such as `invalid-context` or `stale-context`.

Add a boundary comparison helper. It should compare two boundary points by exact `node` identity and exact `offset`. After `resolveContenteditableRange()` returns the saved trigger Range, `replaceContenteditableRange()` should require the live collapsed selection start and end to equal the resolved Range end boundary before any selection replacement, `execCommand`, `deleteContents()`, or `insertNode()`. If the selection is in the same editor but at the wrong offset, fail.

Keep the existing saved-context checks in place. Node-path resolution, node-kind matching, offset bounds, `Range.setStart/setEnd`, and expected trigger text comparison should not be weakened. The new live-selection preflight is an additional guard, not a replacement.

Add boundary-aware trigger detection in `src/adapters/editable.ts`. The minimal robust option is to inspect the candidate `triggerRange` before accepting it and reject it if its cloned contents contain a hard boundary element. This catches slash-before-`<br>` and slash-in-one-block/space-in-next-block cases that currently disappear into `textContent`. If a helper based on walking previous text nodes is clearer, it may instead stop backward traversal when crossing a hard boundary; either implementation must keep inline wrappers valid and block hard boundaries invalid.

Define the hard-boundary helper locally in `editable.ts`. It should treat `HTMLBRElement` as a hard boundary and treat common block-like tags as hard boundaries when they are inside the candidate trigger range. Do not treat the contenteditable root itself as a boundary for a valid trigger at the beginning of the root. Do not treat inline elements as boundaries.

In `src/content/controller.ts`, make cleanup preserve safe editor transaction behavior without allowing blind mutation. Before calling `adapter.removeTriggerText(activeInput, triggerContext)` in `closePopup()`, call `adapter.focusInput(activeInput)` only if `activeInput.isConnected`. The adapter still must enforce the live selection preflight. This helps Escape, Backspace, copy, and other cleanup paths use the editor-focused path when the saved caret is still valid, while still blocking mutation when focus or selection is invalid.

Do not broaden ChatGPT selectors in this plan. Add a note in the implementation self-review that selector brittleness remains an observation item. If a live ChatGPT smoke later shows selector drift, create a separate plan with its own safety tests.

## Concrete Steps

All implementation commands should run from the repository root:

    cd /home/seok/code/promptit

Before editing, inspect the worktree:

    git status --short

Add tests first in:

    tests/e2e/slash-popup.spec.ts

The new tests should cover line-boundary rejection, block-boundary rejection, contenteditable insertion blocked after live selection leaves the composer, same-root wrong-selection cleanup blocked, and optionally stale contenteditable trigger text.

Run a focused pre-fix test command and record whether each new test fails as expected or acts as characterization:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/slash-popup.spec.ts --grep "boundary|selection|stale|contenteditable|textarea fallback|non-breaking-space"

Implement the adapter safety changes in:

    src/adapters/editable.ts
    src/content/controller.ts

Do not edit `src/adapters/chatgpt.ts` unless the implementation discovers a concrete textarea regression or a missing call-site type caused by the shared helper changes. Do not edit selectors for this plan.

Run TypeScript validation:

    pnpm run typecheck

Run the full affected ChatGPT-style popup spec:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/slash-popup.spec.ts

Run Gemini integration coverage because Gemini shares `src/adapters/editable.ts`:

    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/gemini-slash-popup.spec.ts

If full specs are blocked by environment issues, record the exact command, first relevant error, and which focused grep tests passed. Do not declare completion from typecheck alone.

## Validation and Acceptance

The implementation is accepted when these observable behaviors hold.

Normal textarea behavior is unchanged. In the textarea fixture, typing `/ ` opens the popup, pressing Enter replaces only the trigger with the active prompt, and stale expected text still fails through the existing adapter error path.

Normal contenteditable behavior is unchanged. In the ChatGPT-like contenteditable fixture, typing `/ ` opens the popup, pressing Enter replaces only the trigger with prompt content, Escape/Backspace cleanup removes only the trigger when the caret is still valid, copy cleanup removes the trigger, nested child input events still open and insert, and the NBSP trigger `/\u00A0` still opens.

Multiline contenteditable behavior remains correct. A trigger that is fully on the current line after an existing `<br>` still opens, inserts, and cleans while preserving the `<br>` structure. A slash before a `<br>` and a space after that `<br>` does not open.

Block-boundary trigger behavior is strict. A slash in one block and a space/caret in the following block does not open the popup. Inline wrappers within the same visual line still allow `/ `.

Selection preflight behavior is strict. If the live selection is missing, not collapsed, outside the target contenteditable root, in another root, or inside the same root but not at the saved trigger endpoint, contenteditable mutation returns a failure and does not delete or insert DOM.

Unfocused contenteditable mutation is blocked. If focus has moved away and focusing cannot restore a valid same-root collapsed selection at the saved trigger endpoint, no direct `Range.deleteContents()` or `insertNode()` mutation occurs.

Gemini behavior remains intact. The Gemini fixture still opens from the Gemini composer, inserts prompt content without host submit, cleans trigger text on Escape/Backspace, reads latest body on selection, and ignores `.ql-clipboard` edits.

Validation commands should pass:

    pnpm run typecheck
    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/slash-popup.spec.ts
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/gemini-slash-popup.spec.ts

## Idempotence and Recovery

The change should be localized and repeatable. Tests are additive. Runtime edits should stay in `src/adapters/editable.ts` and the small cleanup focus point in `src/content/controller.ts`.

If a new live-selection guard is too strict and breaks a positive contenteditable test, inspect the failing selection state before loosening the guard. It is acceptable to allow `document.activeElement` to be the input or a focused descendant. It is not acceptable to remove the requirement that the live collapsed selection is inside the same input and at the saved trigger endpoint.

If boundary detection rejects valid inline cases, refine the boundary predicate rather than reverting to full-root `textContent`. Inline `span`, `strong`, and `em` should not be treated as hard boundaries. `<br>` and block-like containers inside the candidate trigger range should remain hard stops.

If cleanup after outside click or blur now shows an error instead of silently mutating, prefer the safer failure unless product requirements explicitly decide otherwise. Do not reintroduce unfocused direct DOM mutation to recover the old cleanup behavior.

If Gemini fails after shared helper changes, confirm whether the live selection is inside the Gemini `.ql-editor` root and at the trigger endpoint. Do not special-case Gemini unless a fixture proves its editor uses a different but safe focus/selection pattern.

## Interfaces and Dependencies

Use existing TypeScript, DOM Range/Selection APIs, Playwright, and Chrome extension APIs only. Do not add a new dependency or a new test framework.

At the end of implementation, `src/adapters/editable.ts` should have helper contracts equivalent to:

    getFocusedCollapsedSelectionRange(input: HTMLElement): Range | AdapterMutationResult

This helper returns a cloned live selection Range only when the contenteditable input is connected, focused, same-root, and collapsed.

    areBoundaryPointsEqual(leftNode: Node, leftOffset: number, rightNode: Node, rightOffset: number): boolean

This helper compares exact DOM boundary identity.

    rangeContainsHardBoundary(range: Range, root: HTMLElement): boolean

This helper detects whether the candidate trigger Range crosses `<br>` or block-like structure within the contenteditable root.

The implementation may choose different names, but the contracts must remain. `replaceContenteditableRange()` must resolve the saved trigger range, verify expected text, verify focused live selection at the resolved trigger endpoint, and only then attempt `execCommand` or the existing focused fallback. `createContenteditableTriggerContext()` must reject trigger ranges that cross hard line or block boundaries.

No public adapter interface change is required. `BaseAdapter`, `TriggerContext`, and `AdapterMutationResult` can remain compatible. If an implementation finds a need to add a new failure reason, it must update `src/adapters/base.ts` and verify `ensureAdapterMutation()` still reports meaningful errors, but the first choice should be to reuse `invalid-context` or `stale-context`.

## Regressions to Guard Against

Do not break textarea fallback insertion. Do not break contenteditable normal insertion. Do not break contenteditable cleanup when the trigger is valid and focused. Do not break nested inline contenteditable triggers. Do not break NBSP trigger normalization. Do not break multiline preservation when the trigger itself is on one line. Do not break Gemini `.ql-clipboard` exclusion. Do not broaden ChatGPT selectors in this patch. Do not replace expected-text stale checks with focus checks; both are needed.

## Selector Brittleness Classification

ChatGPT selector brittleness is an observation item for this ExecPlan, not an urgent fix. Current selectors include textarea, `role="textbox"` contenteditable, Lexical-like `data-lexical-editor`, and ProseMirror-like class forms in `src/adapters/chatgpt.ts`. If those selectors drift, Promptit is more likely to fail closed by not activating. By contrast, F4 can mutate the wrong DOM after activation, so F4 has higher immediate safety priority.

Track selector brittleness separately with live smoke evidence. A future selector plan should include explicit tests that prove any broader selector does not match unrelated contenteditable regions and does not increase mutation surface.

## Residual Risks and Deferred Refactors

This plan does not fully remove direct DOM fallback for focused, valid contenteditable mutation. It only blocks the unsafe unfocused and invalid-selection cases. A later stricter plan may decide to require `execCommand` success for framework-backed editors, but that should be based on fixture and live-host evidence.

This plan does not redesign `TriggerContext` to store root identity or DOM version. The passed `input` root and existing node paths remain the root contract. If future bugs show same-root token drift across replaced editor roots, add a root identity or context generation field in a separate plan.

This plan does not solve F3 stale async continuation safety. If F3 has not yet been implemented, some delayed selection scenarios may still need F3's action-token guard. F4's adapter preflight still adds local protection because mutation itself refuses invalid focus/selection.

This plan does not add unit tests around `editable.ts`. The repository currently relies on Playwright extension fixtures for this behavior. If Range/Selection edge cases become too numerous for e2e, add a separate testing-baseline plan for DOM-level unit tests rather than mixing a new framework into this patch.

## Artifacts and Notes

Read-only planning evidence:

    git status --short
    ?? .codex/
    ?? EXECPLAN_01_TESTING_BASELINE.md
    ?? EXECPLAN_02_STORAGE_DATA_SAFETY.md
    ?? EXECPLAN_03_OPTIONS_DATA_LOSS_GUARD.md
    ?? EXECPLAN_04_CONTENT_STATE_SAFETY.md
    ?? __Testing_Reference.md
    ?? __promptit_prd_tech_spec.md
    ?? output/

Source evidence:

    src/adapters/base.ts:1-36
    Adapter trigger context and mutation result contracts.

    src/adapters/chatgpt.ts:98-131
    Textarea mutation validates connection, offsets, and expected text before using setRangeText.

    src/adapters/chatgpt.ts:180-214
    ChatGPT trigger context dispatches textarea directly and contenteditable through editable.ts.

    src/adapters/editable.ts:17-35
    Current contenteditable selection capture requires collapsed contained Range but not active focus.

    src/adapters/editable.ts:37-42 and 355-381
    Current trigger detection flattens pre-caret text and can ignore visual boundaries.

    src/adapters/editable.ts:297-341
    Backward text traversal has no block or line boundary stop.

    src/adapters/editable.ts:411-511
    Current contenteditable mutation validates saved Range text but can fall back to direct DOM mutation without focused live selection.

    src/content/controller.ts:563-570
    Insert path focuses active input before contenteditable mutation.

    src/content/controller.ts:764-773
    Cleanup path calls removeTriggerText without first focusing active input.

    tests/e2e/slash-popup.spec.ts:1158-1200
    Existing positive multiline contenteditable test should stay passing.

    tests/e2e/slash-popup.spec.ts:1566-1688
    Existing non-collapsed selection, composition, NBSP, and textarea fallback tests should stay passing.

Subagent planning support:

    code-mapper mapped the adapter/content call path and identified missing preflights around actual focus, live selection, same-root mutation, and boundary-aware trigger scanning.
    code-reviewer recommended tests first, shared editable helpers, no textarea changes unless proven necessary, one controller cleanup focus point, and selector brittleness as deferred observation.

Change note:

    2026-05-11 / Codex: Initial ExecPlan created from the F4 triage and read-only inspection of adapter/content flows, tests, fixtures, and project-specific subagent feedback. The plan prioritizes contenteditable Range/Selection preflight and block-boundary trigger safety while preserving textarea and normal contenteditable behavior.
