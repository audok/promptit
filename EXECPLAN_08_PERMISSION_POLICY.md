# Align Permission and Supported-Site Policy

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document according to `PLANS.md` in the repository root.

## Purpose / Big Picture

Promptit supports ChatGPT and Gemini by injecting a content script into a small set of AI site hosts. The F8 triage item was that the extension asked for `host_permissions` for the same hosts even though runtime evidence only showed static content-script injection, storage, runtime messaging, extension font URLs, and clipboard usage. The repository also had metadata mismatch before this plan: the manifest said "supported AI sites", the README listed ChatGPT and Gemini, and `package.json` described ChatGPT only.

After this work, a reviewer should be able to answer three questions from the repository alone: exactly which production sites Promptit supports, exactly which manifest fields allow injection or host access, and whether `host_permissions` is still needed. If host permissions can be removed, the extension should still initialize and work on `chatgpt.com`, legacy `chat.openai.com`, and `gemini.google.com` where current tests say it should. If removal cannot be proven safely, the plan requires recording why and keeping the permission until the missing evidence is closed.

## Progress

- [x] (2026-05-11 22:23 KST) Read `PLANS.md` and confirmed the required ExecPlan structure.
- [x] (2026-05-11 22:23 KST) Used the `chrome-extension-development` skill for least-privilege Manifest V3 guidance.
- [x] (2026-05-11 22:23 KST) Checked official Chrome documentation for `content_scripts.matches` and `host_permissions`, and checked current OpenAI Help content for the ChatGPT web entry point.
- [x] (2026-05-11 22:23 KST) Inspected `.codex/agents` and delegated read-only planning support to the project `code-mapper` and `code-reviewer` agents.
- [x] (2026-05-11 22:23 KST) Inspected `manifest.config.ts`, existing `dist/manifest.json`, `src/adapters/chatgpt.ts`, `src/adapters/gemini.ts`, `src/adapters/registry.ts`, `src/content/controller.ts`, `src/content/fonts.ts`, `src/background/main.ts`, `README.md`, `package.json`, and nearby platform/live testing docs and specs.
- [x] (2026-05-11 22:23 KST) Incorporated read-only subagent findings into this plan without making implementation changes.
- [x] (2026-05-12 16:49 KST) Re-read this ExecPlan, refreshed official Chrome/OpenAI references, and ran the source evidence gate before implementation.
- [x] (2026-05-12 16:49 KST) Run a fresh evidence pass before implementation to confirm no new host-access APIs were added.
- [x] (2026-05-12 16:53 KST) Added a manifest support-policy regression test and confirmed it failed before implementation because `host_permissions` still contained the supported hosts.
- [x] (2026-05-12 17:00 KST) Added manifest/support-policy regression coverage in `tests/e2e/platform.spec.ts`; it now asserts `permissions: ['storage']`, no `host_permissions`, supported production matches, test-only localhost matches, and preserved web-accessible font/resource match coverage.
- [x] (2026-05-12 17:01 KST) Aligned README, package metadata, and manifest description around ChatGPT primary, ChatGPT legacy host, and Gemini support without changing adapter URL policy.
- [x] (2026-05-12 17:01 KST) Removed `host_permissions` from `manifest.config.ts` after the fresh evidence gate found no host-access API usage.
- [x] (2026-05-12 17:04 KST) Ran typecheck, production build manifest inspection, test build manifest inspection, targeted platform/ChatGPT/Gemini e2e, full deterministic e2e, and production build. Live/manual support-site smoke was not run because this stage has deterministic fixture coverage and no authenticated/live browser session was required by the safe gate.
- [x] (2026-05-12 17:09 KST) Completed implementation self-review and read-only `code-reviewer` review; fixed stale plan notes and strengthened the manifest test to flatten all content-script matches.

## Surprises & Discoveries

- Observation: before F8, `manifest.config.ts` used the same `contentScriptMatches` array for `host_permissions`, `web_accessible_resources.matches`, and `content_scripts.matches`.
  Evidence: production matches are `https://chatgpt.com/*`, `https://chat.openai.com/*`, and `https://gemini.google.com/*`; test mode adds `http://127.0.0.1:*/*` and `http://localhost:*/*`.

- Observation: current runtime source does not show APIs that normally require host permissions.
  Evidence: source search found no runtime `fetch`, `chrome.tabs`, `chrome.scripting`, `chrome.webRequest`, `chrome.cookies`, or `chrome.declarativeNetRequest` usage. Runtime code uses `chrome.storage`, `chrome.runtime`, `chrome.action`, `chrome.runtime.getURL`, and `navigator.clipboard`.

- Observation: the built manifest currently exposes bundled content-script chunks through `web_accessible_resources`, not just the font listed in `manifest.config.ts`.
  Evidence: existing `dist/manifest.json` includes `fonts/PretendardVariable.woff2`, bundled shared chunks, and a bundled content-script asset under `web_accessible_resources.resources`. This means F8 must preserve `web_accessible_resources.matches` even if `host_permissions` is removed.

- Observation: the supported-site policy is duplicated in manifest match patterns and adapter URL regular expressions.
  Evidence: `manifest.config.ts` has Chrome match patterns; `src/adapters/chatgpt.ts` has a regex for `chatgpt.com` and `chat.openai.com`; `src/adapters/gemini.ts` has a regex for `gemini.google.com`.

- Observation: before F8, README and package metadata disagreed.
  Evidence: `README.md` listed ChatGPT and Gemini as supported sites, while `package.json` said "Slash-command prompt launcher for ChatGPT". The manifest description used generic "supported AI sites".

- Observation: current official OpenAI Help material names `chatgpt.com` as the ChatGPT web entry point, while this repo still supports `chat.openai.com` as a legacy host.
  Evidence: OpenAI Help says ChatGPT Web is `chatgpt.com`. Current code and live tests still include `chat.openai.com` initialization.

- Observation: Gemini has deterministic fixture coverage but public live automation is intentionally skipped.
  Evidence: `tests/e2e/gemini-slash-popup.spec.ts` covers Gemini fixture behavior, while `tests/live/live-gemini.spec.ts` is skipped because the public page no-submit condition was not safe as a release gate.

- Observation: the 2026-05-12 fresh evidence gate still found no production host-access API usage that would justify `host_permissions`.
  Evidence: before the manifest edit, the audit command found only the source manifest declaration and no production host-access API usage. After removal, rerunning `rg -n "fetch\\(|chrome\\.tabs|chrome\\.scripting|chrome\\.webRequest|chrome\\.cookies|chrome\\.declarativeNetRequest|chrome\\.permissions|optional_host_permissions|host_permissions" src manifest.config.ts package.json README.md` returned no matches. A broader `chrome.` scan found `chrome.storage`, `chrome.runtime`, `chrome.action`, and `chrome.runtime.getURL` usage in production source.

- Observation: current official references still support the planned distinction between static content-script matches and host permissions.
  Evidence: Chrome documentation says `content_scripts.matches` controls static content-script injection, while host permissions allow host access for APIs such as extension-page/service-worker `fetch()`, sensitive tab properties through `chrome.tabs`, programmatic injection, `webRequest`, cookies, and DNR. OpenAI Help still lists ChatGPT Web as `chatgpt.com`.

- Observation: generated `web_accessible_resources.matches` order is not the same as source `content_scripts.matches`.
  Evidence: production build generated WAR matches in the order `chat.openai.com`, `chatgpt.com`, `gemini.google.com`; test build generated localhost patterns first, then production hosts. The manifest policy test therefore asserts exact order only for `content_scripts.matches` and order-independent coverage for WAR matches.

- Observation: removing `host_permissions` did not remove static injection or resource access in generated manifests.
  Evidence: production `dist/manifest.json` had `permissions: ['storage']`, no `host_permissions`, content-script matches for `chatgpt.com`, `chat.openai.com`, and `gemini.google.com`, and WAR matches for the same production hosts. Test build added only `http://127.0.0.1:*/*` and `http://localhost:*/*` to those match sets.

## Decision Log

- Decision: Treat F8 as a permission and policy alignment task, not as a broad supported-site expansion.
  Rationale: The current supported sites are already declared in manifest, adapters, README, and tests. The immediate risk is drift and over-permission, not missing new sites.
  Date/Author: 2026-05-11 / Codex

- Decision: Use one explicit supported-site policy table in the plan and tests: ChatGPT primary `chatgpt.com`, ChatGPT legacy compatibility `chat.openai.com`, and Gemini `gemini.google.com`.
  Rationale: `chatgpt.com` is the current official ChatGPT web entry point. `chat.openai.com` is still intentionally supported by code and live smoke tests, but it should be described as legacy compatibility rather than the primary public URL.
  Date/Author: 2026-05-11 / Codex

- Decision: Keep `content_scripts.matches` and `web_accessible_resources.matches` aligned with supported hosts.
  Rationale: `content_scripts.matches` is what statically injects Promptit on supported hosts. `web_accessible_resources.matches` controls which matched hosts can load extension resources such as the font and bundled content-script chunks.
  Date/Author: 2026-05-11 / Codex

- Decision: Make `host_permissions` removal conditional on fresh evidence and post-change validation.
  Rationale: Current evidence supports removal, but permission changes are browser-extension policy changes. The implementation must first prove no host-access API is present and then verify the built extension still injects and loads resources.
  Date/Author: 2026-05-11 / Codex

- Decision: Do not move supported-site truth into a heavy abstraction for this pass.
  Rationale: Manifest match patterns and adapter regexes are different representations. A small policy test and aligned documentation provide enough protection against drift without introducing a new configuration layer.
  Date/Author: 2026-05-11 / Codex

- Decision: Keep Gemini in user-facing support metadata unless implementation discovers a current break in deterministic Gemini coverage.
  Rationale: The README says Gemini is supported, manifest and adapter include Gemini, and deterministic Gemini tests cover the supported behavior. The skipped public live smoke should be documented as a test limitation, not as removal of Gemini support.
  Date/Author: 2026-05-11 / Codex

- Decision: Remove `host_permissions` from the source manifest.
  Rationale: The refreshed source audit found no production host-access APIs, Chrome's documented static injection mechanism is `content_scripts.matches`, generated manifests preserved static injection/resource matches, and deterministic extension tests passed without host permissions.
  Date/Author: 2026-05-12 / Codex

- Decision: Add a production-manifest check to the deterministic test gate.
  Rationale: `test:e2e` intentionally leaves `dist` in test-manifest mode, so `pnpm test` must finish by rebuilding production output and checking that production host policy is restored before packaging or manual loading.
  Date/Author: 2026-05-12 / Codex

## Outcomes & Retrospective

Implemented. `host_permissions` was removed from `manifest.config.ts`, while `permissions: ['storage']`, `content_scripts.matches`, and `web_accessible_resources.matches` remain aligned with ChatGPT primary, ChatGPT legacy host, Gemini, and test-only local fixtures. User-facing metadata now names ChatGPT and Gemini consistently in the manifest description, package description, and README supported-site section.

Regression coverage was added in `tests/e2e/platform.spec.ts` to read the runtime manifest from the extension service worker and encode the intended permission/support policy. The test failed before the manifest edit because `host_permissions` was still populated, then passed after the removal. The test flattens all content-script matches so an accidental second content script with broader matches is caught. The WAR match assertion is intentionally order-independent because the CRX build output reorders generated WAR matches.

Validation completed:

    pnpm run typecheck
      Passed.

    pnpm run build
      Passed. Production `dist/manifest.json` had `permissions: ['storage']`, no `host_permissions`, production content-script matches for `chatgpt.com`, `chat.openai.com`, and `gemini.google.com`, and WAR matches for those hosts.

    pnpm run check:manifest
      Passed. Production `dist/manifest.json` had only the expected production content-script and WAR matches, no `host_permissions`, and no local fixture matches.

    pnpm run build:test
      Passed. Test `dist/manifest.json` had `permissions: ['storage']`, no `host_permissions`, production matches plus `http://127.0.0.1:*/*` and `http://localhost:*/*` for content scripts and WAR resources.

    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/platform.spec.ts
      Passed: 6/6 before review. After self-review test hardening, passed again: 6/6.

    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts --grep "opens the slash popup|inserts the active prompt|copies|opens the options page|does not open the popup when only a slash"
      Passed: 7/7.

    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/gemini-slash-popup.spec.ts
      Passed: 8/8.

    pnpm run test:e2e
      Passed: 120/120 after the final storage-safety regression was added.

    pnpm test
      Passed. The full deterministic gate ran typecheck, production build, production manifest check, fixture Playwright suite, final production build, and final production manifest check.

    ps -ef | rg -v "rg " | rg "(/opt/google/chrome|chrome-linux|chromium|playwright|promptit-playwright)"
      Passed cleanup check by returning no host-level browser or Playwright processes.

Live `chatgpt.com`, legacy `chat.openai.com`, and Gemini public smoke checks were not run in this stage; deterministic extension fixtures and generated-manifest inspection satisfied the safe F8 gate. Residual risk is limited to external site UI/session drift, which remains covered by existing live smoke procedures rather than this permission-policy patch.

## Context and Orientation

This repository is a Manifest V3 Chrome extension. A manifest is the browser-readable JSON file that declares extension name, scripts, permissions, and resource access. Here, the source manifest is `manifest.config.ts`, and the Vite CRX plugin generates `dist/manifest.json` during a build.

`content_scripts.matches` is the manifest field that tells Chrome which page URLs should receive the content script. In this repository, the content script is `src/content/content-script.ts`, which calls into `src/content/controller.ts`. The controller calls `resolveAdapterForUrl(window.location.href)` before doing real work, so even if a test-mode localhost page receives the content script, unsupported fixture pages still fail closed.

`host_permissions` is a separate manifest field. It grants the extension host access for APIs such as extension-page or service-worker `fetch()` to a host, sensitive tab URL/title access through `chrome.tabs`, programmatic injection through `chrome.scripting`, network observation through `webRequest`, cookie access, or declarative network request rules. Chrome documentation also notes that both host permissions and content-script matches can trigger user-visible permission warnings. In this project, static content script injection does not by itself prove that `host_permissions` is needed.

`web_accessible_resources` is a manifest field that allows web pages matched by the listed patterns to load extension-packaged resources. Promptit uses `chrome.runtime.getURL()` in `src/content/fonts.ts` to build a URL for `fonts/PretendardVariable.woff2`. The existing built manifest also lists bundled JavaScript chunks as web-accessible resources, so F8 must not remove or narrow `web_accessible_resources.matches` accidentally when reviewing `host_permissions`.

Site-specific behavior is implemented by adapters. `src/adapters/registry.ts` creates a list of adapters and returns the first adapter whose `canHandle(url)` returns true. `src/adapters/chatgpt.ts` handles `https://chatgpt.com` and `https://chat.openai.com` in production, and named localhost ChatGPT fixtures only in test mode. `src/adapters/gemini.ts` handles `https://gemini.google.com` in production, and the named Gemini localhost fixture only in test mode.

Before F8, the supported-site policy visible to users lived in several places with drift: `README.md` said Promptit supports ChatGPT and Gemini, `package.json` described ChatGPT only, and `manifest.config.ts` said "supported AI sites" but did not list names. `TESTING.md` and `TEST_CHECKLIST.md` distinguish deterministic local fixture tests from live smoke tests. This plan uses the phrase "legacy compatibility host" for `chat.openai.com`: a host that Promptit intentionally keeps working for existing navigation/redirect behavior even though current OpenAI Help materials name `chatgpt.com` as the main web entry point.

## Plan of Work

Start with an evidence gate before any permission edit. Search runtime source, not just manifest files, for APIs that would require host permissions. The required search terms are `fetch`, `chrome.tabs`, `chrome.scripting`, `chrome.webRequest`, `chrome.cookies`, `chrome.declarativeNetRequest`, `chrome.permissions`, and `optional_host_permissions`. Also inspect `src/background/main.ts`, `src/content/controller.ts`, `src/content/fonts.ts`, `src/prompt/storage.ts`, and `src/prompt/repository.ts` for Chrome API calls. If any host-access API appears, stop and classify `host_permissions` removal as deferred unless the code path can be removed or converted to optional permissions in a separate plan.

Add or update platform tests before changing the manifest. `tests/e2e/platform.spec.ts` is the right home because it already owns unsupported URL policy, duplicate content-script injection guard, and runtime message platform behavior. Add a manifest policy test that reads `chrome.runtime.getManifest()` from an extension context and asserts the intended policy. The intended post-F8 policy is: `permissions` is exactly `['storage']`; `host_permissions` is absent or an empty array if removal is approved; `content_scripts[0].matches` contains supported production hosts and, in test mode, localhost and 127.0.0.1 test hosts; `web_accessible_resources[0].matches` continues to contain the same host patterns needed by the content script and font resources. Keep this test explicit rather than snapshotting the whole manifest, because generated asset filenames can change.

Add a lightweight adapter-policy test if no direct test already covers the URL matrix. The simplest route is to create a small TypeScript-level test only if the repo gets a unit test entrypoint in the testing-baseline work. Until then, use existing e2e tests and platform tests: supported named fixtures should initialize; unsupported localhost fixture should not initialize; `about:blank` should not initialize. Do not introduce a new test runner solely for F8. If a test entrypoint already exists by implementation time, add direct checks for `ChatGPTAdapter.canHandle('https://chatgpt.com/')`, `ChatGPTAdapter.canHandle('https://chat.openai.com/')`, `GeminiAdapter.canHandle('https://gemini.google.com/app')`, and negative hosts.

Update `manifest.config.ts` only after the evidence gate. Keep `defaultMatches` as the supported production host patterns unless a live support decision changes them. Keep test-only localhost matches gated behind `VITE_PROMPTIT_TEST_MODE === '1'`. If removal is approved, remove the `host_permissions` field from the manifest source. Do not remove `content_scripts.matches`. Do not remove or narrow `web_accessible_resources.matches`. Keep `permissions: ['storage']`.

Align user-facing and package metadata in the same implementation slice. Update `package.json` description from ChatGPT-only wording to a phrase that covers the supported AI sites, for example "Slash-command prompt launcher for ChatGPT and Gemini". Update `manifest.config.ts` description to the same user-visible support scope if the wording still fits Chrome description length constraints. Update `README.md` so its supported-site section lists ChatGPT primary `https://chatgpt.com/`, ChatGPT legacy compatibility `https://chat.openai.com/`, and Gemini `https://gemini.google.com/`. Use concise wording so the README does not overpromise public Gemini live automation.

Do not remove `chat.openai.com` just because current OpenAI Help names `chatgpt.com` as the web entry point. `chat.openai.com` remains in code and tests today. Only remove it if a product decision explicitly drops legacy compatibility and the live smoke or manual verification confirms the removal has no desired-user impact. If removal is not part of the decision, keep manifest matches, adapter regex, README, and tests aligned around it.

Review `tests/live/live-chatgpt.spec.ts` and `tests/live/live-gemini.spec.ts` only for validation expectations. Keep `chatgpt.com` live smoke as the primary live check. Keep `chat.openai.com` live smoke as a legacy-initialization check. Keep Gemini public live smoke skipped unless a separate Gemini live-flow fix makes it a safe no-submit release gate. F8 should not turn a skipped public Gemini test into a blocker.

If the implementation discovers generated `dist/manifest.json` behavior that conflicts with the source manifest expectation, document it in `Surprises & Discoveries` before changing course. Generated CRX manifests may include bundled content-script chunks in `web_accessible_resources`; that is acceptable as long as host permissions and supported matches are correct.

## Concrete Steps

All commands in this section assume the working directory is the repository root:

    cd /home/seok/code/promptit

Before editing, run a fresh source and manifest evidence check:

    git status --short
    rg -n "fetch\\(|chrome\\.tabs|chrome\\.scripting|chrome\\.webRequest|chrome\\.cookies|chrome\\.declarativeNetRequest|chrome\\.permissions|optional_host_permissions|host_permissions" src manifest.config.ts tests README.md package.json
    rg -n "chatgpt\\.com|chat\\.openai\\.com|gemini\\.google\\.com|supported AI sites|ChatGPT|Gemini" manifest.config.ts README.md package.json src/adapters tests TESTING.md TEST_CHECKLIST.md

Milestone 1 is the evidence gate. Inspect the output above and record the result in `Surprises & Discoveries`. If only storage/runtime/action/clipboard/extension URL APIs are present, continue toward `host_permissions` removal. If a host-access API appears, do not remove `host_permissions` in this F8 patch; update this plan to explain the blocker.

Milestone 2 is test coverage for the intended policy. Edit `tests/e2e/platform.spec.ts` to add a manifest policy test. The test should assert that after F8, `host_permissions` is not present, `permissions` remains `['storage']`, and `content_scripts.matches` plus `web_accessible_resources.matches` still include the supported hosts. Run the targeted platform spec and expect the new host-permission assertion to fail before the manifest edit:

    pnpm run build:test
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/platform.spec.ts

Milestone 3 is policy and metadata alignment. Edit `manifest.config.ts`, `README.md`, and `package.json`. If `host_permissions` removal passed the evidence gate, remove only `host_permissions` from `manifest.config.ts`. Keep `content_scripts.matches` and `web_accessible_resources.matches` unchanged. Align package and manifest descriptions with ChatGPT and Gemini support. Update README supported-site wording to include `chatgpt.com`, legacy `chat.openai.com`, and `gemini.google.com`.

Milestone 4 is generated manifest inspection. Run a production build and a test build, then inspect the generated manifest. A production build writes `dist/`, so run this only during implementation, not during read-only planning:

    pnpm run build
    node -e "const m=require('./dist/manifest.json'); console.log(JSON.stringify({permissions:m.permissions, host_permissions:m.host_permissions, content_scripts:m.content_scripts?.map(s=>s.matches), web_accessible_resources:m.web_accessible_resources?.map(r=>({matches:r.matches, resources:r.resources}))}, null, 2));"

Expected production outcome after approved removal: `permissions` is `['storage']`; `host_permissions` is `undefined` or absent; `content_scripts` includes `https://chatgpt.com/*`, `https://chat.openai.com/*`, and `https://gemini.google.com/*`; `web_accessible_resources.matches` includes those same production hosts.

Then run the test build:

    pnpm run build:test
    node -e "const m=require('./dist/manifest.json'); console.log(JSON.stringify({permissions:m.permissions, host_permissions:m.host_permissions, content_scripts:m.content_scripts?.map(s=>s.matches), web_accessible_resources:m.web_accessible_resources?.map(r=>({matches:r.matches, resources:r.resources}))}, null, 2));"

Expected test outcome after approved removal: the same production hosts remain, and localhost plus 127.0.0.1 test patterns are present in content-script and web-accessible-resource matches.

Milestone 5 is deterministic regression. Run:

    pnpm run typecheck
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/platform.spec.ts
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/slash-popup.spec.ts --grep "opens the slash popup|inserts the active prompt|copies|opens the options page|does not open the popup when only a slash"
    xvfb-run -a env TMPDIR=/tmp PLAYWRIGHT_EXTENSION_HEADED=1 pnpm exec playwright test tests/e2e/gemini-slash-popup.spec.ts

Before merge, run the full deterministic suite:

    pnpm run test:e2e

Milestone 6 is live and manual support-site verification. Run the live ChatGPT suite only when external network and browser state are appropriate:

    pnpm run test:e2e:live

The required live outcome is that `chatgpt.com` insert/copy/options still work and `chat.openai.com` still initializes if the legacy host remains supported. Gemini public live smoke is currently skipped and should not become an F8 release blocker. For final manual verification, load the built extension unpacked, visit `chatgpt.com`, `chat.openai.com`, and a logged-in Gemini session if available, then confirm the `/ ` popup opens only on supported editor surfaces.

## Validation and Acceptance

The permission policy is accepted only if the source manifest and generated manifest agree with the intended policy. If `host_permissions` removal is approved, `dist/manifest.json` must not contain `host_permissions`, while `permissions` must still be exactly `storage`, and `content_scripts.matches` must still cover the supported production hosts. The generated manifest must still expose required web-accessible resources to the supported hosts so fonts and bundled content-script chunks load.

The supported-site policy is accepted only if all four surfaces align: `manifest.config.ts` match patterns, adapter `canHandle()` logic, README supported-site wording, and `package.json` description. The accepted production support table is:

    ChatGPT primary: https://chatgpt.com/*
    ChatGPT legacy compatibility: https://chat.openai.com/*
    Gemini: https://gemini.google.com/*

The deterministic behavior is accepted when `tests/e2e/platform.spec.ts` passes, supported local ChatGPT and Gemini fixtures still initialize, unsupported URLs do not initialize, duplicate reinjection guard still works, ChatGPT fixture prompt insertion/copy/options flows still work, and Gemini fixture trigger/insert/cleanup/no-submit regressions still pass.

The live behavior is accepted when `tests/live/live-chatgpt.spec.ts` still verifies `chatgpt.com` core flows and `chat.openai.com` initialization, unless a product decision explicitly removes legacy `chat.openai.com` support and the plan is updated to say so. The skipped Gemini public live smoke remains a documented limitation, not a failing F8 criterion.

The evidence-limited permission finding is accepted as resolved only when the implementation records the final decision. If host permissions are removed, the record must include the source search and manifest/test evidence. If host permissions are kept, the record must name the exact API or generated-manifest behavior that required deferral.

## Idempotence and Recovery

The work is safe to retry because manifest and metadata edits are small text changes, and builds regenerate `dist/`. Re-running `pnpm run build` and `pnpm run build:test` will overwrite generated extension output.

If removing `host_permissions` breaks content-script injection, font loading, duplicate reinjection, or live site initialization, restore the `host_permissions` field in `manifest.config.ts`, keep the metadata alignment if it is correct, update the manifest policy test to reflect the deferral, and record the blocker in `Decision Log` and `Outcomes & Retrospective`.

If a live site changes during implementation, do not silently remove support. Mark the affected live smoke as external-site unstable, keep deterministic coverage, and update the support policy only after a product decision.

Do not use destructive git commands such as `git reset --hard`, `git checkout --`, or `git clean -fd` to recover. Do not stage or commit until the implementing user explicitly asks for it.

## Artifacts and Notes

Official references checked during planning:

    Chrome content scripts documentation:
      https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
      Key point embedded in this plan: content_scripts.matches controls static content script injection.

    Chrome declare permissions documentation:
      https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
      Key point embedded in this plan: host_permissions grants host access for APIs such as host fetch, tabs URL/title access, programmatic injection, webRequest, cookies, or declarative network request.

    OpenAI Help "What is ChatGPT: FAQ":
      https://help.openai.com/en/articles/12677804
      Key point embedded in this plan: current ChatGPT web entry point is chatgpt.com.

Final source evidence:

    manifest.config.ts:
      defaultMatches = [
        'https://chatgpt.com/*',
        'https://chat.openai.com/*',
        'https://gemini.google.com/*',
      ]
      permissions: ['storage']
      host_permissions is not present
      web_accessible_resources.matches: contentScriptMatches
      content_scripts.matches: contentScriptMatches

    src/adapters/chatgpt.ts:
      CHATGPT_URL_PATTERN = /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/
      Test fixtures are allowed only in VITE_PROMPTIT_TEST_MODE.

    src/adapters/gemini.ts:
      GEMINI_URL_PATTERN = /^https:\/\/gemini\.google\.com(?:\/|$)/
      Test fixture is allowed only in VITE_PROMPTIT_TEST_MODE.

    README.md:
      Supported sites list ChatGPT primary, ChatGPT legacy host, and Gemini.

    package.json:
      Description mentions ChatGPT and Gemini.

Existing test evidence:

    tests/e2e/platform.spec.ts:
      Unsupported about:blank does not initialize.
      Unsupported localhost editor fixture does not initialize.
      Duplicate reinjection guard uses chrome.runtime.getManifest() and web_accessible_resources.

    tests/live/live-chatgpt.spec.ts:
      chatgpt.com live smoke covers insert, copy, and empty-state options open.
      chat.openai.com live smoke covers legacy host initialization.

    tests/live/live-gemini.spec.ts:
      gemini.google.com/app live smoke is skipped because it was not safe as a no-submit release gate.

Read-only subagent synthesis:

    The project code-mapper agent confirmed the manifest, adapter, metadata, API usage, and test ownership map. It found no runtime host-access APIs and highlighted that test-mode manifest injection is broader than adapter initialization by design.

    The project code-reviewer agent confirmed that host_permissions removal is supported by current source evidence, but should be deferred if programmatic injection, tab inspection, cookies, webRequest/DNR, host fetch, or generated-manifest resource loading requires host permissions.

## Interfaces and Dependencies

Do not add new package dependencies.

`manifest.config.ts` should remain the source of manifest policy. At the end of an approved removal, it should still define production matches and test matches, and should still use those matches for `content_scripts` and `web_accessible_resources`. The expected source shape is:

    const defaultMatches = [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      'https://gemini.google.com/*',
    ];
    const testMatches = ['http://127.0.0.1:*/*', 'http://localhost:*/*'];
    const contentScriptMatches = isTestMode
      ? [...defaultMatches, ...testMatches]
      : defaultMatches;

If removal is approved, there should be no `host_permissions` property in the exported manifest object.

`src/adapters/registry.ts` should continue exporting:

    resolveAdapterForUrl(url: string): BaseAdapter | null

`src/adapters/chatgpt.ts` should continue accepting `https://chatgpt.com` and `https://chat.openai.com` while legacy compatibility remains supported. `src/adapters/gemini.ts` should continue accepting `https://gemini.google.com`. Test fixture URL handling should remain gated by `VITE_PROMPTIT_TEST_MODE === '1'`.

`README.md`, `package.json`, and `manifest.config.ts` descriptions should use the same support scope. Prefer concise wording such as "ChatGPT and Gemini" or "supported AI sites" only if nearby documentation names the supported sites explicitly.

`tests/e2e/platform.spec.ts` should own manifest policy regression tests. Do not duplicate manifest assertions across slash-popup and Gemini behavior specs.

## Regressions to Guard Against

Do not remove or narrow `content_scripts.matches` for a supported production host unless product support for that host is intentionally dropped.

Do not remove or narrow `web_accessible_resources.matches` when removing `host_permissions`.

Do not make localhost fixture matches available in production builds.

Do not broaden production support to all OpenAI, all Google, or all HTTPS pages.

Do not remove `chat.openai.com` legacy compatibility without an explicit product decision and test updates.

Do not promote skipped public Gemini live smoke to a blocking release gate in F8.

Do not add optional host permissions unless a concrete runtime flow needs user-granted host API access. Static content-script injection should stay in `content_scripts.matches`.

Do not represent `chat.openai.com` as the primary ChatGPT URL in user-facing docs. Treat it as legacy compatibility if it remains supported.

## Plan Revision Note

Initial version created on 2026-05-11 by Codex. This plan incorporates the F8 triage findings, direct read-only inspection of manifest, adapter, metadata, testing files, existing generated manifest, official Chrome permission documentation, current OpenAI Help content for ChatGPT web access, and read-only project subagent feedback. It intentionally avoids changing evidence-limited permission findings before the implementation evidence gate.
