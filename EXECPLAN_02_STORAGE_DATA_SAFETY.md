# Storage Migration and Data Safety

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is self-contained and assumes the reader has only the current working tree plus this file.

## Purpose / Big Picture

Promptit stores saved prompts for a browser extension. Older versions stored prompt records in `chrome.storage.local.prompts`; the current version stores prompt metadata and prompt bodies in IndexedDB. The highest-risk storage finding, F1, is that a completed legacy migration writes a completion marker but never reads it when deciding whether to migrate again. If a user deletes every migrated prompt while the old legacy key remains, a later service worker restart can import those old prompts again.

After this plan is implemented, completed legacy migration is idempotent. In plain terms, once Promptit knows legacy data has already been migrated, old `prompts` data is no longer imported automatically just because IndexedDB is empty. The user can delete all prompts and they stay deleted. The plan also adds the smallest related safety work: define the legacy key policy, isolate corrupt legacy compatibility reads, add a final background message rejection boundary, and explicitly defer legacy `updatePrompt` rewrite unless a real caller is found.

## Progress

- [x] (2026-05-11 21:25:31+09:00) Read `PLANS.md` and confirmed the required ExecPlan structure.
- [x] (2026-05-11 21:25:31+09:00) Inspected `.codex/agents` and delegated read-only planning support to project `code-mapper` and `code-reviewer` subagents.
- [x] (2026-05-11 21:25:31+09:00) Inspected `src/prompt/repository.ts`, `src/prompt/storage.ts`, `src/prompt/schema.ts`, `src/prompt/indexed-db.ts`, `src/background/main.ts`, `src/background/prompt-mutations.ts`, `src/runtime/messages.ts`, and relevant Playwright helpers/tests.
- [x] (2026-05-11 21:25:31+09:00) Confirmed repository-local `rg` finds no active callers of legacy `updatePrompt` outside its own export definition.
- [x] (2026-05-11 21:25:31+09:00) Created this ExecPlan as the only new file for this planning task.
- [x] (2026-05-12 13:38:08+09:00) Added the F1 completed-marker skip regression in `EXECPLAN_01_TESTING_BASELINE.md`; this plan reuses it as already covered rather than duplicating it.
- [x] (2026-05-12 14:16:04+09:00) Implemented migration completion marker read, marker repair when IDB already contains metas, and best-effort marker repair after successful prompt mutations.
- [x] (2026-05-12 14:16:04+09:00) Preserved normal legacy recovery when no complete marker exists; the existing valid migration test still passes.
- [x] (2026-05-12 14:16:04+09:00) Added delete-all idempotence coverage proving stale legacy prompts remain in `chrome.storage.local` but do not return after all migrated IDB records are deleted.
- [x] (2026-05-12 14:16:04+09:00) Added missing-body isolation for the legacy compatibility list path and a focused regression test using a narrow test-mode getter.
- [x] (2026-05-12 14:16:35+09:00) Added the background final rejection boundary and validated existing runtime open-options/malformed-message behavior.
- [x] (2026-05-12 14:16:35+09:00) Re-checked legacy `updatePrompt()` caller/export need; no repository-local caller exists outside `src/prompt/storage.ts`, so the atomic rewrite remains deferred.
- [x] (2026-05-12 14:17:29+09:00) Ran feasible focused validation for this plan and recorded results here. Full `pnpm test` remains deferred because ExecPlan 03 and 04 test-first failures are intentionally still present.
- [x] (2026-05-12 17:34 KST) Final review found an untested delete-all edge: if the original migration marker write failed and marker repair also failed on the final migrated delete, stale legacy prompts could still be reimported. Added a failing regression before the fix.
- [x] (2026-05-12 17:37 KST) Implemented a final-delete marker preflight so the last migrated prompt is not deleted unless a stale legacy key is either absent or protected by a durable complete marker. Focused storage validation passed 8/8.

## Surprises & Discoveries

- Observation: The migration completion marker is private to `src/prompt/repository.ts` and is written by `publishLegacyMigrationCompleteBestEffort()`, but production code does not read it.
  Evidence: `PROMPT_IDB_MIGRATION_STORAGE_KEY = 'promptit:idbMigration'` exists in `src/prompt/repository.ts`; `runLegacyPromptMigration()` checks only existing IDB metas and Chrome storage API availability before reading `chrome.storage.local.prompts`.

- Observation: The legacy `prompts` key is intentionally retained after migration.
  Evidence: `runLegacyPromptMigration()` reads `LEGACY_PROMPTS_STORAGE_KEY` but does not remove it after writing IDB records. Existing tests assert legacy data remains for malformed and oversized migration cases.

- Observation: Existing migration tests cover valid migration, marker write failure after IDB commit, malformed legacy storage, and oversized body abort, but not the completed-marker skip path.
  Evidence: `tests/e2e/options.spec.ts` has tests around legacy migration and marker write failure, while `tests/playwright/extension.ts` currently has `setLegacyRawPrompts()` that removes the migration marker as part of setup.

- Observation: `src/prompt/storage.ts` exports legacy compatibility functions including `getPrompts()`, `getUserPrompts()`, `subscribeToPrompts()`, and `updatePrompt()`, but current production code imports split modern operations instead.
  Evidence: `src/options/usePromptEditor.ts` imports `createPrompt`, `deletePrompt`, `getPromptMetas`, `getPromptRecord`, `movePrompt`, `setPromptPinned`, `subscribeToPromptMetas`, `updatePromptBody`, and `updatePromptMeta`; `src/content/controller.ts` imports `getPromptBody`, `getPromptMetas`, `setPromptPinned`, and `subscribeToPromptMetas`.

- Observation: The F1 completed-marker regression was already added during the testing baseline plan.
  Evidence: `tests/e2e/options.spec.ts` contains `does not reimport legacy prompts after migration is complete`, and the focused ExecPlan 02 run passed it after the repository fix.

- Observation: The legacy compatibility list path was not reachable through the visible options UI, so the missing-body regression needed a narrow test-mode hook.
  Evidence: `src/prompt/storage.ts` now exposes `window.__promptitTestGetPrompts` only when `VITE_PROMPTIT_TEST_MODE === '1'`; the production `pnpm build` output tree-shakes this test hook out.

- Observation: Host-level cleanup after the ExecPlan 02 Playwright runs found no Playwright-owned Chrome process.
  Evidence: sandbox-external `ps -ef | rg 'chrome-devtools-mcp|puppeteer_dev_chrome_profile|/opt/google/chrome/chrome|promptit-playwright'` listed pre-existing `chrome-devtools-mcp --isolated` processes and the inspection command itself, but no `/opt/google/chrome/chrome` or `promptit-playwright` process.

- Observation: Best-effort marker repair after delete was not enough when the marker was already absent and the delete being committed was the final IDB prompt.
  Evidence: the new test `does not commit the final migrated delete when migration marker repair fails` failed before the fix because `DELETE_PROMPT_MESSAGE` returned `ok: true` while the marker write failed, leaving empty IDB plus stale legacy data.

## Decision Log

- Decision: Treat `promptit:idbMigration` with `status: "complete"` as the authoritative signal that legacy `prompts` must not be imported again when IDB is empty.
  Rationale: Retaining the legacy key while ignoring the marker is the root cause of F1. Deleting the legacy key would be more destructive and would change recovery policy. Reading the marker is the smallest behavior-preserving fix that prevents prompt resurrection.
  Date/Author: 2026-05-11 / Codex

- Decision: Do not delete `chrome.storage.local.prompts` as part of this work.
  Rationale: The existing implementation intentionally keeps legacy data as recovery input before completion. Removing it is broader, harder to recover from, and not required to stop reimport after completion.
  Date/Author: 2026-05-11 / Codex

- Decision: Best-effort write or repair the migration complete marker after successful migration and after successful modern prompt mutations.
  Rationale: The existing marker write is best-effort and may fail after IDB commit. A later successful mutation, especially delete-all, should repair the marker before the repository can become empty and vulnerable to reimport.
  Date/Author: 2026-05-11 / Codex

- Decision: Keep corrupt legacy body isolation scoped to compatibility list hydration in `src/prompt/storage.ts`.
  Rationale: Modern `getPromptBody(id)` should keep returning a controlled failure for a specific missing or corrupt body. The problematic blast radius is the legacy compatibility list path where one bad body can reject the entire list.
  Date/Author: 2026-05-11 / Codex

- Decision: Do not rewrite legacy `updatePrompt()` in the F1 patch unless a real caller is found during implementation.
  Rationale: `rg` in the planning session found no repository-local caller. Rewriting it atomically is valid future work, but including it now would enlarge the F1 fix without reducing the confirmed prompt resurrection risk.
  Date/Author: 2026-05-11 / Codex

- Decision: Reuse the F1 completed-marker skip test from ExecPlan 01 and add only the missing delete-all and missing-body tests in this plan.
  Rationale: Duplicating a regression test would slow the suite and create maintenance noise. The existing F1 test exercises the exact empty-IDB plus complete-marker hazard that this plan fixes.
  Date/Author: 2026-05-12 / Codex

- Decision: Add a test-mode-only legacy compatibility getter rather than routing options UI through deprecated `getPrompts()`.
  Rationale: The production UI correctly uses modern metadata/body APIs. Forcing the UI through deprecated compatibility code would be broader than the storage safety fix, while a test-only hook directly validates the scoped compatibility behavior and is absent from production builds.
  Date/Author: 2026-05-12 / Codex

- Decision: Require a durable complete marker before committing the final prompt delete when stale legacy data still exists.
  Rationale: Marker repair after a committed delete is too late if the write fails and IDB becomes empty. The smallest safe behavior is to fail the delete before the IDB transaction when a stale legacy key exists, no complete marker exists, and the marker cannot be written.
  Date/Author: 2026-05-12 / Codex

## Outcomes & Retrospective

This plan is implemented. The completed-marker skip test failed before the production fix in ExecPlan 01 and passed after this fix. The final review added one more marker durability regression: `does not commit the final migrated delete when migration marker repair fails`. That test failed before the final-delete preflight because delete returned success after marker repair failed, and it now passes. The focused storage run now passes 8/8 tests: valid legacy migration, completed-marker skip, delete-all stale legacy non-resurrection, final migrated delete marker-repair failure, marker-write-failure repair, malformed legacy storage, missing-body legacy compatibility isolation, and oversized legacy abort. Legacy `chrome.storage.local.prompts` is still retained; the complete marker now decides whether it remains import input. If stale legacy data exists and a final delete would make IDB empty without a complete marker, the marker must be written before delete commits. Missing body data is skipped only in the legacy compatibility list path, while direct modern body reads still return a not-found response. The background final catch was added and existing runtime platform tests still pass. No active `updatePrompt()` caller was found, so the atomic rewrite remains deferred.

## Context and Orientation

Promptit has three storage-facing layers.

The repository layer is `src/prompt/repository.ts`. It directly owns IndexedDB reads and writes through `src/prompt/indexed-db.ts`. It also owns legacy migration from `chrome.storage.local.prompts` into IndexedDB. Every modern repository operation first calls `ensurePromptStorageReady()`, which caches `runLegacyPromptMigration()` in `storageReadyPromise`.

The runtime client layer is `src/prompt/storage.ts`. Options UI and content scripts import this file. It does not write IndexedDB directly; it sends messages through `chrome.runtime.sendMessage`, then parses typed responses from `src/runtime/messages.ts`. This file also contains legacy compatibility functions that return the old `PromptItem` shape.

The background layer is `src/background/main.ts` and `src/background/prompt-mutations.ts`. `main.ts` registers the Chrome runtime message listener. Prompt requests are routed into `handlePromptRequest()` in `prompt-mutations.ts`, which serializes prompt work through a promise queue and catches most prompt request errors.

Important data terms:

`PromptMeta` is the IndexedDB metadata record for a prompt. It includes id, title, pinned state, order, timestamps, and character count.

`PromptBody` is the IndexedDB body record for a prompt. It includes id, content, and updatedAt.

`PromptRecord` is the combined modern shape made from one `PromptMeta` plus one `PromptBody`.

`PromptItem` is the old legacy shape stored in `chrome.storage.local.prompts`. It combines title, content, `sortOrder`, and timestamps in one object.

The legacy key is `LEGACY_PROMPTS_STORAGE_KEY = 'prompts'` in `src/prompt/schema.ts`. The migration marker key is currently a private constant in `src/prompt/repository.ts`: `promptit:idbMigration`.

Current F1 flow:

1. Options page or content popup asks for prompts through `getPromptMetas()` or `getPromptBody()`.
2. `src/prompt/storage.ts` sends a runtime message.
3. `src/background/main.ts` routes the prompt message to `handlePromptRequest()`.
4. `src/background/prompt-mutations.ts` calls repository functions such as `listPromptMetas()` or `getPromptBody()`.
5. The repository calls `ensurePromptStorageReady()`.
6. `runLegacyPromptMigration()` reads all `promptMetas`.
7. If at least one meta exists, migration returns.
8. If no Chrome storage API exists, migration returns.
9. Otherwise, migration reads `chrome.storage.local.prompts`, decodes valid legacy items, writes IDB records, writes `promptit:idbMigration`, and publishes a prompt revision.

The bug is in step 9. A completed marker is written after migration but not checked before reading legacy prompts. Because legacy prompts are kept, an empty IDB can be treated as "needs migration" even when it actually means "the user deleted all prompts after migration."

## Plan of Work

Start with tests. In `tests/playwright/extension.ts`, add only the narrow helper needed to set and inspect the migration marker. Prefer names like `setPromptMigrationCompleteMarker()`, `getPromptMigrationMarker()`, and `removePromptMigrationMarker()` over a broad arbitrary storage setter. `setLegacyRawPrompts()` currently removes the marker, so the F1 test needs a way to seed legacy data and then set the complete marker again.

In `tests/e2e/options.spec.ts`, add the F1 regression test first. Seed valid legacy prompts, set the complete migration marker, keep IDB empty, open the options page, and assert the legacy prompt titles do not appear and `extension.getPromptRecords()` returns an empty array. This test should fail before the production fix because current migration ignores the marker.

Add a second idempotence test for the delete-all scenario. Seed legacy prompts with no marker, open the options page so migration imports them, delete every migrated prompt through the existing UI or runtime message path, trigger a fresh read path in a way that simulates a later service worker lifetime if practical, and assert that the old legacy prompts do not return. If directly restarting the service worker is hard, the test may prove the same policy by ensuring the marker exists after delete-all and then reopening options with empty IDB plus stale legacy key. The important user-visible result is that deleted prompts stay deleted.

Then implement the marker policy in `src/prompt/repository.ts`. Add a small parser for the marker object. The parser should accept only an object whose `status` is exactly `"complete"` and whose `completedAt`, when present, is a valid timestamp. Invalid or missing marker values should be ignored so existing recovery behavior still works. Update `runLegacyPromptMigration()` so the decision order is:

1. Read existing `promptMetas`.
2. If at least one meta exists, best-effort ensure the complete marker exists and return.
3. If Chrome storage is unavailable, return.
4. Read the migration marker.
5. If the marker is valid complete, return without reading or decoding legacy `prompts`.
6. Otherwise, read and migrate legacy `prompts` as today.

This ordering avoids unnecessary legacy decoding after completion and preserves migration when there is no valid marker.

After successful migration, keep writing the complete marker as today. Also add a reusable best-effort function that successful modern mutations can call after committed prompt changes. The smallest reliable option is to call it from background mutation handlers after successful create, update meta, update body, delete, move, and pin changes, next to `publishPromptRevisionBestEffort()`. This repairs the marker when the original marker write failed but later prompt mutations succeed. If implementation shows this duplicates too much code, wrap both best-effort calls in one helper such as `publishPromptStorageSideEffectsBestEffort()`.

Keep the legacy key policy conservative. Do not remove `chrome.storage.local.prompts` in this patch. Once a complete marker exists, the key is treated as stale recovery history and not production import input. Before a complete marker exists, valid legacy prompts remain recovery input.

Next, add corrupt body isolation for legacy compatibility reads in `src/prompt/storage.ts`. `getLegacyPromptItems()` currently maps every meta to `getPromptBody(meta.id)` inside `Promise.all`, so one missing or corrupt body rejects the whole list. Replace that compatibility-list behavior with per-record isolation: for each meta, try to read its body; if the body read fails, log a concise warning and skip that prompt in the legacy list. Keep direct `getPromptBody(id)` behavior strict for modern callers. `getLegacyPromptFromMeta()` used for conflict response conversion can keep throwing if the specific conflicting record has no readable body, or it can return a minimal error response if implementation finds an existing response path. Do not silently invent empty prompt bodies.

Add a small regression test for corrupt body isolation only after the F1 marker tests are in place. The test can corrupt or delete one `promptBodies` record through a narrow test helper, call a legacy compatibility surface such as `getPrompts()` or a path that uses `getLegacyPromptItems()`, and assert that valid prompts are still returned while the corrupt one is skipped. If exposing `getPrompts()` to a Playwright runtime page is awkward, defer this specific test to the same implementation slice that modifies `storage.ts` and record the reason in `Outcomes & Retrospective`.

Add the background final catch in `src/background/main.ts`. The existing prompt handler catches most prompt errors inside `prompt-mutations.ts`, but `main.ts` currently attaches only `.then(sendResponse)`. Replace it with a final success and failure path. On unexpected rejection, send a structured response using the same runtime response builders already used elsewhere: prompt messages should get `buildPromptErrorResponse(request.type, message)`, and open-options messages should get `buildOpenOptionsPageErrorResponse(message)`. Keep returning `true` so Chrome keeps the message channel open. This is a boundary hardening change and should not change successful behavior.

Finally, confirm legacy `updatePrompt()` scope before any rewrite. Run a repository search for `updatePrompt(`, `LegacyUpdatePromptResponse`, `getPrompts`, and `subscribeToPrompts`. If no real caller is found, leave `updatePrompt()` as a documented deferred compatibility risk in this plan's retrospective or in the code review notes. If a real caller is found, do not keep the split meta-then-body behavior. Instead, add one repository-level combined update that writes meta and body in a single IndexedDB transaction, and route `updatePrompt()` through that. This conditional work should not be done unless the caller check proves the API is still live.

## Concrete Steps

Work from the repository root:

    cd /home/seok/code/promptit

Confirm the starting state:

    git status --short
    rg -n "updatePrompt\\(|LegacyUpdatePromptResponse|getPrompts\\b|getUserPrompts\\b|subscribeToPrompts\\b" src tests

The caller search should currently show `src/prompt/storage.ts`, `src/options/usePromptEditor.ts`, and `src/content/controller.ts` using modern split APIs, with no repository-local caller of legacy `updatePrompt()` outside its definition. If it shows an actual caller, update this plan before implementation.

Milestone 1 is test-first coverage for F1. Add marker helper methods in `tests/playwright/extension.ts` and add the completed-marker skip test in `tests/e2e/options.spec.ts`. Run:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "migration|marker|legacy"

Before the production fix, the new completed-marker skip test should fail because legacy prompts are imported. Existing migration tests should keep passing except for the expected failure of the new test. Record that result in `Outcomes & Retrospective`.

Milestone 2 implements marker skip and idempotence. Edit `src/prompt/repository.ts` and, if needed for side-effect publishing, `src/background/prompt-mutations.ts`. The expected behavior is that a valid complete marker blocks legacy import when IDB is empty, while absence of the marker preserves current recovery migration. Run the same focused options command:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "migration|marker|legacy"

Acceptance for Milestone 2 is that the new completed-marker skip test passes, existing valid migration still passes, marker-write-failure after IDB commit still leaves migrated prompts readable, malformed legacy storage still does not create records, and oversized legacy body behavior remains whatever this milestone explicitly preserves.

Milestone 3 proves delete-all safety. Add or refine the delete-all idempotence test in `tests/e2e/options.spec.ts`. The test must leave stale legacy `prompts` in `chrome.storage.local`, delete all migrated IDB records through the app or runtime mutation path, then prove the stale legacy records do not return. Run:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "delete|migration|marker|legacy"

Acceptance for Milestone 3 is that the old legacy prompt titles remain absent and `extension.getPromptRecords()` stays `[]`.

Milestone 4 isolates legacy compatibility body failures. First add the narrowest test helper necessary to create a missing or corrupt body for one meta. Then update `src/prompt/storage.ts` so legacy list hydration skips only the bad record. Run a focused test command for the new compatibility test. If the test lives in `options.spec.ts`, use:

    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "corrupt|missing|body|legacy"

Acceptance for Milestone 4 is that one bad body no longer prevents valid legacy compatibility records from being listed, and modern direct body reads still surface a controlled failure for the requested id.

Milestone 5 hardens the final background boundary. Edit `src/background/main.ts` so every recognized runtime request either resolves through `sendResponse` or rejects into a structured error response. Add a targeted test only if it can be done without introducing a broad fake runtime route. If direct test coverage would require intrusive test-only APIs, validate with `pnpm typecheck`, existing runtime/platform tests, and code review. Run:

    pnpm typecheck
    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/platform.spec.ts tests/e2e/options.spec.ts --grep "runtime|malformed|storage|migration|marker|legacy"

Milestone 6 runs the full deterministic validation. If `EXECPLAN_01_TESTING_BASELINE.md` has already been implemented and `pnpm test` exists, run:

    pnpm test

If the default test script has not yet been implemented, run the current repository commands:

    pnpm typecheck
    pnpm build
    pnpm test:e2e

After Playwright runs, check test-owned browser cleanup:

    ps -ef | rg 'chrome-devtools-mcp|puppeteer_dev_chrome_profile|/opt/google/chrome/chrome'

Only stop processes that are clearly test-owned, not the user's regular browser.

## Validation and Acceptance

The F1 fix is accepted only when a deterministic test proves all of the following:

A valid `promptit:idbMigration` marker with `status: "complete"` prevents legacy `chrome.storage.local.prompts` from being imported when IDB is empty.

Without a valid complete marker, existing valid legacy migration still imports valid prompts, filters invalid items and starter prompt records, writes `promptMetas` and `promptBodies`, writes the marker, and publishes prompt revision.

After successful migration and later delete-all, stale legacy `prompts` do not reappear.

If the original marker write fails after IDB commit, later successful modern prompt mutations repair the complete marker before the empty-IDB reimport hazard can occur.

The legacy `prompts` key is not deleted by this work.

No prompt body is written back into `chrome.storage.local`; production prompt bodies remain in IndexedDB.

Corrupt or missing body data in a legacy compatibility list path does not reject the whole list. Valid records remain readable. Direct modern reads for a specific missing body still return a controlled not-found or error response.

Unexpected background message rejections are caught at the final listener boundary and converted to structured runtime responses.

Legacy `updatePrompt()` is either confirmed unused and deferred, or, if a real caller is found, updated to use an atomic repository-level write path with regression coverage.

The final validation must include focused tests for the changed storage cases and the full deterministic suite available in this repository. Live ChatGPT/Gemini smoke tests are not required for this storage safety plan.

## Idempotence and Recovery

The migration code must be safe to run more than once. Running it with a complete marker must be a no-op. Running it without a marker and with valid legacy prompts must either fully write both meta and body records or fail without partial IDB migration. IndexedDB transactions already provide atomic writes for the migration's two stores; keep using that pattern.

Do not remove legacy `prompts` during this work. If a future migration policy chooses to delete it, that needs a separate plan with backup and recovery semantics. This plan prevents automatic reimport through the completion marker instead.

If a marker value is malformed, ignore it and proceed with current recovery behavior. Do not treat malformed marker values as complete. If marker writing fails, log the failure and keep prompt operations working; later successful mutations should best-effort repair the marker.

If a new test helper corrupts IndexedDB body data, keep the helper local to tests and make it precise. It should not become a general destructive storage mutation API unless multiple tests truly need that generality.

## Artifacts and Notes

Planning-session evidence:

    src/prompt/repository.ts defines PROMPT_IDB_MIGRATION_STORAGE_KEY = 'promptit:idbMigration'.
    runLegacyPromptMigration() currently reads promptMetas and returns when any meta exists.
    runLegacyPromptMigration() currently reads chrome.storage.local.prompts when IDB has no metas.
    publishLegacyMigrationCompleteBestEffort() writes the marker after migration but no production code reads it.
    src/prompt/storage.ts legacy getLegacyPromptItems() uses Promise.all over getPromptBody(meta.id), so one bad body rejects the whole compatibility list.
    src/background/main.ts uses responsePromise.then(sendResponse) without a final rejection handler.
    src/background/prompt-mutations.ts already catches normal prompt request errors and builds prompt error responses.
    tests/playwright/extension.ts setLegacyRawPrompts() empties IDB, sets legacy prompts, and removes promptit:idbMigration.
    tests/e2e/options.spec.ts already covers valid migration, marker write failure after IDB commit, malformed legacy storage, and oversized legacy body abort.

Useful focused commands:

    rg -n "runLegacyPromptMigration|promptit:idbMigration|LEGACY_PROMPTS_STORAGE_KEY|updatePrompt\\(" src tests
    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 playwright test tests/e2e/options.spec.ts --grep "migration|marker|legacy"
    pnpm typecheck
    pnpm build
    pnpm test:e2e

## Interfaces and Dependencies

Use only existing project dependencies: TypeScript, Vite, CRXJS, React, and Playwright. Do not add a storage library, a new test runner, or new browser automation tooling.

In `src/prompt/repository.ts`, add a narrow marker parser. The implementation can use a private type like:

    type LegacyMigrationMarker = {
      status: 'complete';
      completedAt?: string;
    };

Provide private helpers with stable behavior:

    async function getLegacyMigrationMarker(): Promise<LegacyMigrationMarker | null>
    function parseLegacyMigrationMarker(value: unknown): LegacyMigrationMarker | null
    async function ensureLegacyMigrationCompleteMarkerBestEffort(): Promise<void>

The exact names may vary, but their responsibilities must remain separate: parse, read, and best-effort write.

In `src/background/prompt-mutations.ts`, if marker repair is called after successful mutations, keep it best-effort and do not let marker write failure turn a successful prompt mutation into a user-visible save failure. If both revision publish and marker repair are needed, use a helper that logs each failure separately.

In `src/background/main.ts`, final catch behavior must build responses compatible with `src/runtime/messages.ts`. Prompt requests should use `buildPromptErrorResponse(request.type, message)`. Open-options requests should use `buildOpenOptionsPageErrorResponse(message)`.

In `tests/playwright/extension.ts`, expose only narrow marker helpers if possible:

    setPromptMigrationCompleteMarker: () => Promise<void>
    getPromptMigrationMarker: () => Promise<unknown>
    removePromptMigrationMarker: () => Promise<void>

If the implementation needs to simulate a failed marker write, reuse existing `failPromptStorageKeyWritesOnce()` with the key `promptit:idbMigration`.

In `src/prompt/storage.ts`, keep modern direct APIs strict:

    getPromptBody(id): Promise<PromptBody>
    getPromptRecord(id): Promise<PromptRecord>

Only the legacy list compatibility path should skip bad records:

    getPrompts(): Promise<PromptItem[]>
    getUserPrompts(): Promise<PromptItem[]>
    subscribeToPrompts(listener)

Do not silently convert corrupt bodies to empty strings. Empty prompt bodies are invalid in the schema.

## Change Notes

- 2026-05-11 / Codex: Initial ExecPlan created from the 7/7 triage and read-only storage/background inspection. The plan prioritizes F1 marker idempotence and delete-all safety, keeps legacy key deletion out of scope, adds compatibility body isolation and final background catch as bounded follow-ups, and defers legacy `updatePrompt()` rewrite unless a real caller is found.
- 2026-05-12 / Codex: Implemented marker read/repair, delete-all idempotence coverage, missing-body compatibility isolation, and the background final catch. Recorded focused validation and the continued deferral of legacy `updatePrompt()` atomic rewrite because no caller exists.
