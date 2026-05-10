# Move Prompt Storage to IndexedDB

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository contains `PLANS.md` at the repository root. Maintain this document according to that file: keep it self-contained, update it when implementation discoveries change the design, and make every milestone independently verifiable.

## Purpose / Big Picture

Promptit previously stored every saved prompt as one full object in `chrome.storage.local`. That meant opening the prompt list read every prompt body, and changing a title or order rewrote the body text even when the body did not change. In the current tree, IndexedDB is the production prompt database, prompt metadata and prompt body text are stored separately, and opening the slash popup or options prompt list reads only small metadata records. The body is read only when the user selects, copies, inserts, or edits a specific prompt.

The user-visible behavior must remain familiar: users can create, edit, delete, copy, and insert prompts from ChatGPT and Gemini surfaces. The new behavior to prove is that a prompt body up to `500 * 1024` UTF-8 bytes can be saved, oversized bodies are rejected without truncation, pinned prompts render above normal prompts, and metadata-only edits do not rewrite the body store.

## Progress

- [x] 2026-05-09 KST: Read `PLANS.md` and confirmed the required ExecPlan structure.
- [x] 2026-05-09 KST: Inspected current storage schema in `src/prompt/schema.ts`, `src/prompt/storage.ts`, `src/background/prompt-mutations.ts`, and `src/runtime/messages.ts`.
- [x] 2026-05-09 KST: Inspected current options and content-script consumers in `src/options/usePromptEditor.ts`, `src/options/App.tsx`, `src/content/controller.ts`, and `src/content/launcher-items.ts`.
- [x] 2026-05-09 KST: Inspected Playwright helpers and test areas in `tests/playwright/extension.ts`, `tests/playwright/promptit.ts`, `tests/e2e/options.spec.ts`, `tests/e2e/slash-popup.spec.ts`, and `tests/e2e/gemini-slash-popup.spec.ts`.
- [x] 2026-05-09 KST: Created this root-level ExecPlan file.
- [x] 2026-05-10 KST: Verified the current tree contains the IndexedDB schema and repository layer in `src/prompt/indexed-db.ts`, `src/prompt/repository.ts`, `src/prompt/order.ts`, and `src/prompt/schema.ts`.
- [x] 2026-05-10 KST: Verified runtime messages and background mutation handling are metadata/body-aware and publish only a revision marker through `chrome.storage.local`.
- [x] 2026-05-10 KST: Verified options and content-script flows read metadata lists first and fetch bodies on select, copy, or edit.
- [x] 2026-05-10 KST: Verified legacy `chrome.storage.local.prompts` migration remains in `src/prompt/repository.ts` and keeps the legacy key for recovery.
- [x] 2026-05-10 KST: Verified Playwright helpers and tests now cover `promptMetas`, `promptBodies`, 500 KiB body limit, pinned ordering, body-on-select reads, conflict handling, and legacy migration scenarios.
- [x] 2026-05-10 KST: Focused validation completed: `pnpm typecheck` passed, `pnpm build:test` passed, options focused suite passed 27/27, and slash plus Gemini focused suites passed 47/47.
- [x] 2026-05-10 KST: Reviewer findings were addressed: revision publish is best-effort after committed mutations, and runtime mutation timestamps are required except delete's optional body timestamp.
- [x] 2026-05-10 KST: Migration marker post-commit failure issue was fixed and covered by regression testing.
- [ ] Broader full `pnpm test:e2e` and live suites were not run for this slice.

## Surprises & Discoveries

- Observation: The content popup used to carry prompt bodies in every list item, but the current tree now keeps launcher items metadata-only.
  Evidence: `src/content/controller.ts` calls `getPromptMetas()` before opening the popup and calls `getPromptBody(id)` in the body-on-select/copy path.

- Observation: The options page list no longer renders body preview text from list records.
  Evidence: `src/options/App.tsx` renders prompt status, order, `charCount`, `updatedAt`, and `bodyUpdatedAt`; the editor body is loaded after a prompt is selected.

- Observation: IndexedDB still has no cross-context change event equivalent to `chrome.storage.onChanged`, so the migration keeps a small revision marker in `chrome.storage.local`.
  Evidence: `src/prompt/storage.ts` subscribes to `PROMPT_REVISION_STORAGE_KEY`, and `src/prompt/repository.ts` writes that key from `publishPromptRevision()`.

- Observation: Tests now seed and inspect production prompt state through IndexedDB helper records, while retaining legacy storage helpers for migration-only scenarios.
  Evidence: `tests/playwright/extension.ts` exposes `setPromptRecords`, `getPromptMetas`, `getPromptBody`, `setLegacyRawPrompts`, and `getRawChromeStorage`.

- Observation: Legacy `PromptItem`, `sortOrder`, and `PROMPTS_STORAGE_KEY` remain in schema/storage code as compatibility names for migration and older helper callers.
  Evidence: `src/prompt/schema.ts` keeps `PromptItem`, `sortPrompts`, `decodeStoredPrompts`, and `PROMPTS_STORAGE_KEY = LEGACY_PROMPTS_STORAGE_KEY`; production repository operations use `PromptMeta`, `PromptBody`, `normalOrder`, and `pinnedOrder`.

- Observation: Revision publication is intentionally best-effort after a mutation commits.
  Evidence: reviewer follow-up confirmed the finding was addressed; this preserves committed IndexedDB changes even if the small `chrome.storage.local` revision notification fails.

- Observation: Migration marker publication failure after a committed migration no longer invalidates the migrated IndexedDB data path.
  Evidence: the migration marker post-commit failure issue was fixed and regression-tested in the options focused suite.

## Decision Log

- Decision: Use IndexedDB as the only production storage for prompt metadata and prompt bodies.
  Rationale: This satisfies the core requirement that `chrome.storage.local` must not store prompt body text and keeps large bodies out of list reads.
  Date/Author: 2026-05-09 / Codex

- Decision: Keep IndexedDB access centralized in the extension background service worker through a repository module, and expose it to options/content code through runtime messages.
  Rationale: This preserves the current architecture where mutations are serialized in background code, avoids content-script origin confusion, and gives one place for migration, conflict checks, and error handling.
  Date/Author: 2026-05-09 / Codex

- Decision: Use `chrome.storage.local` only for small control records: a prompt storage revision marker, migration markers, and existing test-only flags.
  Rationale: IndexedDB has no cross-context change event equivalent to `chrome.storage.onChanged`. A small revision marker lets existing options/content subscribers know when to refetch metadata without storing prompt text in `chrome.storage.local`.
  Date/Author: 2026-05-09 / Codex

- Decision: Use gap-based integer ordering first. The initial gap is `1_000_000`; midpoints are used for move/insert operations; a group is renumbered only when there is no integer gap.
  Rationale: Gap integers are simple, deterministic, easy to inspect in tests, and match the user's proposed `1000000`, `2000000`, `3000000` style. Fractional indexing can be introduced later behind the same move interface if needed.
  Date/Author: 2026-05-09 / Codex

- Decision: Preserve `normalOrder` when pinning and unpinning. `pinnedOrder` is meaningful only while `pinned` is true.
  Rationale: This directly supports the requirement that unpinning restores the original normal-list position.
  Date/Author: 2026-05-09 / Codex

- Decision: Enforce the body limit with UTF-8 byte length, not JavaScript string length.
  Rationale: The requirement is `500 * 1024` bytes. JavaScript strings count UTF-16 code units, which is not the same as stored byte size for Korean text and emoji. Use `new TextEncoder().encode(content).byteLength`.
  Date/Author: 2026-05-09 / Codex

- Decision: Store `charCount` as user-perceived Unicode code point count with `Array.from(content).length`.
  Rationale: `charCount` is metadata for display and quick inspection, while byte length is the storage limit. Keeping both concepts separate avoids mislabeling byte count as characters.
  Date/Author: 2026-05-09 / Codex

- Decision: Do not delete legacy `chrome.storage.local.prompts` during the first migration implementation.
  Rationale: Keeping the old data for one release gives a safe recovery path if migration or IndexedDB code has an unexpected failure. Production code must stop reading it after successful migration except for explicit migration/recovery paths.
  Date/Author: 2026-05-09 / Codex

- Decision: Treat `sortOrder` as legacy/API compatibility language and document production ordering as `pinnedOrder` plus `normalOrder`.
  Rationale: Current tests and helper factories still accept `sortOrder` for concise setup, but IndexedDB metadata stores order separately for pinned and normal groups.
  Date/Author: 2026-05-10 / Codex

- Decision: Require runtime mutation timestamps, except for delete's optional body timestamp.
  Rationale: Required `expectedUpdatedAt` / `expectedBodyUpdatedAt` values preserve optimistic conflict detection for normal mutations. Delete may omit body timestamp when the caller only has metadata, while still checking it when supplied.
  Date/Author: 2026-05-10 / Codex

## Outcomes & Retrospective

The current tree implements the planned storage migration. Production prompt data is split between IndexedDB object stores named `promptMetas` and `promptBodies`. `chrome.storage.local` is retained for revision notifications, migration markers, legacy `prompts` recovery input, and test flags such as failure simulation. Options and content flows list metadata first and fetch bodies only when the user selects, copies, inserts, or edits a prompt.

Validation evidence in the tree includes targeted Playwright tests for no production body writes to `chrome.storage.local`, exact `500 * 1024` byte body acceptance, oversized body rejection without truncation, metadata-only save leaving body records unchanged, body save updating `bodyUpdatedAt` and `charCount`, pinned ordering and unpin restore behavior, legacy migration, migration marker post-commit failure regression, and body-on-select/copy reads. Focused validation is now complete: `pnpm typecheck` passed, `pnpm build:test` passed, the options focused suite passed 27/27, and the slash plus Gemini focused suites passed 47/47. Broader full `pnpm test:e2e` and live suites were not run for this slice.

## Context and Orientation

Promptit is a Chromium Manifest V3 browser extension built with Vite, TypeScript, React for the options page, and vanilla DOM for content-script UI. The background entry is `src/background/service-worker.ts`, which calls `registerBackgroundHandlers()` from `src/background/main.ts`. Content scripts run on supported AI sites and are orchestrated by `src/content/controller.ts`. The options page uses `src/options/App.tsx` and state logic in `src/options/usePromptEditor.ts`.

The legacy prompt model is `PromptItem` in `src/prompt/schema.ts`. It contains `id`, `title`, `content`, `sortOrder`, `createdAt`, and `updatedAt`. The legacy storage key is `LEGACY_PROMPTS_STORAGE_KEY = 'prompts'`. Current production code does not store prompt bodies there; it reads that key only for migration/recovery when IndexedDB is empty. Compatibility exports and helper names remain where older tests or migration code need to translate legacy records.

The new model splits one prompt into two records. A metadata record is a small object used for lists and ordering. A body record is the large prompt text. These records share the same `id`.

IndexedDB is a browser database available to extension pages and service workers. In this plan, an object store is a named collection inside IndexedDB, similar to a table. A transaction is one atomic operation over one or more stores; if it fails, all writes in that transaction are rolled back. Use transactions whenever metadata and body records must change together.

The target database is:

    database name: promptit
    database version: 1
    object store: promptMetas, keyPath: id
    object store: promptBodies, keyPath: id

The target metadata record is:

    type PromptMeta = {
      id: string;
      title: string;
      pinned: boolean;
      normalOrder: number;
      pinnedOrder: number | null;
      createdAt: string;
      updatedAt: string;
      bodyUpdatedAt: string;
      charCount: number;
    };

The target body record is:

    type PromptBody = {
      id: string;
      content: string;
      updatedAt: string;
    };

The target combined record, used only when a screen truly needs both metadata and body, is:

    type PromptRecord = PromptMeta & {
      content: string;
    };

Sorting rules are:

    1. pinned prompts first
    2. among pinned prompts, smaller pinnedOrder first
    3. among normal prompts, smaller normalOrder first
    4. if order values tie, earlier createdAt first
    5. if still tied, lexical id order

## Plan of Work

The implemented schema keeps legacy `PromptItem` and legacy decoding for migration tests, and adds `PromptMeta`, `PromptBody`, `PromptRecord`, `PromptDraft`, `PromptMetaDraft`, `PromptBodyDraft`, `PromptOrderGroup`, and constants `PROMPT_BODY_MAX_BYTES = 500 * 1024`, `PROMPT_ORDER_GAP = 1_000_000`, `PROMPT_REVISION_STORAGE_KEY = 'promptit:promptsRevision'`, `LEGACY_PROMPTS_STORAGE_KEY = 'prompts'`, and `STARTER_PROMPT_ID`. Production list sorting uses `sortPromptMetas`; legacy `sortPrompts` remains only for legacy prompt compatibility. Validation rejects blank bodies, titles outside 1-40 trimmed characters, non-integer order values, invalid timestamps, negative or non-finite order values, and bodies whose UTF-8 byte length exceeds `PROMPT_BODY_MAX_BYTES`.

Add `src/prompt/indexed-db.ts` as a small wrapper over browser IndexedDB. It should contain Promise-based helpers for opening the database, starting readonly/readwrite transactions, reading all records from a store, reading by id, putting records, and deleting records. Keep this wrapper functional: avoid classes, return plain promises, and add narrow helper functions around `IDBRequest`. Because the Manifest V3 background worker can be suspended, do not rely on long-lived in-memory state for correctness. It is acceptable to cache the open database promise for performance, but every repository operation must work if the service worker restarts and opens the database again.

Add `src/prompt/order.ts` for order-value operations. Implement `getInitialOrder(index)`, `getOrderBetween(previousOrder, nextOrder)`, and `renumberPromptMetasForGroup(metas, group)`. A group is either pinned or normal. `getOrderBetween` returns a midpoint integer when possible. If there is no integer between adjacent values, repository code renumbers only the affected group with `PROMPT_ORDER_GAP`. Keep fractional indexing out of the first implementation; the module boundary makes a later replacement straightforward.

Add `src/prompt/repository.ts` for database-level prompt operations. This module owns all production prompt reads and writes. It should export functions named `listPromptMetas`, `getPromptBody`, `getPromptRecord`, `createPrompt`, `updatePromptMeta`, `updatePromptBody`, `deletePrompt`, `movePrompt`, `setPromptPinned`, `ensurePromptStorageReady`, and `runLegacyPromptMigration`. This module must use transactions so create writes meta/body together, delete removes meta/body together, and body updates write `promptBodies` plus `promptMetas.bodyUpdatedAt` and `promptMetas.charCount` together.

Keep the current background mutation queue idea in `src/background/prompt-mutations.ts`, but make it call repository operations instead of `chrome.storage.local.prompts`. Mutation queue means only one write operation runs at a time. This is still useful because move, pin, unpin, and update operations use optimistic conflict checks against timestamps. Every successful mutation must call a small `publishPromptRevision()` helper that writes only a revision object to `chrome.storage.local` under `PROMPT_REVISION_STORAGE_KEY`.

Expand `src/runtime/messages.ts` so the runtime contract matches the split storage model. Preserve the existing open-options message. Replace or extend prompt messages with:

    promptit/list-prompt-metas
    promptit/get-prompt-body
    promptit/create-prompt
    promptit/update-prompt-meta
    promptit/update-prompt-body
    promptit/delete-prompt
    promptit/move-prompt
    promptit/set-prompt-pinned

The response pattern should stay explicit: `success`, `not-found`, `conflict`, and `error`. Metadata conflicts use `expectedUpdatedAt`. Body conflicts use `expectedBodyUpdatedAt` or `expectedBodyUpdatedAt` plus current meta when the body timestamp is surfaced through metadata. Delete should check both the current meta `updatedAt` and body `bodyUpdatedAt` when the caller has both values; at minimum it must check meta `updatedAt`.

Rewrite `src/prompt/storage.ts` as the client facade for options and content code. It should no longer read or repair `chrome.storage.local.prompts` in production flows. It should call background runtime messages and export:

    getPromptMetas(): Promise<PromptMeta[]>
    getPromptBody(id: string): Promise<PromptBody>
    getPromptRecord(id: string): Promise<PromptRecord>
    createPrompt(draft: PromptDraft): Promise<PromptRecord>
    updatePromptMeta(id: string, draft: PromptMetaDraft, options): Promise<UpdatePromptMetaResponse>
    updatePromptBody(id: string, content: string, options): Promise<UpdatePromptBodyResponse>
    deletePrompt(id: string, options): Promise<DeletePromptResponse>
    movePrompt(id: string, request): Promise<MovePromptResponse>
    setPromptPinned(id: string, pinned: boolean, options): Promise<SetPromptPinnedResponse>
    subscribeToPromptMetas(listener: (metas: PromptMeta[]) => void): () => void

`subscribeToPromptMetas` should listen for `chrome.storage.onChanged` on `PROMPT_REVISION_STORAGE_KEY`. When the revision changes, it should call `getPromptMetas()` and pass the sorted metadata to the listener. This preserves cross-tab and content-popup updates without storing bodies in `chrome.storage.local`.

Update `src/options/usePromptEditor.ts` so list state is `PromptMeta[]`, not `PromptItem[]`. Selecting a prompt becomes asynchronous: set a loading state for the editor, call `getPromptRecord(id)`, and then fill the form. Track `expectedUpdatedAt` and `expectedBodyUpdatedAt` separately in edit mode. When submitting an edit, compare the original active record to the current form and send metadata update only if `title`, pinned state, or order fields changed. Send body update only if `content` changed. A save that changes both meta and body can run as two sequential mutations, meta first then body, or through a combined background message. Prefer a combined `promptit/update-prompt` only if it still avoids writing the body when body text is unchanged. The simpler explicit route is separate meta and body messages with conflict handling after each.

Update `src/options/App.tsx` to remove body preview from the list. Replace it with metadata that does not require body reads: pinned badge, normal or pinned order, `charCount`, `updatedAt`, and `bodyUpdatedAt`. Keep the edit textarea exactly where the actual body is needed. Add a clear loading state when a user selects a prompt and the body is being fetched. Keep validation focus behavior for title, content, and order fields.

Update `src/content/launcher-items.ts` so a prompt launcher item contains metadata only: `id`, `title`, `pinned`, order fields, timestamps, `charCount`, `kind`, and `action`. It must not contain `content`.

Update `src/content/controller.ts` so opening `/ ` calls `getPromptMetas()` and renders metadata. In `handleSelection` and `handleCopy`, when the item is a prompt, call `getPromptBody(item.id)` before insert or copy. If body read fails, keep the popup open, restore focus, clear busy state, and show an error toast such as `프롬프트 본문을 읽지 못했습니다.`. The current test-only `failPromptRead` can remain for list reads, and add a new test control such as `failPromptBodyRead` for body-on-select failures.

Implement legacy migration in `src/prompt/repository.ts` or `src/background/prompt-migration.ts`. On first storage initialization, check whether IndexedDB has any `promptMetas`. If it has records, do not migrate. If it is empty, read `chrome.storage.local.prompts`, decode it with the existing legacy decoder, and write converted records into IndexedDB in one transaction. For each legacy prompt at sorted index `index`, write:

    meta.id = legacy.id
    meta.title = legacy.title
    meta.pinned = false
    meta.normalOrder = (index + 1) * PROMPT_ORDER_GAP
    meta.pinnedOrder = null
    meta.createdAt = legacy.createdAt
    meta.updatedAt = legacy.updatedAt
    meta.bodyUpdatedAt = legacy.updatedAt
    meta.charCount = Array.from(legacy.content).length
    body.id = legacy.id
    body.content = legacy.content
    body.updatedAt = legacy.updatedAt

If any legacy body exceeds `PROMPT_BODY_MAX_BYTES`, abort the transaction and do not partially migrate. Surface a clear error that names the title or id of the first oversized prompt. Do not delete the legacy key in this plan. After successful migration, write a small marker such as `promptit:idbMigration = { status: 'complete', completedAt }` and publish a prompt revision.

Update Playwright helpers in `tests/playwright/extension.ts`. Replace `getPrompts`, `setPrompts`, and `setRawPrompts` with helpers that talk to the background runtime API or inspect IndexedDB from the extension service worker. Keep a legacy seeding helper named `setLegacyRawPrompts` only for migration tests. Add helpers:

    getPromptMetas()
    getPromptBody(id)
    getPromptRecords()
    setPromptRecords(records)
    getLegacyPrompts()
    setLegacyRawPrompts(rawValue)
    getPromptStorageRevision()

Update `tests/playwright/promptit.ts` so fixture factory functions create the new meta/body shape. Keep a helper that creates legacy `PromptItem` objects for migration-only tests.

Update existing E2E tests. Tests that assert prompt lists should assert metadata list behavior. Tests that assert insertion or copy should still assert actual body text. Tests that relied on invalid `chrome.storage.local.prompts` repair should be moved to migration tests or replaced with IndexedDB decode/validation tests. The old "normalizes invalid storage entries before rendering" behavior becomes "migrates valid legacy entries, ignores starter prompt, rejects malformed legacy storage safely" if legacy storage exists before first IndexedDB initialization.

Update `__promptit_prd_tech_spec.md` and `TEST_CHECKLIST.md` after implementation. The PRD should no longer say the actual prompt storage is `chrome.storage.local`. It should describe IndexedDB stores, revision notifications, 500 KiB body limit, metadata/body split, pinned ordering, and body-on-select reads.

## Milestones

Milestone 1 creates the schema, IndexedDB wrapper, order helpers, and repository behind tests or isolated calls without changing UI code. At the end of this milestone, a service-worker evaluation or repository-level test can create prompt records, list only metadata, read one body by id, reject an oversized body, and prove metadata-only update leaves the body record unchanged. Run `pnpm typecheck` and a focused Playwright or service-worker helper test that directly exercises repository functions.

Milestone 2 changes runtime messages and background handlers. At the end of this milestone, runtime calls can list metadata, read a body, create a prompt, update meta, update body, delete a prompt, pin/unpin, and move records. The old `PromptItem[]` storage path should no longer be used for production writes. Run `pnpm typecheck` and focused tests through `extension.sendRuntimeMessage`.

Milestone 3 updates content popup behavior. At the end of this milestone, typing `/ ` opens the popup from metadata only, and selecting/copying a prompt fetches the body on demand. Add a test that temporarily makes body reads fail and verifies the popup stays open with an error toast. Run the slash popup tests for textarea, contenteditable, and Gemini fixtures.

Milestone 4 updates the options page. At the end of this milestone, the options list no longer renders body preview, selecting a prompt loads its body into the editor, metadata-only saves do not rewrite body rows, and body saves update only body plus body metadata. Run `tests/e2e/options.spec.ts`.

Milestone 5 adds legacy migration and removes production dependency on `chrome.storage.local.prompts`. At the end of this milestone, a profile seeded with old `prompts` data migrates to IndexedDB once, starter prompt ids are omitted, malformed items are handled according to the migration rules, oversized legacy bodies abort without truncation, and the legacy key remains for recovery. Run migration-specific E2E tests plus the full E2E suite.

## Concrete Steps

Work from `/home/seok/code/promptit`.

First, add and adjust types:

    edit src/prompt/schema.ts
    add src/prompt/indexed-db.ts
    add src/prompt/order.ts
    add src/prompt/repository.ts

Then update background and runtime:

    edit src/runtime/messages.ts
    edit src/background/main.ts
    edit src/background/prompt-mutations.ts
    optionally add src/background/prompt-revision.ts
    optionally add src/background/prompt-migration.ts

Then update the client facade and consumers:

    edit src/prompt/storage.ts
    edit src/content/launcher-items.ts
    edit src/content/controller.ts
    edit src/content/session.ts if item typing assumes PromptItem content
    edit src/content/popup.ts only if display labels need pinned/order metadata
    edit src/options/usePromptEditor.ts
    edit src/options/App.tsx

Then update tests and docs:

    edit tests/playwright/extension.ts
    edit tests/playwright/promptit.ts
    edit tests/e2e/options.spec.ts
    edit tests/e2e/slash-popup.spec.ts
    edit tests/e2e/gemini-slash-popup.spec.ts
    edit tests/live/live-chatgpt.spec.ts
    edit tests/live/live-gemini.spec.ts
    edit TEST_CHECKLIST.md
    edit __promptit_prd_tech_spec.md

Use these commands while implementing:

    pnpm typecheck
    pnpm build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/options.spec.ts
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts tests/e2e/gemini-slash-popup.spec.ts
    pnpm test:e2e

Expected successful command shape:

    pnpm typecheck
    # exits 0 with no TypeScript errors

    pnpm test:e2e
    # builds the test extension, launches Playwright, and exits 0 with all E2E tests passing

## Validation and Acceptance

The implementation is complete only when all of the following are observable.

Creating a prompt whose body is exactly `500 * 1024` UTF-8 bytes succeeds. Creating or updating a prompt whose body is `500 * 1024 + 1` UTF-8 bytes fails with a visible validation error and leaves the existing body unchanged.

Opening the slash popup calls the metadata list path and renders prompt titles without reading `promptBodies.content`. Prove this with a test-only hook that fails body reads while allowing metadata reads; the popup should still open and list titles.

Selecting or copying a prompt fetches `promptBodies` by id and inserts or copies the exact body content. Prove this with existing insertion/copy tests plus a new large-body prompt test.

If body reads fail during selection or copy, the popup stays open, busy state clears, focus returns to the input, and an error toast appears.

Changing only a prompt title, pinned state, or order changes `promptMetas.updatedAt` and leaves `promptBodies.updatedAt` and `promptBodies.content` unchanged.

Changing prompt body updates `promptBodies.content`, `promptBodies.updatedAt`, `promptMetas.bodyUpdatedAt`, and `promptMetas.charCount`.

Pinned prompts render above normal prompts. Pinned prompts sort by `pinnedOrder`; normal prompts sort by `normalOrder`. Unpinning a prompt preserves its previous `normalOrder` and places it back in the normal group at that position.

Moving prompts assigns midpoint order values when there is a gap and renumbers only the affected pinned or normal group when no gap exists.

Two options tabs editing the same metadata produce a stale conflict when `expectedUpdatedAt` no longer matches. Two options tabs editing the same body produce a stale conflict when `expectedBodyUpdatedAt` no longer matches.

Legacy `chrome.storage.local.prompts` data migrates to IndexedDB on first initialization when IndexedDB is empty. The migration excludes `STARTER_PROMPT_ID`, rejects invalid legacy items, and aborts without truncation if any valid legacy prompt body exceeds the new byte limit. Successful migration does not delete the legacy key in this plan.

Production prompt body text is never written to `chrome.storage.local`. A repository-wide search after implementation should show `LEGACY_PROMPTS_STORAGE_KEY` usage only in migration and migration tests, and `PROMPT_REVISION_STORAGE_KEY` usage for small revision notifications.

## Idempotence and Recovery

All IndexedDB open and upgrade logic must be safe to run repeatedly. `onupgradeneeded` should create stores only if they do not already exist for the current version. Repository operations should open the database when needed and should not assume the service worker remained alive between calls.

Migration must be safe to retry. If IndexedDB already contains `promptMetas`, skip legacy migration. If migration fails, leave IndexedDB either unchanged or clear the partially written transaction by relying on transaction abort. Leave `chrome.storage.local.prompts` untouched in every migration outcome.

If a future database version is needed, add a new upgrade branch and keep version 1 migration behavior documented here. Do not change object store names casually; tests and users' persisted data depend on them.

Avoid destructive cleanup during implementation. Do not clear extension storage or IndexedDB in production code except through explicit test helpers. Playwright test helpers may delete IndexedDB records in their temporary browser context because the context is disposable.

## Interfaces and Dependencies

No new npm dependency is required. Use browser IndexedDB APIs from the existing TypeScript DOM library. Continue using `chrome.runtime.sendMessage` for options/content to background communication and `chrome.storage.onChanged` only for the small revision key.

Required schema exports from `src/prompt/schema.ts`:

    export const PROMPT_BODY_MAX_BYTES = 500 * 1024;
    export const PROMPT_ORDER_GAP = 1_000_000;
    export const PROMPT_REVISION_STORAGE_KEY = 'promptit:promptsRevision';
    export const LEGACY_PROMPTS_STORAGE_KEY = 'prompts';
    export const STARTER_PROMPT_ID = '__promptit_starter_prompt__';
    export type PromptMeta = { ... };
    export type PromptBody = { ... };
    export type PromptRecord = PromptMeta & { content: string };
    export type PromptDraft = { title: string; content: string; sortOrder?: number; pinned?: boolean; normalOrder?: number; pinnedOrder?: number | null };
    export type PromptMetaDraft = { title: string; normalOrder?: number; pinnedOrder?: number | null };
    export type PromptBodyDraft = { content: string };

Required repository exports from `src/prompt/repository.ts`:

    ensurePromptStorageReady(): Promise<void>
    listPromptMetas(): Promise<PromptMeta[]>
    getPromptBody(id: string): Promise<PromptBody | null>
    getPromptRecord(id: string): Promise<PromptRecord | null>
    createPrompt(draft: PromptDraft): Promise<PromptRecord>
    updatePromptMeta(id: string, draft: PromptMetaDraft, options: { expectedUpdatedAt: string }): Promise<...>
    updatePromptBody(id: string, content: string, options: { expectedBodyUpdatedAt: string }): Promise<...>
    deletePrompt(id: string, options: { expectedUpdatedAt: string }): Promise<...>
    movePrompt(id: string, request: { group?: 'pinned' | 'normal'; previousId?: string | null; nextId?: string | null; expectedUpdatedAt?: string }): Promise<...>
    setPromptPinned(id: string, pinned: boolean, options: { expectedUpdatedAt: string }): Promise<...>
    runLegacyPromptMigration(): Promise<...>

Required client facade exports from `src/prompt/storage.ts`:

    getPromptMetas(): Promise<PromptMeta[]>
    getPromptBody(id: string): Promise<PromptBody>
    getPromptRecord(id: string): Promise<PromptRecord>
    createPrompt(draft: PromptDraft): Promise<PromptRecord>
    updatePromptMeta(id: string, draft: PromptMetaDraft, options: { expectedUpdatedAt: string }): Promise<UpdatePromptMetaResponse>
    updatePromptBody(id: string, content: string, options: { expectedBodyUpdatedAt: string }): Promise<UpdatePromptBodyResponse>
    deletePrompt(id: string, options: { expectedUpdatedAt: string }): Promise<DeletePromptResponse>
    movePrompt(id: string, target: MovePromptTarget, options: { expectedUpdatedAt: string }): Promise<MovePromptResponse>
    setPromptPinned(id: string, pinned: boolean, options: { expectedUpdatedAt: string }): Promise<SetPromptPinnedResponse>
    subscribeToPromptMetas(listener: (metas: PromptMeta[]) => void): () => void

## Artifacts and Notes

Production writes replaced by the current tree:

    src/background/prompt-mutations.ts routes create/update/delete/move/pin messages to src/prompt/repository.ts
    src/prompt/repository.ts writes prompt data to IndexedDB promptMetas and promptBodies
    src/prompt/repository.ts writes only PROMPT_REVISION_STORAGE_KEY and promptit:idbMigration to chrome.storage.local

Production body-in-list assumptions removed by the current tree:

    src/content/controller.ts lists PromptMeta records and reads PromptBody on select/copy
    src/options/usePromptEditor.ts stores PromptMeta[] for the list and fetches PromptRecord for edit mode
    src/options/App.tsx renders metadata in list rows rather than prompt.content previews

Tests updated in the current tree:

    tests/playwright/extension.ts seeds production prompts with setPromptRecords and inspects getPromptMetas/getPromptBody
    tests/e2e/options.spec.ts validates body limit, metadata-only save, body save, pinned ordering, body conflict, and migration
    tests/e2e/slash-popup.spec.ts validates metadata-only popup reads and body-on-select/copy reads
    tests/e2e/gemini-slash-popup.spec.ts keeps Gemini insertion behavior passing with body-on-select reads

Revision note, 2026-05-09: Initial ExecPlan created from the current chrome.storage.local implementation and the requested IndexedDB metadata/body split. The plan intentionally keeps legacy `chrome.storage.local.prompts` only for migration and recovery while moving all production prompt body storage to IndexedDB.

Revision note, 2026-05-10: Documentation updated after implementation/test agents landed the migration. Living sections now distinguish implemented code and targeted test evidence from the still-pending full focused E2E rerun.

Revision note, 2026-05-10 follow-up: Focused validation evidence was updated after the options and slash/Gemini suites completed. Reviewer follow-up on best-effort revision publishing and required runtime mutation timestamps was recorded.

Revision note, 2026-05-10 final doc update: Options focused suite evidence was updated to 27/27, and the migration marker post-commit failure fix/regression was recorded.
