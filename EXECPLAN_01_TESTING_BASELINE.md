# Minimal Testing Baseline Before F1-F7 Fixes

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is intentionally self-contained so a future agent or engineer can implement the testing baseline without knowing the earlier audit thread.

## Purpose / Big Picture

Promptit is a browser extension that inserts saved prompts into AI website editors after the user types `/ `. The previous code-quality triage identified seven risk areas, labeled F1 through F7. Before fixing those risks, the repository needs a small, deterministic validation baseline so regressions are caught by commands a contributor can run locally.

After this plan is implemented, `pnpm test` will mean the default deterministic verification gate for this repository. It will run TypeScript checking, a production build, and the local fixture-based Playwright regression suite. The live ChatGPT/Gemini smoke tests will remain separate because they depend on external sites and user sessions. The new tests will target the minimum pre-fix coverage for F1 through F4 first, because those findings can affect saved prompt data or active editor text.

## Progress

- [x] (2026-05-11 21:17:43+09:00) Read `PLANS.md` and confirmed the required ExecPlan format.
- [x] (2026-05-11 21:17:43+09:00) Inspected project-specific agents in `.codex/agents` and delegated read-only planning support to the project `test-automator` subagent.
- [x] (2026-05-11 21:17:43+09:00) Inspected current scripts, TypeScript config, Playwright configs, testing docs, and targeted F1-F7 source/test seams without modifying them.
- [x] (2026-05-11 21:17:43+09:00) Created this ExecPlan as the only file change in the planning session.
- [x] Add the deterministic `pnpm test` entrypoint and Node engine declaration.
- [x] Expand TypeScript config coverage so the live Playwright config is typechecked.
- [x] Add the minimum F1-F4 pre-fix regression tests.
- [x] Defer small F5-F7 follow-up tests to the later fix slices where those findings are handled.
- [x] Update only `TESTING.md` and `TEST_CHECKLIST.md` to describe the new baseline and remaining gaps.
- [x] Run the feasible test-first validation sequence and record the results in this document.
- [x] (2026-05-12 13:36:28+09:00) Added `package.json` `engines.node`, added deterministic `pnpm test`, and included `playwright.live.config.ts` in `tsconfig.json`.
- [x] (2026-05-12 13:36:28+09:00) Added F1/F2 pre-fix options regression tests in `tests/e2e/options.spec.ts` plus the narrow `setPromptMigrationCompleteMarker()` helper in `tests/playwright/extension.ts`.
- [x] (2026-05-12 13:37:59+09:00) Added F3/F4 pre-fix slash popup regression tests in `tests/e2e/slash-popup.spec.ts` plus a test-mode-only deferred body read control in `src/content/controller.ts`.
- [x] (2026-05-12 13:38:08+09:00) Updated `TESTING.md` and `TEST_CHECKLIST.md` with the new deterministic gate and F1-F4 automated coverage mapping.
- [x] (2026-05-12 13:38:08+09:00) Ran validation for this test-first slice: `node --version`, `pnpm --version`, `pnpm typecheck`, `pnpm build`, `pnpm build:test`, focused options tests, focused slash tests, and host-level browser process inspection.
- [x] (2026-05-12 14:02:00+09:00) Addressed review feedback on the slash tests: armed the deferred body-read listener before triggering selection, and made the block-boundary test assert the visible no-popup invariant after the known trigger debounce instead of depending on the debug attribute.
- [ ] After F1-F4 fixes land in later ExecPlans, rerun the same focused tests and then `pnpm test` until the deterministic gate exits 0.

## Surprises & Discoveries

- Observation: The repository already has a substantial deterministic Playwright fixture suite, so a new test framework is not needed for the baseline.
  Evidence: `tests/e2e/options.spec.ts`, `tests/e2e/slash-popup.spec.ts`, `tests/e2e/gemini-slash-popup.spec.ts`, `tests/e2e/platform.spec.ts`, `tests/playwright/extension.ts`, and `tests/playwright/promptit.ts` are already present.

- Observation: `pnpm test:e2e` already builds the extension in test mode before running Playwright, but there is no default `pnpm test` script.
  Evidence: `package.json` contains `build:test` and `test:e2e`, but no `test` script.

- Observation: The live Playwright config is used by `test:e2e:live` but is not covered by the current TypeScript include list.
  Evidence: `tsconfig.json` includes `playwright.config.ts` but not `playwright.live.config.ts`.

- Observation: The current local runtime satisfies the dependency-level Node requirement, but the repository does not declare that requirement.
  Evidence: local `node --version` returned `v22.22.2`, `pnpm --version` returned `10.33.0`, and `pnpm-lock.yaml` records Vite 8 with Node `^20.19.0 || >=22.12.0`.

- Observation: The F1 regression test fails before the storage fix because `runLegacyPromptMigration()` ignores `promptit:idbMigration` when IndexedDB is empty.
  Evidence: `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts --grep "does not reimport|preserves dirty create|disables save"` failed `does not reimport legacy prompts after migration is complete`; the empty-state assertion failed because the legacy prompt was reimported.

- Observation: The F2 regression tests fail before the options guard fix because a selected body-load failure enters edit mode and leaves the submit button enabled.
  Evidence: the same focused options command failed `preserves dirty create draft when selected prompt body load fails` waiting for the create heading, and failed `disables save when selected prompt body did not load` because `프롬프트 수정` was enabled.

- Observation: The F3/F4 regression tests fail before the content and adapter fixes, while an existing IME reset characterization still passes.
  Evidence: `xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts --grep "busy|IME|block boundaries"` failed the new busy, block-boundary, and IME keydown tests, and passed `resets composing state after a popup closes during IME input`.

- Observation: The host-level process check after focused Playwright runs found no `/opt/google/chrome/chrome` or `promptit-playwright` processes, but did show pre-existing `chrome-devtools-mcp --isolated` processes from earlier timestamps.
  Evidence: sandbox-external `ps -ef | rg 'chrome-devtools-mcp|puppeteer_dev_chrome_profile|/opt/google/chrome/chrome|promptit-playwright'` listed only `chrome-devtools-mcp` processes started before these Playwright runs plus the inspection command itself.

- Observation: A review pass found two slash-test quality issues before completion: a possible listener/action race in the busy test and debug-attribute coupling in the block-boundary negative test.
  Evidence: The busy test now calls `armPromptBodyReadPendingListener()` before pressing Enter, and the block-boundary test waits past the 100 ms trigger debounce before asserting that no popup host exists. Re-running the focused slash command still failed for the intended F3/F4 bugs.

## Decision Log

- Decision: Do not introduce Vitest, Jest, jsdom, axe, or a new unit-test framework in this baseline.
  Rationale: The existing Playwright fixture suite already exercises the browser-extension seams that matter for F1-F4: extension storage, IndexedDB, `chrome.storage.local`, content scripts, DOM events, and options UI. New tooling would increase setup cost before the highest-risk regressions are protected.
  Date/Author: 2026-05-11 / Codex

- Decision: Make `pnpm test` the deterministic local default and keep live smoke tests out of it.
  Rationale: The local fixture tests are repeatable and suitable for every PR. `tests/live` depends on external websites and authenticated or changing host behavior, so it should remain a release smoke step rather than the default regression gate.
  Date/Author: 2026-05-11 / Codex

- Decision: Add F1-F4 tests before implementing F1-F4 fixes, and record whether each test fails before the fix or is a characterization test that already passes.
  Rationale: F1-F4 affect data resurrection, dirty editor state, IME input, and contenteditable mutation. These should define the expected behavior before code changes reshape the implementation.
  Date/Author: 2026-05-11 / Codex

- Decision: Defer F5-F7 to smaller follow-up tests after the F1-F4 baseline exists.
  Rationale: F5-F7 matter, but the highest pre-fix risk is prompt data loss and active editor corruption. The baseline must stay small enough to implement before the refactor work begins.
  Date/Author: 2026-05-11 / Codex

- Decision: Add a test-mode-only deferred body-read control in `src/content/controller.ts` instead of using timeouts to simulate busy state.
  Rationale: The busy-state F3 regression needs deterministic control of the pending async action. The control is guarded by `VITE_PROMPTIT_TEST_MODE === '1'` through the existing test event path and does not change production behavior.
  Date/Author: 2026-05-12 / Codex

- Decision: Treat the new focused Playwright failures as expected test-first failures and proceed to the corresponding fix ExecPlans instead of weakening assertions.
  Rationale: The failures line up with F1 through F4: migration marker skip, body-load/dirty guard, busy input policy, IME command suppression, and block-boundary trigger rejection. The next ExecPlans are explicitly scoped to make these tests pass.
  Date/Author: 2026-05-12 / Codex

- Decision: Keep one debounce-length wait in the contenteditable block-boundary test.
  Rationale: Trigger checks are intentionally debounced by `TRIGGER_DEBOUNCE_MS = 100`. Waiting 150 ms lets the user-visible popup invariant settle without coupling the test to adapter debug attributes.
  Date/Author: 2026-05-12 / Codex

## Outcomes & Retrospective

The test-first baseline has been implemented through F1-F4. `node --version` returned `v22.22.2`, `pnpm --version` returned `10.33.0`, `pnpm typecheck` exited 0, `pnpm build` exited 0, and `pnpm build:test` exited 0. The new F1/F2 focused options tests failed as expected against the current implementation. The new F3/F4 focused slash tests failed as expected, while the existing IME reset characterization passed. A review pass found two test-quality issues and both were fixed; the focused slash command was rerun afterward and still failed for the intended product bugs. `pnpm test` is intentionally deferred until the later fix ExecPlans make the new regression tests pass. Host-level process inspection found no Playwright-owned Chrome process after the focused runs; pre-existing `chrome-devtools-mcp --isolated` processes were present and were not killed because they were not created by this slice.

## Context and Orientation

The repository root is `/home/seok/code/promptit`. The extension stores prompt metadata in IndexedDB store `promptMetas` and prompt bodies in IndexedDB store `promptBodies`. Legacy prompt data can still exist in `chrome.storage.local` under the legacy prompts key. The existing Playwright helper `tests/playwright/extension.ts` can launch the built extension, seed IndexedDB prompt records, seed legacy storage, read prompt records, send runtime messages, and close the browser context. The helper `tests/playwright/promptit.ts` provides prompt factories and fixture-page utilities.

The key deterministic tests are local Playwright tests under `tests/e2e`. These tests use local HTML fixtures from `tests/fixtures` through the web server defined in `playwright.config.ts`. They do not require a real ChatGPT or Gemini login. The live smoke tests under `tests/live` are intentionally separate and should not be part of the default `pnpm test` gate.

The current scripts in `package.json` are:

    pnpm typecheck
    pnpm build
    pnpm build:test
    pnpm test
    pnpm test:e2e
    pnpm test:e2e:live
    pnpm test:e2e:headed
    pnpm test:e2e:ui

`pnpm test` now runs `pnpm typecheck && pnpm build && pnpm check:manifest && pnpm test:e2e && pnpm build && pnpm check:manifest`. `pnpm test:e2e` currently runs `pnpm build:test` and then the fixture Playwright suite; the final build and manifest check in `pnpm test` restore and verify production `dist` output. The current `tsconfig.json` includes `src`, `tests`, `manifest.config.ts`, `vite.config.ts`, `playwright.config.ts`, and `playwright.live.config.ts`. The current `package.json` pins `packageManager` to `pnpm@10.33.0` and declares `engines.node` as `^20.19.0 || >=22.12.0`.

The F1-F7 findings from the prior triage mean the following in plain language:

F1 means a user can delete all migrated prompts, then old legacy prompts may come back after a service worker restart because the migration completion marker is written but not used as a skip condition.

F2 means the options editor can keep accepting edits after a prompt body fails to load, and the hook returns `isDirty` but the UI does not use it to protect add, cancel, or prompt-selection transitions.

F3 means the content script can treat IME composition keys such as Enter, Escape, or Backspace as popup commands, can run `compositionend` trigger checks while a popup is already open, and can react to external input while async popup actions are busy.

F4 means contenteditable mutation can fall back to direct DOM `Range.deleteContents()` and `insertNode()` outside the host editor transaction path, and trigger detection can cross line or block boundaries.

F5 means legacy compatibility and message-boundary errors need better isolation: corrupt legacy bodies should not reject whole hydration flows, legacy `updatePrompt` should not partially save meta/body, and background message handling should always return structured errors.

F6 means popup width can collapse when the anchor rectangle is zero-width or extremely narrow.

F7 means popup and options accessibility need targeted semantic fixes, including keyboard model, toast live region, busy state, unique delete labels, and valid card/button structure.

## Plan of Work

First, update the minimal command and config baseline. In `package.json`, add an `engines` field with `node` set to `^20.19.0 || >=22.12.0`. Add a `test` script whose meaning is deterministic local verification. After the permission-policy hardening, use this command:

    pnpm typecheck && pnpm build && pnpm check:manifest && pnpm test:e2e && pnpm build && pnpm check:manifest

This intentionally runs a production build and manifest policy check before the fixture suite, then lets `test:e2e` create the test-mode build needed by Playwright hooks, and finally restores and rechecks production `dist`. Do not include `test:e2e:live` in `pnpm test`.

In `tsconfig.json`, include `playwright.live.config.ts` so `pnpm typecheck` covers the config that `test:e2e:live` already references. The smallest acceptable edit is adding the file name next to `playwright.config.ts`. A glob such as `playwright*.config.ts` is also acceptable if the team prefers it, but do not broaden the include list beyond repository config and existing source/test paths.

Next, add pre-fix tests for F1-F4. These are the only tests that must exist before fixing the corresponding production behavior. They should be written against the existing Playwright helpers rather than a new framework.

For F1, add an options/storage test in `tests/e2e/options.spec.ts`. The test should prove that a completed migration marker prevents legacy reimport when IndexedDB is empty and legacy prompts still exist. Use the existing legacy helpers as much as possible. If the current helper `setLegacyRawPrompts` always removes the marker, add the smallest helper to `tests/playwright/extension.ts` that can set arbitrary `chrome.storage.local` keys or specifically set `promptit:idbMigration` to `{ status: 'complete', completedAt: <iso string> }`. The test setup should seed legacy prompts, set the migration complete marker, ensure `promptMetas` and `promptBodies` are empty, open the options page, and assert that no legacy prompt appears and no prompt records are created. This test should fail before the F1 fix if the audited behavior is still present.

For F2, add a selected-body-load failure test in `tests/e2e/options.spec.ts`. Seed two prompt records. Open the options page, dirty the create form or dirty an existing edit form, then intercept `chrome.runtime.sendMessage` for `promptit/get-prompt-body` so selecting another prompt returns or throws a body-load failure. The expected product behavior for the future fix is: dirty input is not silently discarded, the body-load failure is visible, and no save can persist an empty or incomplete body for the target prompt. If this test is easier to express in two smaller tests, split it into one test for body-load failure disabling save and one test for dirty transition preservation.

For F3, add one popup/IME command test and one popup busy-state test in `tests/e2e/slash-popup.spec.ts`. The IME test should open the popup, dispatch `compositionstart` on the composer, press Enter, Escape, and Backspace while composition is active, and assert that no prompt is inserted, no trigger cleanup runs, and the popup state remains governed by composition rather than popup command handling. The busy-state test should use the existing test-control event pattern from `src/content/controller.ts` and extend it only if necessary to defer a prompt body read or pin/copy action. While the action is pending, dispatch an input event or composition event and assert that the popup does not close through the normal typing path and that the final continuation runs once after the pending action resolves. Prefer a deterministic deferred promise over timeouts.

For F4, add a contenteditable block-boundary trigger test in `tests/e2e/slash-popup.spec.ts`. Construct a contenteditable DOM where `/` is in a previous block or before a `<br>` and the space is in the following block or line. Dispatch the input event from the current caret location and assert that the popup does not open. Add a positive control only if needed: same-line `/ ` should still open. Also add a stale-context mutation preflight test if the implementation work will change mutation preconditions: open the popup, mutate the trigger DOM before pressing Enter or Escape, press the action key, and assert that the editor DOM is not partially corrupted and the user sees the existing error recovery behavior.

After F1-F4 tests exist, add smaller F5-F7 tests only when the corresponding fixes are started. For F5, use one corrupt-record or background rejection test, not broad storage fuzzing. For F6, add one geometry assertion proving a zero-width or tiny anchor still produces a usable popup width. For F7, use role/name/focus and ARIA assertions in existing Playwright tests; do not add axe or a broad accessibility framework in this baseline.

Finally, update testing docs only in `TESTING.md` and `TEST_CHECKLIST.md`. `TESTING.md` should say `pnpm test` is the default deterministic local gate, and should keep `pnpm test:e2e:live` as a release smoke command. `TEST_CHECKLIST.md` should mark the new F1-F4 cases as automated once implemented and should list F5-F7 as remaining or partial coverage until their focused tests are added.

## Concrete Steps

Work from the repository root:

    cd /home/seok/code/promptit

Before editing anything, check the current state:

    git status --short
    node --version
    pnpm --version

Expected environment for this plan is Node `^20.19.0 || >=22.12.0` and pnpm `10.33.0`. A known-good local example during planning was:

    node --version
    v22.22.2
    pnpm --version
    10.33.0

Milestone 1 adds the command/config baseline. Edit only `package.json`, `tsconfig.json`, `TESTING.md`, and `TEST_CHECKLIST.md` for this milestone. Add `engines.node`, add `scripts.test`, and include `playwright.live.config.ts` in TypeScript checking. Run:

    pnpm typecheck
    pnpm build

Acceptance for Milestone 1 is that both commands exit 0, and `pnpm run` or `pnpm test -- --help` is not required. Do not run live smoke tests in this milestone.

Milestone 2 adds the F1 and F2 options/storage tests. Edit `tests/e2e/options.spec.ts` and, only if needed for marker setup or message interception, `tests/playwright/extension.ts`. Run focused tests first:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "migration|body|dirty"

Acceptance for Milestone 2 is that the new F1 and F2 tests fail against the current broken behavior, or the implementation notes explain why a test is characterization and already passes. After implementing the later F1/F2 production fixes, the same focused command must pass.

Milestone 3 adds the F3 and F4 content tests. Edit `tests/e2e/slash-popup.spec.ts` and, only if required for deterministic deferral controls, the existing test-control surface in `src/content/controller.ts`. Because this plan is for test baseline work, any production source edit in this milestone must be limited to adding test-mode controls behind the existing test mode gate. Run:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/slash-popup.spec.ts --grep "composition|busy|block|boundary|stale"

Acceptance for Milestone 3 is that the new F3 and F4 tests fail against current broken behavior or are recorded as characterization if already passing. After implementing the later F3/F4 production fixes, the focused command must pass without sleeps or flaky timing.

Milestone 4 wires the default deterministic gate. After the focused tests are added and the later fixes make them pass, run:

    pnpm test

The expected meaning of `pnpm test` after Milestone 1 plus the later permission-policy hardening is:

    pnpm typecheck && pnpm build && pnpm check:manifest && pnpm test:e2e && pnpm build && pnpm check:manifest

Acceptance for Milestone 4 is that `pnpm test` exits 0 on a clean working tree except for intentional local changes. If Playwright reports retries or flakes, record the exact test name and do not treat the baseline as complete until the flake is explained or fixed.

Milestone 5 records browser cleanup. After any Playwright command, verify that test-owned browser processes are not left running. Use the host-level process check already documented in `TESTING.md`:

    ps -ef | rg 'chrome-devtools-mcp|puppeteer_dev_chrome_profile|/opt/google/chrome/chrome'

If test-owned processes remain, confirm they are not the user's normal browser and stop only the test-owned process. Record what was found in `Outcomes & Retrospective`.

## Validation and Acceptance

The plan is complete when all of these conditions are true:

`package.json` declares `engines.node` as `^20.19.0 || >=22.12.0`.

`package.json` has a `test` script that runs `pnpm typecheck && pnpm build && pnpm check:manifest && pnpm test:e2e && pnpm build && pnpm check:manifest`.

`tsconfig.json` typechecks `playwright.live.config.ts`.

F1 has a deterministic regression test proving a completed migration marker prevents legacy prompt reimport when IDB is empty and legacy data remains.

F2 has deterministic coverage for selected prompt body-load failure and dirty transition protection, proving user-entered data is not silently discarded and save is blocked when the target body did not load.

F3 has deterministic coverage for IME command handling and busy async popup state.

F4 has deterministic coverage for contenteditable block-boundary trigger detection and, if mutation preflight is changed, stale-context mutation safety.

`TESTING.md` explains the new `pnpm test` default gate and keeps live smoke tests separate.

`TEST_CHECKLIST.md` maps the new tests to the F1-F4 risk areas and leaves F5-F7 marked as partial or remaining until their focused tests are implemented.

The final validation transcript should include:

    node --version
    pnpm --version
    pnpm typecheck
    pnpm build
    pnpm build:test
    focused Playwright commands for changed specs
    pnpm test
    host-level browser cleanup check

Do not require `pnpm test:e2e:live` for acceptance. It remains a release smoke test because external website behavior is not deterministic.

## Idempotence and Recovery

All planned edits are additive or narrow configuration changes. Running the validation commands more than once should be safe. `pnpm build` and `pnpm build:test` rewrite build output under `dist`, and Playwright may write `test-results` or its configured report artifacts. Those outputs are expected during implementation, but they should not be committed unless the repository already tracks them.

If a focused Playwright command fails because the extension is not built, run `pnpm build:test` and retry the same focused command. If a Playwright browser process remains after a failed run, close it before retrying to avoid port, profile, or extension-state interference.

If a new pre-fix test unexpectedly passes before the production fix, keep it only if it documents an important invariant and record it as a characterization test in `Outcomes & Retrospective`. Do not delete it silently, because the purpose of this baseline is to preserve critical behavior through the later F1-F7 fixes.

If a new helper is needed in `tests/playwright/extension.ts`, keep it specific to test setup and avoid exposing broad arbitrary mutation unless a narrower helper would duplicate too much code. For example, prefer `setMigrationCompleteMarker()` over a general `setChromeStorageLocal()` unless multiple tests need the general form.

## Artifacts and Notes

Current planning-session evidence:

    package.json now has "test": "pnpm typecheck && pnpm build && pnpm check:manifest && pnpm test:e2e && pnpm build && pnpm check:manifest".
    package.json now declares "engines": { "node": "^20.19.0 || >=22.12.0" }.
    tsconfig.json now includes both "playwright.config.ts" and "playwright.live.config.ts".
    playwright.config.ts uses tests/e2e, workers: 1, fullyParallel: false, retries: 1, and a local fixture web server.
    playwright.live.config.ts extends the base config and switches testDir to tests/live.
    TESTING.md currently recommends pnpm typecheck, pnpm test:e2e, and pnpm test:e2e:live, but does not define pnpm test.
    TEST_CHECKLIST.md already tracks many automated areas and can be extended instead of creating a new testing document.

Useful existing files:

    tests/e2e/options.spec.ts
    tests/e2e/slash-popup.spec.ts
    tests/e2e/gemini-slash-popup.spec.ts
    tests/e2e/platform.spec.ts
    tests/playwright/extension.ts
    tests/playwright/promptit.ts
    tests/fixtures/chatgpt-contenteditable.html
    tests/fixtures/chatgpt-textarea.html
    tests/fixtures/gemini-contenteditable.html
    src/content/controller.ts
    src/adapters/editable.ts
    src/options/usePromptEditor.ts
    src/options/App.tsx
    src/prompt/repository.ts

## Interfaces and Dependencies

Use the existing dependencies already in `package.json`: TypeScript, Vite, React, CRXJS, Tailwind, and `@playwright/test`. Do not add new dependencies for this baseline.

The `package.json` interface after Milestone 1 must include:

    "engines": {
      "node": "^20.19.0 || >=22.12.0"
    }

and:

    "scripts": {
      "test": "pnpm typecheck && pnpm build && pnpm check:manifest && pnpm test:e2e && pnpm build && pnpm check:manifest"
    }

The exact placement inside `package.json` may follow the repository's existing formatting. Preserve existing scripts.

The `tsconfig.json` include list must cover:

    "playwright.config.ts"
    "playwright.live.config.ts"

or an equivalently narrow config include that covers both.

Any Playwright helper added for F1 should be available from `LoadedExtension` in `tests/playwright/extension.ts` only if tests need it. A narrow helper can have this shape:

    setPromptMigrationCompleteMarker: () => Promise<void>

It should set `chrome.storage.local["promptit:idbMigration"]` to an object with `status: "complete"` and an ISO `completedAt` timestamp. If tests need to remove the marker, add a similarly narrow removal helper.

Any test-mode control added for F3 should stay behind the existing test mode flow in `src/content/controller.ts`. It must not affect production builds except through code guarded by the existing `IS_TEST_MODE` condition. Prefer a deferred action control that lets a test pause one prompt body read and then release it deterministically.

## Change Notes

- 2026-05-11 / Codex: Initial ExecPlan created from the 7/7 triage and read-only inspection. The plan intentionally limits the first implementation slice to deterministic command/config cleanup and F1-F4 pre-fix tests, with F5-F7 left as focused follow-up coverage.
- 2026-05-12 / Codex: Implemented the deterministic test command/config baseline, added F1-F4 pre-fix regression tests, updated testing docs, and recorded focused validation failures that are expected inputs for the later fix ExecPlans.
- 2026-05-12 / Codex: Incorporated review feedback by making the busy-state listener deterministic and the block-boundary test less coupled to adapter debug attributes.
