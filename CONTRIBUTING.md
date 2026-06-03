# Contributing to promptit

Thanks for taking the time to improve promptit. This project is a Chromium browser extension for quickly inserting saved prompts into ChatGPT and Gemini with the `/ ` trigger.

This guide explains how to make focused, reviewable changes. For detailed test commands and coverage notes, read [TESTING.md](TESTING.md) and [TEST_CHECKLIST.md](TEST_CHECKLIST.md).

## Development Setup

promptit uses Node `^24.0.0` and `pnpm@10.33.0`.

```bash
git clone https://github.com/audok/promptit.git
cd promptit
pnpm install
pnpm build
```

The production extension bundle is created in `dist/`. To load it manually, open the Chrome or Chromium extensions page, turn on Developer mode, choose `Load unpacked`, and select `dist/`.

## Making Changes

Keep changes focused on the behavior you are trying to improve. Avoid unrelated refactors, formatting churn, generated artifacts, or cleanup that is not required by the contribution.

When changing user-facing behavior, update the relevant tests and documentation in the same change. If a primary English document has a Korean `.ko.md` counterpart, keep the counterpart in sync or clearly call out that it still needs translation.

When changing user-facing text, update both supported locales. App UI strings live in `src/shared/i18n.ts`; extension manifest strings live in `public/_locales/en/messages.json` and `public/_locales/ko/messages.json`.

When changing extension permissions, supported sites, manifest behavior, storage behavior, or data portability, keep the production manifest policy and existing privacy expectations intact. The extension should continue to use narrow permissions and supported-site content script matches.

## Testing

Use the narrowest useful test while developing, then run the broader gate when the change is ready.

```bash
pnpm typecheck
pnpm build
pnpm check:manifest
pnpm test:e2e
pnpm test
```

For a specific fixture spec, use npm script forwarding:

```bash
pnpm test:e2e -- tests/e2e/slash-popup-ui.spec.ts
```

Before release-oriented changes, also run the live smoke tests:

```bash
pnpm test:e2e:live
pnpm test:e2e:live:prod
```

After using Playwright, Chrome DevTools, or a task-owned browser, check for leftover test browser processes:

```bash
pnpm check:test-browsers
```

Live smoke tests depend on real ChatGPT/Gemini site state and may fail for external reasons. When that happens, keep deterministic fixture coverage strong and record the artifact or live site state that explains the failure.

## Manual Release Checks

Some behavior remains manual because browser toolbar UI, logged-in sessions, real downloads, and OS file pickers are not fully reliable through Playwright.

Before a release, manually confirm:

- Clicking the browser toolbar promptit icon opens or focuses the options page.
- Logged-in ChatGPT and Gemini sessions support `/ ` popup, insert, copy, pin/unpin, trigger cleanup, and no unintended submit.
- Backup/share export, restore, and import work with the actual downloads folder and OS file picker.

## Pull Request Checklist

Before opening or merging a PR, make sure:

- The change is scoped to one clear behavior or documentation update.
- Relevant docs and Korean/English text are updated.
- Relevant automated tests pass, or any skipped test is explained.
- `pnpm check:manifest` passes after a production build when manifest or release behavior is involved.
- Browser process cleanup has been checked after any browser automation.
- Generated build or test artifacts are not added unless the task explicitly requires them.

## Reporting Bugs

For bug reports, include:

- The browser and operating system.
- The affected site: ChatGPT or Gemini.
- Exact reproduction steps, including the text typed around the `/ ` trigger.
- Expected behavior and actual behavior.
- Screenshots, Playwright artifacts, or console logs when available.

Small, precise reports are easier to reproduce and fix than broad descriptions.
