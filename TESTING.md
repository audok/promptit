# promptit Testing Guide
This operational guide documents the test run order and manual test procedures for promptit.
Coverage details are tracked in [TEST_CHECKLIST.md](TEST_CHECKLIST.md).

## Document Roles
- `TESTING.md`: documents which commands to run and when.
- `TEST_CHECKLIST.md`: tracks which behaviors are covered by automated, live smoke, and manual tests.

## Test Commands
### Default Gate
```bash
pnpm test
```

- This is the default local regression gate before a PR.
- Order: `pnpm typecheck`, production `pnpm build`, `pnpm check:manifest`, `pnpm test:e2e`, final production `pnpm build`, `pnpm check:manifest`.
- `pnpm test:e2e` builds the test-mode bundle into `dist-test/` and runs Playwright with `PROMPTIT_EXTENSION_PATH=dist-test`.
- Real ChatGPT/Gemini smoke tests are not included because they depend on external site state.

### Deterministic E2E
```bash
pnpm test:e2e
```

- This is a local fixture-based Playwright regression test suite.
- It builds the test-mode `dist-test/` bundle and repeatably verifies ChatGPT/Gemini fixtures, popup, options, storage, manifest/i18n, security rendering, and responsive/scale paths.
- Playwright loads the test-mode extension bundle with `PROMPTIT_EXTENSION_PATH=dist-test`.
- The `/ ` trigger is verified through normal trusted keyboard/input paths.
- IME automation verifies the boundary that blocks popup open and popup keyboard commands during composition. The `/ ` trigger itself does not depend on IME composition finalization.
- When needed, inspect the fixture test list with `pnpm exec playwright test --list`.
- After running this command, run production `pnpm build && pnpm check:manifest` or `pnpm test` again before manually loading or packaging the extension.

Individual fixture specs can also be run through npm script forwarding.

```bash
pnpm test:e2e -- tests/e2e/slash-popup-ui.spec.ts
```

- `pnpm test:e2e`, `pnpm test:e2e:headed`, and `pnpm test:e2e:ui` set the test-mode build variable, `PROMPTIT_EXTENSION_PATH=dist-test`, and the headed extension environment through the script.
- Running only `pnpm exec playwright test ...` directly can fail by loading a previously built production `dist/` bundle or a manifest without localhost fixture matches.
- To inspect only test names and projects, `pnpm exec playwright test --list` can be used as-is. This list operation does not load the extension bundle.
- The local fixture server does not reuse an existing process on port `4173`. If `4173` is already in use, Playwright fails immediately. In that case, use OS-specific process tools to identify the occupying process, and terminate only a clearly identified previous fixture server. Do not terminate unknown user processes.

### Real-Site Smoke: test-mode bundle
```bash
pnpm test:e2e:live
```

- Runs the same 10 flows on real `chatgpt.com` and `gemini.google.com/app` with the test-mode `dist-test/` bundle: popup open, saved prompt insert/copy, pin toggle/order persistence, trigger cleanup, prefix/multiline insert, and empty/non-empty options open.
- Uses a fresh temporary Chromium profile, so it does not represent the user's real logged-in browser session.
- Failures are treated as normal Playwright failures, and live site/step context is left in output/artifacts.
- When needed, inspect the live smoke list with `pnpm exec playwright test --config playwright.live.config.ts --list`.
- Live smoke also loads the `dist-test/` test-mode bundle. On success, the script rebuilds production `dist/` and checks manifest policy. If the script stops after an intermediate failure, run `pnpm build && pnpm check:manifest` separately.
- Insert flows automatically verify that prompt text remains visible in the composer. Prefix-preserving insert also verifies that the existing prefix remains before the prompt text and that the `/ ` trigger is not left between them. There is not yet a selector that can reliably read submitted messages, so confidence that no unintended submit occurred comes from the logged-in manual live checklist.

### Real-Site Smoke: production bundle
```bash
pnpm test:e2e:live:prod
```

- Builds production `dist/`, passes `check:manifest`, then runs only `tests/live/live-prod-insert.spec.ts` against the real sites.
- It loads the production bundle with `PROMPTIT_EXTENSION_PATH=dist`, so the smoke test matches closed shadow root behavior and production manifest conditions.
- This spec is compatible with the production bundle by avoiding assertions inside the open shadow root. It selects a prompt with `/ ` in the live composer, then verifies that the prompt text is visible in the composer and that the popup host has been dismissed with count `0`.
- Production manifest release policy is verified by the script gate `pnpm check:manifest`, not by assertions inside the spec. Both `pnpm test:e2e:live:prod` and `pnpm test` run this gate after a production build.
- This can fail because of external site state or fresh profile constraints. When it fails, do not weaken deterministic fixture regressions; record the artifact and live site state instead.

### Auxiliary Commands
```bash
pnpm typecheck
pnpm build
pnpm check:manifest
pnpm build:test
```

- `typecheck`: checks for TypeScript type errors.
- `build`: creates the production extension bundle in `dist/`. The script unsets ambient `VITE_PROMPTIT_TEST_MODE` so it cannot affect the release build.
- `check:manifest`: verifies that the production manifest satisfies release policy.
- `build:test`: creates the test-mode bundle in `dist-test/` with localhost fixture matches.

## Recommended Run Order
### During Implementation
- Fast check: a related spec or `pnpm test:e2e`
- Type/bundle boundary check: `pnpm typecheck`, `pnpm build`, `pnpm check:manifest`
- For larger changes or release-gate-adjacent work, run `pnpm test`

### Before PR
```bash
pnpm test
```

### Before Release
```bash
pnpm test
pnpm test:e2e:live
pnpm test:e2e:live:prod
```

Then run the 3 manual tests at the bottom: toolbar icon click, logged-in ChatGPT/Gemini full flow, and real download/file selection.

## Build Output Notes
- Production build output is `dist/`, and test-mode E2E build output is `dist-test/`.
- `pnpm build` is a wrapper script that unsets ambient `VITE_PROMPTIT_TEST_MODE` so it cannot leak into release builds.
- `pnpm build:test`, `pnpm test:e2e`, `pnpm test:e2e:headed`, `pnpm test:e2e:ui`, and `pnpm test:e2e:live` create `dist-test/`, then run Playwright with `PROMPTIT_EXTENSION_PATH=dist-test`.
- `pnpm test:e2e:live:prod` creates production `dist/` and runs only the production-compatible live smoke with `PROMPTIT_EXTENSION_PATH=dist`.
- Automated test npm scripts use the Node wrapper to handle environment variables and headed browser support for display-less Linux. Developers do not need to copy OS-specific shell environment syntax to run automated tests.
- Running production builds and E2E builds in parallel in the same worktree is discouraged. Their output directories are separate, but shared resources such as dependency installation or Playwright artifacts can make results difficult to interpret.
- When manually loading or packaging the extension, use `dist/` after completing production `pnpm build` and `pnpm check:manifest`.

## Browser Process Cleanup
After using a browser, DevTools, or Playwright, check for leftover test browser processes at the host-process level.

```bash
pnpm check:test-browsers
```

If the output reports potential test processes, determine whether they are ordinary user Chrome processes or MCP processes from another task before terminating them. `Xvfb` can be a display-less Linux E2E helper even when its command line does not contain a promptit path, so identify the actual owner first.

## Quick Checklist
- [ ] `pnpm test`
- [ ] `pnpm test:e2e:live`
- [ ] `pnpm test:e2e:live:prod`
- [ ] `pnpm check:test-browsers`
- [ ] Confirm the 3 manual tests

## Manual Tests
### Browser Toolbar Icon Click
1. Open a browser with the promptit extension loaded.
2. Click the promptit extension icon in the browser toolbar.
3. Confirm that the options page opens in a new tab or focuses an already-open options tab.
4. Confirm that the options page title is `promptit Settings`.

This remains manual because Playwright cannot reliably control the browser toolbar UI.

### Logged-in ChatGPT/Gemini Full Flow
1. In a browser with the promptit extension loaded, open logged-in ChatGPT and Gemini sessions.
2. Focus each service's composer and type `/ `.
3. Confirm that the promptit popup opens.
4. Confirm saved prompt insert, copy, and pin/unpin flows.
5. Confirm that `/ ` trigger cleanup works and that the prompt is not submitted unintentionally.

This remains manual because account state, cookies, site UI changes, and A/B tests make it difficult to lock down as a repeatable release gate.

### Real Download and File Selection for Backup/Share
1. Open the options page in a browser with the promptit extension loaded.
2. In `Backup/share`, confirm that `Back up` and `Share all prompts` create JSON files in the actual downloads folder.
3. Select the backup JSON again with `Restore`, and confirm that a preview appears first and that data is replaced only after confirmation.
4. Select the shared JSON with `Import prompts`, and confirm that existing prompts remain and new prompts are added.

Fixture E2E verifies file shape and file input flow, but real download locations, OS file pickers, and manually loaded extension state must still be checked manually before release.
