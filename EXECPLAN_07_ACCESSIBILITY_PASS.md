# Improve Popup and Options Accessibility Without Redesign

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document according to `PLANS.md` in the repository root.

## Purpose / Big Picture

Promptit has two user-visible surfaces that need a focused accessibility pass after the triage findings: the slash-trigger popup injected into AI sites, and the extension options page used to manage prompts. The popup already works with mouse and custom keyboard shortcuts, but assistive technology users do not get enough semantic feedback for active popup items, toast messages, or busy state. The options page already has some live regions and form semantics, but repeated delete buttons are not uniquely named and a prompt card selection button contains complex block markup that should be repaired.

After this work, keyboard users should still be able to type `/ `, use Arrow keys, Enter, Escape, Backspace, mouse hover, and mouse click exactly as before, while screen reader users can hear toast outcomes and active popup movement and can distinguish prompt list actions by name. The options page should expose valid list item and button semantics without a visual redesign. F6, the popup minimum-width issue, is intentionally excluded from this plan and should be handled as a separate simple layout task.

## Progress

- [x] (2026-05-11 22:13 KST) Read `PLANS.md` and confirmed the required ExecPlan structure.
- [x] (2026-05-11 22:13 KST) Inspected `.codex/agents` and delegated read-only planning support to the project `frontend-developer` and `code-reviewer` agents.
- [x] (2026-05-11 22:13 KST) Used the `web-design-guidelines` skill and checked the current guidelines source at `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.
- [x] (2026-05-11 22:13 KST) Inspected `src/content/popup.ts`, `src/content/popup.css`, `src/content/toast.ts`, `src/content/controller.ts`, `src/content/keyboard.ts`, `src/options/App.tsx`, `src/options/styles.css`, `tests/e2e/slash-popup.spec.ts`, `tests/e2e/options.spec.ts`, and `tests/playwright/promptit.ts`.
- [x] (2026-05-11 22:13 KST) Incorporated read-only subagent findings into this plan without making implementation changes.
- [x] (2026-05-12 16:02 KST) Re-read this ExecPlan before implementation and re-inspected the popup, toast, keyboard, and options accessibility seams against the current working tree.
- [x] (2026-05-12 16:02 KST) Re-used the F6 popup minimum-width work as already handled and confirmed this plan will not touch popup width or anchoring.
- [x] (2026-05-12 16:02 KST) Recorded current-code drift: repeated options list delete buttons already have prompt-specific accessible names from earlier options work, so Stage 2 should treat that behavior as already covered and add/keep focused coverage rather than duplicate the fix.
- [x] (2026-05-12 16:18 KST) Delegated Stage 1 popup/toast/Tab regression tests to a project `test-automator` subagent with ownership limited to `tests/e2e/slash-popup.spec.ts` and optional test helpers; the subagent later errored due model capacity, so the main thread reviewed and finished the tests.
- [x] (2026-05-12 16:18 KST) Delegated Stage 2 options drift mapping to a project `code-mapper` subagent with read-only ownership and folded its findings into the remaining Stage 2 scope.
- [x] (2026-05-12 16:18 KST) Add focused popup and toast accessibility regression tests.
- [x] (2026-05-12 16:18 KST) Implement Stage 1 popup, toast, and popup keyboard-model accessibility fixes.
- [x] (2026-05-12 16:46 KST) Add focused options list/card/delete accessibility regression tests.
- [x] (2026-05-12 16:46 KST) Implement Stage 2 options list item, selection button, delete label, and busy-state fixes.
- [x] (2026-05-12 16:46 KST) Ran typecheck, build, targeted e2e tests, full `slash-popup`, full `options`, and the deterministic e2e suite.
- [x] (2026-05-12 16:46 KST) Completed implementation self-review and updated `Outcomes & Retrospective`.

## Surprises & Discoveries

- Observation: the popup intentionally keeps browser focus in the host editor instead of moving focus into the injected shadow DOM.
  Evidence: popup buttons are rendered with `tabindex="-1"` or `tabIndex = -1` in `src/content/popup.ts`, while `src/content/controller.ts` handles popup keyboard commands from a capture-phase document `keydown` listener. Existing tests assert that focus remains on `#prompt-textarea` after popup error flows.

- Observation: a full roving-tabindex or focus-moving popup redesign would be risky for this extension.
  Evidence: `src/content/keyboard.ts` lets printable characters close the popup without preventing default so typing resumes in the original editor. If focus moved into the popup, printable character behavior could stop inserting into the editor.

- Observation: `Tab` is currently treated as a passive control key that still prevents default.
  Evidence: `PASSIVE_CONTROL_KEYS` in `src/content/keyboard.ts` includes `Tab`; `registerDocumentListeners()` in `src/content/controller.ts` calls `consumePopupKeyEvent()` when `action.preventDefault` is true. This can trap keyboard users while the popup is open.

- Observation: the options page already has some live region and busy-state plumbing.
  Evidence: `src/options/App.tsx` has polite and assertive screen-reader-only regions near the top of the page, `aria-busy` on the list article, `aria-busy` on the form, role `status` for success/conflict/loading messages, and role `alert` for errors.

- Observation: the most direct options-page semantic issues are localized to one list rendering block.
  Evidence: `src/options/App.tsx` renders the prompt list at the article headed `저장된 프롬프트`. The per-prompt card selection button has nested `div`, `p`, and `dl` markup, and the adjacent list delete button has the same accessible name for every row.

- Observation: current code no longer matches the original repeated-delete-label evidence.
  Evidence: on 2026-05-12, `src/options/App.tsx` already renders the repeated list delete button with `aria-label={`${prompt.title} 삭제`}`, so the remaining Stage 2 work is test coverage plus any small label wording alignment, not the original generic-label bug fix.

- Observation: Stage 1 needed an explicit Tab close path rather than only removing `Tab` from the passive prevented keys.
  Evidence: the first focused Stage 1 run passed popup semantics and toast live-region tests but kept the popup visible after `Tab`. Updating `getPopupKeyAction()` so `Tab` closes with `preventDefault: false` made the focused `Tab` regression pass while keeping normal focus movement unblocked.

- Observation: the contenteditable fixture does not deterministically move `Tab` focus to the outside target.
  Evidence: the fixture's outside target appears before the composer, and the post-composer send button is disabled. The regression now asserts the popup closes, trigger text is cleaned, and focus is no longer on `#prompt-textarea`, which verifies the no-trap behavior without overfitting to a fixture-specific target.

- Observation: busy-state key handling needed a separate Tab exception after review.
  Evidence: the review subagent found that the controller forced `preventDefault` whenever `session.isBusy` was true. The final implementation keeps pending popup actions busy and open, but no longer prevents default for `Tab`; focused coverage now asserts busy `aria-busy="true"` and focus leaving the composer while the pending action remains open.

- Observation: active-cell live-region text must be written to the current DOM node, not only guarded by the cached last announcement.
  Evidence: review identified that `PromptPopup.update()` rerenders the shadow DOM, so a same-label active cell could leave a new `[data-role="active-cell-status"]` empty. The final guard also compares the current status node text, and the open-popup storage update test now verifies the live status survives rerender.

- Observation: existing e2e tests already use role-based locators enough to extend this plan without adding a new accessibility tool.
  Evidence: `tests/e2e/options.spec.ts` uses `getByRole()` for headings, buttons, status, and alerts; `tests/e2e/slash-popup.spec.ts` already covers popup keyboard navigation, pin/copy/select behavior, toast text, blur, outside click, Escape, Backspace, and printable typing.

## Decision Log

- Decision: Implement F7 as two small stages inside one plan: Stage 1 for popup/toast/content behavior, Stage 2 for options-page semantics.
  Rationale: Popup and toast changes affect the injected content-script runtime and `slash-popup` tests. Options changes affect React markup and `options` tests. Keeping them staged makes regressions easier to isolate while still delivering one coherent accessibility pass.
  Date/Author: 2026-05-11 / Codex

- Decision: Do not move focus into the popup for F7.
  Rationale: Current product behavior depends on focus staying in the AI site editor so printable typing resumes naturally. F7 should add semantics, live announcements, busy state, and a Tab escape path without changing the focus ownership model.
  Date/Author: 2026-05-11 / Codex

- Decision: Treat the popup as a keyboard-managed editor companion, not a modal dialog.
  Rationale: The popup does not trap focus, does not own the full page, and should close when focus leaves the editor. A non-modal labeled region/list plus live active-cell announcements better matches the current interaction model than `aria-modal` or a focus-trapping dialog.
  Date/Author: 2026-05-11 / Codex

- Decision: Include a Tab escape fix in Stage 1.
  Rationale: The F7 keyboard model is incomplete if users can open the popup but cannot use Tab or Shift+Tab to leave the editor. This is a small change in the same keyboard boundary and can be tested against the existing fixture's outside focus target.
  Date/Author: 2026-05-11 / Codex

- Decision: Keep F6 popup minimum width out of this plan.
  Rationale: F6 concerns layout width calculation around popup anchoring. F7 concerns keyboard and assistive-technology semantics. Mixing them would make tests and review less focused.
  Date/Author: 2026-05-11 / Codex

- Decision: Do not add Axe, Testing Library, or any new accessibility dependency for this pass.
  Rationale: The current Playwright e2e suite can verify role/name/state attributes and high-risk keyboard flows. Adding a new tool would be heavier than the requested minimal pass.
  Date/Author: 2026-05-11 / Codex

- Decision: Defer broad reduced-motion and color-contrast redesign unless a touched selector needs a tiny focus-visible treatment.
  Rationale: Those are valid accessibility concerns, but the requested F7 scope is popup keyboard model, toast live region, busy state, list item/button semantics, and delete labels without visual redesign.
  Date/Author: 2026-05-11 / Codex

## Outcomes & Retrospective

Implemented. Stage 1 added popup region/list/listitem semantics, active-cell live status, popup `aria-busy`, success/error toast live-region policy, and a Tab no-trap path without moving focus into the popup. Stage 2 repaired options prompt-card semantics with span-based button content, prompt-specific edit names, no selection `aria-pressed`, editor-panel busy state, item-specific delete-label coverage, and minimal focus-visible treatment on touched buttons.

Tests added or strengthened cover popup semantics, active-cell announcements, success/error toast live-region attributes, idle Tab cleanup, busy Tab no-trap behavior, busy `aria-busy`, live status after popup rerender, distinct list delete names, and prompt-card keyboard selection by role/name. F6 popup minimum width remains separate prior work; this plan reused the already-present width test only as an existing regression during full suite runs and did not redesign or refactor popup anchoring here.

Validation completed on 2026-05-12 KST:

    pnpm run typecheck
    pnpm run build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts -g "busy and open while prompt insertion|busy and open while prompt copy|updates the open popup|accessibility|toast live region|Tab"
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts -g "delete buttons|prompt cards|toggles pinned state|reorders normal prompts|reorders pinned prompts|cancels and confirms prompt deletion"
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts
    pnpm run test:e2e
    pnpm run build

Results: focused popup accessibility/busy rerender coverage passed 17/17, focused options coverage passed 6/6, full `slash-popup.spec.ts` passed 61/61, full `options.spec.ts` passed 44/44, full deterministic e2e passed 118/118, production build passed, and host-level process cleanup showed no lingering Chrome/Chromium/Playwright processes. A review subagent found two actionable F7 issues, both fixed before final validation. Residual risk: automated checks inspect DOM semantics and keyboard behavior, but they do not replace a manual screen-reader smoke test across real ChatGPT/Gemini pages.

## Context and Orientation

This repository is a Chrome extension. A content script runs inside supported AI web sites. When a user types the trigger sequence `/ ` in a supported editor, the content script opens a Promptit popup with saved prompts. The popup is implemented in `src/content/popup.ts` and styled by `src/content/popup.css`. It is mounted into a shadow DOM, which means the extension controls a small isolated DOM tree inside the host page. A shadow DOM is a browser feature that lets a component keep its markup and styles separate from the host page.

The popup runtime is owned by `src/content/controller.ts`. It creates `PromptPopup`, tracks a `PopupSessionState`, listens to document events, and delegates key presses to `src/content/keyboard.ts`. The popup has an active cell model: Arrow keys move between pin, title, and copy cells; Enter activates the active cell; Escape and Backspace close the popup and clean up the trigger text; printable typing closes the popup and lets the typed character reach the host editor.

The popup currently renders a card with `aria-label="Promptit prompt picker"`, a list container marked with `data-role="prompt-list"`, and per-row native `button` elements for pin, title/select, and copy. Those buttons are all removed from the tab order with `tabIndex = -1` because focus remains in the host editor. `applyActiveState()` updates CSS classes and `aria-current="true"` on the active cell. `setBusy()` toggles the `is-busy` class and disables action buttons but does not currently update `aria-busy`.

Toasts are implemented in `src/content/toast.ts`. `showToast()` creates or reuses a fixed-position shadow DOM host, sets `textContent` on `[data-role="toast-content"]`, and hides it after a short timeout. The toast content is visible, but it currently has no role or live-region attributes. A live region is a DOM element with attributes such as `aria-live` that tells assistive technologies to announce changes even when focus is elsewhere.

The options page is a React app rooted in `src/options/App.tsx` and styled through Tailwind classes plus `src/options/styles.css`. It receives state and actions from `src/options/usePromptEditor.ts`. The F7 options work should stay mostly inside `App.tsx`: the prompt list card, pin button, drag handle, selection button, and delete button are all rendered in one mapping block. The options page already has screen-reader-only polite and assertive regions, banners with role `status` and `alert`, and some `aria-busy` attributes.

In this plan, "accessible name" means the text assistive technologies use to identify a control. For example, a delete button named `목록에서 프롬프트 삭제` is ambiguous when the list has many prompts; a button named `삭제 테스트 삭제` or `삭제 테스트 프롬프트 삭제` tells the user which item will be deleted. "Keyboard model" means the exact keys users press and the behavior each key produces.

## Plan of Work

Start with tests because F7 is about preserving behavior while improving semantics. Add small e2e tests to the existing Playwright specs instead of introducing a new test runner or accessibility dependency.

Stage 1 covers popup and toast behavior. In `tests/e2e/slash-popup.spec.ts`, add a test that opens the popup, checks that the popup card and list expose stable accessible state, presses Arrow keys, and verifies that the active cell still changes while a screen-reader-only live region mirrors the active cell label. The assertion should not depend on a real screen reader. It should inspect DOM attributes and live region text, such as `role`, `aria-live`, `aria-atomic`, `aria-current`, and the active label text. Preserve the existing active-cell labels: `Pin prompt: ...`, `Unpin prompt: ...`, `Insert prompt: ...`, and `Copy prompt: ...`.

Still in `tests/e2e/slash-popup.spec.ts`, add a toast live-region test for at least one success toast and one error toast. Reuse existing flows that already trigger toast text, such as copy success, clipboard failure, prompt insertion failure, or open-options failure. Assert that `[data-role="toast-content"]` has `role="status"` and `aria-live="polite"` for success, and either `role="alert"` or `aria-live="assertive"` for error. Use one policy consistently in implementation: success toasts should be polite status announcements; error toasts should be assertive alerts. Both should set `aria-atomic="true"` before changing `textContent`.

Add a focused Tab regression test in `tests/e2e/slash-popup.spec.ts`. Open the popup from the contenteditable fixture, press `Tab`, and expect keyboard focus to leave the composer or reach the fixture's outside focus target according to normal browser behavior. The popup should close and the `/ ` trigger should be cleaned up, matching the existing blur cleanup contract. Add the same test for `Shift+Tab` only if the fixture has a deterministic previous focus target; otherwise, document that `Tab` coverage is the minimum F7 requirement and keep `Shift+Tab` in manual validation.

Then implement Stage 1 in `src/content/popup.ts`, `src/content/popup.css`, `src/content/toast.ts`, and `src/content/keyboard.ts`. In `PromptPopup.render()`, add stable semantics to the popup card and list without making the popup modal and without moving focus into the popup. The card should remain a labeled non-modal region. The list container should have a list role and a clear label, and rows should expose list item semantics. In `createLauncherRow()`, keep native buttons for actions but do not put them back into the tab order in this stage.

Add a screen-reader-only live region inside the popup shadow DOM, for example a `div` with `data-role="active-cell-status"`, `aria-live="polite"`, and `aria-atomic="true"`. Add or reuse a visually-hidden CSS utility in `src/content/popup.css` so this element is not visible. In `applyActiveState()`, after updating `aria-current`, set the live region text to the active cell's accessible label when it changes. The live region text should be concise and should not change on every render if the active cell label is unchanged, to avoid noisy repeated announcements.

Update `PromptPopup.setBusy()` so the card has `aria-busy="true"` while an async action is running and `aria-busy="false"` or no busy attribute when idle. Because the card is recreated by `render()`, ensure `render()` writes the initial busy state and `setBusy()` keeps the live DOM synchronized. Do not change the visual busy styling except as needed to keep the existing class behavior.

Update `src/content/toast.ts` so `showToast(message, variant)` updates role, live-region attributes, and atomicity before it updates `textContent`. Success toasts should be `role="status"` with `aria-live="polite"`. Error toasts should be `role="alert"` with `aria-live="assertive"`, or role `alert` alone if the implementation chooses to rely on its implicit assertive behavior; the test should encode the chosen project policy. Keep existing `data-variant`, timeout, text, and visual appearance unchanged.

Update `src/content/keyboard.ts` so `Tab` no longer traps keyboard focus while the popup is open. The smallest preferred approach is to remove `Tab` from `PASSIVE_CONTROL_KEYS` so the existing blur listener closes the popup and cleans the trigger. If that is not reliable in the fixture, introduce an explicit `close` action for `Tab` that does not block normal focus movement unless the browser requires it. Preserve the rest of `getPopupKeyAction()` behavior for Arrow keys, Enter, Escape, Backspace, Delete, passive modifiers, and printable keys.

Stage 2 covers options-page semantics. In `tests/e2e/options.spec.ts`, add or update tests that assert prompt list delete buttons have item-specific accessible names. Seed two prompts with distinct titles, locate each list delete button by role and name, and assert the two buttons can be distinguished. Reuse the existing delete confirmation tests to prove cancel and confirm still work.

Add an options card keyboard test if current coverage does not already prove it after the markup change. Focus a prompt selection control by role/name or by the existing `data-testid="prompt-card"` selector, press Enter or Space, and expect the editor heading to switch to `프롬프트 수정` with the selected prompt loaded. This test should also prove that pin toggle and drag-handle controls remain separate buttons with their existing names and behaviors.

Then implement Stage 2 in `src/options/App.tsx`. Repair the prompt card selection button so it no longer contains invalid block structures such as `div`, `p`, or `dl` as direct button content. The least visual change is to keep the native `button` as the selection control but render its internal layout with `span` elements styled as block or grid containers. Use child `span` elements for metadata labels and values instead of a `dl` inside the button. Keep `data-testid="prompt-card"` unless tests are intentionally migrated in the same patch.

Give the prompt card selection button a specific accessible name that includes the prompt title and purpose, for example `${prompt.title} 편집`. Keep `aria-current="true"` for the active prompt if it remains useful, but remove `aria-pressed` unless the implementation treats the card as a toggle button. A prompt card selects an item for editing; it is not a persistent on/off toggle. If removing `aria-pressed` would require broad test churn, first update the focused tests to assert the intended selection semantics, then remove it.

Change the row delete button label from the generic `목록에서 프롬프트 삭제` to an item-specific label, for example `${prompt.title} 프롬프트 삭제`. Do not change the visible text `삭제` unless the design owner explicitly requests visible text changes. Keep the form-level edit-mode delete button named `프롬프트 삭제`, because it is not repeated in a list and existing tests rely on that exact label.

Review `aria-busy` in the options page while touching `App.tsx`. The list article already uses `aria-busy={loadState.status === 'loading' || isSaving}`. The editor article currently uses `aria-busy={isSaving}`, while the form uses `aria-busy={isEditorLoading || isSaving}`. Align the editor article with the form so body loading is exposed at the panel level too. Do not redesign loading states; this is a semantic attribute change.

Add minimal focus-visible treatment only where a touched interactive element has no clear keyboard focus indication. Use the existing Tailwind focus ring style already used by inputs as a guide. This should be additive, such as `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300`, and should not change hover, color palette, spacing, card radius, or layout.

Do not touch popup width calculation, popup anchoring, `resolvePopupLayout`, or tests that only prove F6 minimum width. Do not add a new accessibility dependency. Do not refactor `App.tsx` into new components unless the prompt card semantic repair becomes unreadable without a tiny local helper. If a helper is introduced, keep it inside `App.tsx` for this pass.

## Concrete Steps

All commands in this section assume the working directory is the repository root:

    cd /home/seok/code/promptit

Before editing, inspect the current files if they have changed since this plan was written:

    git status --short
    rg -n "tabIndex|tabindex|aria-|role=|setBusy|active-cell|toast-content|PASSIVE_CONTROL_KEYS" src/content/popup.ts src/content/popup.css src/content/toast.ts src/content/keyboard.ts
    rg -n "aria-|role=|prompt-card|목록에서 프롬프트 삭제|aria-busy|focus-visible" src/options/App.tsx

Milestone 1 is the popup and toast test baseline. Edit `tests/e2e/slash-popup.spec.ts` and `tests/playwright/promptit.ts` only if a helper is needed. Add focused tests for active-cell announcement, toast live-region attributes, and Tab leaving the popup. Run the targeted spec and expect the new tests to fail before implementation for missing attributes or trapped Tab:

    pnpm run build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts --grep "accessibility|toast live region|Tab"

Milestone 2 is the popup and toast implementation. Edit `src/content/popup.ts`, `src/content/popup.css`, `src/content/toast.ts`, and `src/content/keyboard.ts`. Add popup semantics, live active-cell announcement, toast live-region roles, popup `aria-busy`, and the Tab escape behavior. Run typecheck and the focused popup tests:

    pnpm run typecheck
    pnpm run build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts --grep "accessibility|toast live region|Tab|keyboard navigation includes the pin cell|cleans up the trigger text|closes on outside click|closes on blur|shows an error toast"

Milestone 3 is the options-page test baseline. Edit `tests/e2e/options.spec.ts` to cover item-specific list delete labels and prompt-card keyboard selection semantics. Run the targeted options tests and expect the new tests to fail before implementation for the repeated delete name or invalid selection semantics:

    pnpm run build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts --grep "accessibility|delete label|prompt card|opens the options page|toggles pinned state|reorders normal prompts|reorders pinned prompts"

Milestone 4 is the options implementation. Edit `src/options/App.tsx`, and edit `src/options/styles.css` only if a shared focus-visible utility is clearer than Tailwind classes in place. Repair the card button structure, delete labels, editor-panel busy state, and minimal focus-visible classes. Run typecheck and targeted options tests:

    pnpm run typecheck
    pnpm run build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts --grep "accessibility|delete label|prompt card|opens the options page|toggles pinned state|reorders normal prompts|reorders pinned prompts|cancels and confirms prompt deletion"

Milestone 5 is final regression. Run the deterministic project checks. If local time is constrained, run `typecheck`, `build:test`, and both targeted specs first; before merging, run the full e2e suite:

    pnpm run typecheck
    pnpm run build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts
    pnpm run test:e2e

Expected successful output is the normal Playwright pass summary with no failed tests. The exact number of tests may change after adding coverage, so record the final count in `Outcomes & Retrospective` rather than hard-coding it here.

## Validation and Acceptance

The change is accepted only when both the semantic behavior and the existing interaction behavior are demonstrated.

For the popup, open a contenteditable fixture, type `/ `, and observe that the popup opens. ArrowUp, ArrowDown, ArrowLeft, and ArrowRight must still move the active cell. Enter on a title cell must insert the prompt and close the popup. Enter on a pin cell must toggle the pin state and keep the popup open. Enter on a copy cell must copy the prompt. Escape and Backspace must close the popup and clean the trigger text. Printable typing such as `a` must close the popup and preserve resumed typing in the host editor. Mouse hover must still update the active cell, and mouse click on title, pin, copy, exit, and settings must keep their existing outcomes.

For popup accessibility, the popup card should expose a clear label and busy state, the list should expose list semantics, the active cell should still have `aria-current="true"`, and a screen-reader-only live region should announce the current active cell label after keyboard or hover movement. The popup should not become a modal dialog and should not steal focus from the host editor. Pressing Tab with the popup open must not trap focus; the popup should close through the blur or explicit close path and the trigger cleanup behavior should be deterministic.

For toast accessibility, success toasts must set `role="status"`, `aria-live="polite"`, and `aria-atomic="true"` on the toast content before updating text. Error toasts must use the project-chosen assertive error policy, either `role="alert"` plus `aria-atomic="true"` or `role="alert"` with an explicit `aria-live="assertive"`. The visible message text, `data-variant`, animation timing, and auto-hide behavior should remain unchanged.

For the options page, use only the keyboard to Tab through the page. Visible focus should be apparent on Add, pin, drag handle, prompt card selection, delete, form fields, submit, cancel, and banner dismiss controls. Selecting a prompt card with Enter or Space should load that prompt in the editor. Pin toggle and drag-handle keyboard reorder must continue to pass existing tests. Each repeated list delete button must have an accessible name that includes the prompt title. The edit-mode form delete button can keep the exact visible and accessible name `프롬프트 삭제`.

For options semantics, the prompt card selection control should remain a native button or another semantically correct keyboard-operable control, but it must not contain invalid complex block markup. The prompt list should continue to expose list/listitem structure. The editor panel should expose busy state during body loading and saving.

The following commands must pass before declaring this plan complete:

    pnpm run typecheck
    pnpm run build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts

Before merge or release, also run:

    pnpm run test:e2e

If `pnpm run test:e2e` fails for an unrelated environmental reason, record the failure output, rerun the two targeted specs above, and document the residual risk in `Outcomes & Retrospective`.

## Idempotence and Recovery

The implementation should be additive and safe to retry. Re-running Playwright will rebuild the test extension and reuse the configured fixture web server. If a test run leaves browser processes or profiles behind, clean them using the existing project cleanup practice from prior browser-test work before re-running; do not delete unrelated user files.

If Stage 1 causes popup typing or focus regressions, revert only the Stage 1 code and tests and keep Stage 2 untouched. The cleanest boundary is that Stage 1 owns `src/content/popup.ts`, `src/content/popup.css`, `src/content/toast.ts`, `src/content/keyboard.ts`, and popup e2e tests.

If Stage 2 causes options layout or behavior regressions, keep the item-specific delete label change if it is passing and isolate the card markup repair separately. The cleanest boundary is that Stage 2 owns `src/options/App.tsx`, optional local focus-visible styling, and options e2e tests.

Do not use destructive git commands such as `git reset --hard`, `git checkout --`, or `git clean -fd` to recover. Use normal file edits or targeted `git diff` inspection. Do not stage or commit until the implementing user explicitly asks for it.

## Artifacts and Notes

Relevant current code evidence:

    src/content/popup.ts:
      PromptPopup.setBusy() toggles class and disables action buttons but does not set aria-busy.
      PromptPopup.render() creates the card, header, list, footer, Exit, and settings controls.
      PromptPopup.applyActiveState() toggles aria-current on the active cell.
      createLauncherRow() creates native pin/title/copy buttons with tabIndex = -1.

    src/content/toast.ts:
      ensureToastHost() creates <div class="promptit-toast" data-role="toast-content"></div>.
      showToast() sets textContent, data-variant, visible class, and timeout.

    src/content/keyboard.ts:
      PASSIVE_CONTROL_KEYS currently includes Delete and Tab.
      getPopupKeyAction() maps arrows, Escape, Backspace, Enter, printable keys, and passive controls.

    src/options/App.tsx:
      Existing screen-reader-only regions live near the top of the page.
      The list article already has aria-busy for list loading and saving.
      The prompt-card selection button contains div, p, and dl content.
      The repeated row delete button uses aria-label="목록에서 프롬프트 삭제".
      The editor article has aria-busy={isSaving}, while the form has aria-busy={isEditorLoading || isSaving}.

Read-only subagent synthesis:

    The project frontend-developer agent recommended two stages: popup/toast/content first, then options list/card/delete. It also called out Tab trapping, popup aria-busy, toast live-region policy, item-specific delete labels, and keeping F6 width out of scope.

    The project code-reviewer agent confirmed the same core risks and recommended preserving getPopupKeyAction behavior for arrows, Enter, Escape, Backspace, printable typing, and existing action labels. It also recommended not adding broad redesign or new tooling.

Manual screen reader and keyboard smoke checklist for the implementer:

    1. Open the contenteditable fixture with the extension loaded.
    2. Type "/ " and confirm focus remains in the composer.
    3. Use Arrow keys and confirm the active prompt/action changes visually and the active-cell live region text changes.
    4. Trigger a success toast and an error toast; inspect the toast content for role and live-region attributes.
    5. Press Tab with the popup open and confirm focus is not trapped.
    6. Open the options page and navigate controls with Tab and Shift+Tab.
    7. Confirm repeated delete buttons are distinguishable by prompt title.
    8. Confirm selecting a prompt, pinning, keyboard reordering, deleting, submitting invalid form data, and dismissing banners still work.

## Interfaces and Dependencies

Do not add new package dependencies.

`src/content/popup.ts` should continue exporting `PromptPopup`. At the end of Stage 1, the class should still support these methods with the same names and external behavior:

    show(items: LauncherItem[], activeCell: PopupActiveCell | null, anchorRect: DOMRect): void
    update(items: LauncherItem[], activeCell: PopupActiveCell | null, anchorRect: DOMRect): void
    hide(): void
    setActiveCell(activeCell: PopupActiveCell | null): void
    containsEvent(event: Event): boolean
    setBusy(isBusy: boolean): void

The implementation may add private helpers inside `src/content/popup.ts`, such as:

    getActiveCellAnnouncement(activeElement: HTMLElement | null): string
    updateActiveCellStatus(nextText: string): void

These helpers should derive announcement text from the same accessible labels already assigned to the active cell buttons. Do not invent a separate title lookup that can drift from the button labels.

`src/content/toast.ts` should keep the public functions:

    showToast(message: string, variant?: 'success' | 'error'): void
    showCopyToast(message: string, variant?: 'success' | 'error'): void

The implementation may add a small helper such as:

    applyToastAccessibility(content: HTMLDivElement, variant: 'success' | 'error'): void

This helper should set role/live attributes before `content.textContent = message`.

`src/content/keyboard.ts` should keep the `PopupKeyAction` union and `getPopupKeyAction(event: KeyboardEvent): PopupKeyAction` export unless the implementer updates all callers and tests in the same stage. The preferred change is to stop preventing default for `Tab`, not to redesign the action union.

`src/options/App.tsx` should keep using `usePromptEditor()` as the source of state and actions. Do not move state into new files. If a local rendering helper is needed for readability, define it in `App.tsx`, for example:

    function PromptCardMeta(props: { createdAt: string; updatedAt: string; isActive: boolean }) { ... }

The helper must not change storage behavior, editor state, drag-and-drop behavior, or prompt ordering.

## Regressions to Guard Against

Do not break the slash trigger `/ ` opening behavior for textarea or contenteditable fixtures.

Do not break keyboard navigation through popup cells. Existing tests around `keyboard navigation includes the pin cell without changing title and copy behavior`, pin activation, unpin activation, copy activation, and active cell clamping should still pass.

Do not break trigger cleanup on Escape, Backspace, blur, outside click, resize, scroll, copy, or open-options actions.

Do not break resumed typing after the popup closes from a printable key. The existing expectation that typing `a` after opening the popup leaves composer text `/ a` should still pass unless a separate product decision changes it.

Do not change prompt title/content rendering from `textContent` or React text rendering to unsafe HTML.

Do not change visible labels unless needed for accessible names. Keep visible `삭제`, `프롬프트 삭제`, `프롬프트 추가`, `프롬프트 수정`, and popup action labels stable.

Do not include F6 popup minimum width or any popup anchoring layout change in this patch.

## Plan Revision Note

Initial version created on 2026-05-11 by Codex. This plan incorporates the F7 triage findings, direct read-only inspection of popup/toast/options code and tests, and read-only project subagent feedback. It intentionally scopes out F6 minimum width, broad redesign, and new test tooling.
