import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

import {
  launchExtension,
  type LoadedExtension,
} from '../playwright/extension';
import {
  createPromptRecord,
  getComposer,
  getPopupTitles,
  openPromptPopup,
  waitForPromptPopupToClose,
} from '../playwright/promptit';
import { runLiveStep } from './liveSmokeClassification';
import type { LiveSiteAdapter } from './liveSiteAdapters';

export const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();

    try {
      await extension.setLanguagePreference('en');
      await use(extension);
    } finally {
      await extension.close();
    }
  },
});

type LiveSmokeTestArgs = {
  extension: LoadedExtension;
};

export type LiveSmokeTestCase = {
  readonly title: string;
  readonly run: (
    args: LiveSmokeTestArgs,
    testInfo: TestInfo,
  ) => Promise<void>;
};

export type LiveSmokeSuite = {
  readonly title: string;
  readonly tests: readonly LiveSmokeTestCase[];
};

async function openLiveSite(
  adapter: LiveSiteAdapter,
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'open site',
    },
    async () => {
      await page.goto(adapter.startUrl, {
        waitUntil: 'domcontentloaded',
      });
    },
  );

  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'wait for Promptit ready marker',
    },
    async () => {
      await expect(page.locator('html')).toHaveAttribute(
        'data-promptit-ready',
        'true',
        { timeout: 20_000 },
      );
    },
  );

  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'find composer',
    },
    async () => {
      await getComposer(page, adapter.composerSelector);
    },
  );
}

async function newLivePage(
  extension: LoadedExtension,
  adapter: LiveSiteAdapter,
  testInfo: TestInfo,
): Promise<Page> {
  const page = await extension.context.newPage();
  await openLiveSite(adapter, page, testInfo);
  return page;
}

async function expectPopupTitles(
  adapter: LiveSiteAdapter,
  page: Page,
  testInfo: TestInfo,
  titles: string[],
): Promise<void> {
  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'verify popup titles',
    },
    async () => {
      await expect.poll(async () => await getPopupTitles(page)).toEqual(titles);
    },
  );
}

function normalizeComposerText(text: string): string {
  return text.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n');
}

async function readVisibleComposerText(
  page: Page,
  composerSelector: string,
): Promise<string> {
  const composer = await getComposer(page, composerSelector);
  const text = await composer.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) {
      return element.value;
    }

    if (element instanceof HTMLElement) {
      return element.innerText;
    }

    return element.textContent ?? '';
  });

  return normalizeComposerText(text);
}

async function expectComposerContainsVisibleText(
  composerText: string,
  expectedTexts: readonly string[],
): Promise<void> {
  const normalizedComposerText = normalizeComposerText(composerText);
  const missingText = expectedTexts.find(
    (expectedText) => !normalizedComposerText.includes(expectedText),
  );

  if (!missingText) {
    return;
  }

  throw new Error(
    `composer text did not contain ${JSON.stringify(missingText)}; observed ${JSON.stringify(normalizedComposerText)}`,
  );
}

async function expectComposerPreservesMultilinePrompt(
  composerText: string,
  firstLine: string,
  secondLine: string,
): Promise<void> {
  await expectComposerContainsVisibleText(
    composerText,
    [firstLine, secondLine],
  );

  const normalizedComposerText = normalizeComposerText(composerText);
  const firstLineIndex = normalizedComposerText.indexOf(firstLine);
  const secondLineIndex = normalizedComposerText.indexOf(
    secondLine,
    firstLineIndex + firstLine.length,
  );
  const textBetweenLines = normalizedComposerText.slice(
    firstLineIndex + firstLine.length,
    secondLineIndex,
  );

  if (secondLineIndex === -1 || !textBetweenLines.includes('\n')) {
    throw new Error(
      `visible composer text did not preserve the multiline prompt line break; observed ${JSON.stringify(normalizedComposerText)}`,
    );
  }
}

async function expectComposerContainsOrderedTextWithoutTrigger(
  composerText: string,
  prefix: string,
  promptContent: string,
): Promise<void> {
  const normalizedComposerText = normalizeComposerText(composerText);
  const prefixIndex = normalizedComposerText.indexOf(prefix);

  if (prefixIndex === -1) {
    throw new Error(
      `composer text did not contain prefix ${JSON.stringify(prefix)}; observed ${JSON.stringify(normalizedComposerText)}`,
    );
  }

  const promptContentIndex = normalizedComposerText.indexOf(
    promptContent,
    prefixIndex + prefix.length,
  );

  if (promptContentIndex === -1) {
    throw new Error(
      `composer text did not contain prompt content ${JSON.stringify(promptContent)} after prefix ${JSON.stringify(prefix)}; observed ${JSON.stringify(normalizedComposerText)}`,
    );
  }

  const textBetweenPrefixAndPrompt = normalizedComposerText.slice(
    prefixIndex + prefix.length,
    promptContentIndex,
  );

  if (textBetweenPrefixAndPrompt.includes('/ ')) {
    throw new Error(
      `composer text left the trigger between prefix and prompt content; observed ${JSON.stringify(normalizedComposerText)}`,
    );
  }
}

async function clickPopupFooterSettingsButton(page: Page): Promise<void> {
  const settingsButton = page.locator(
    '.promptit-footer-button[data-action="open-options"]',
  );

  try {
    await settingsButton.click({ timeout: 2_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="promptit-popup-host"]');
      const root = host?.shadowRoot;
      const button = root?.querySelector<HTMLButtonElement>(
        '.promptit-footer-button[data-action="open-options"], [data-action="open-options"].promptit-footer-button',
      );

      return {
        hasPopupHost: Boolean(host),
        hasOpenShadowRoot: Boolean(root),
        hasSettingsButton: button instanceof HTMLButtonElement,
        isSettingsButtonDisabled:
          button instanceof HTMLButtonElement ? button.disabled : null,
      };
    });

    throw new Error(
      `Playwright could not click the popup footer settings control: ${JSON.stringify(diagnostics)}`,
      { cause: error },
    );
  }
}

export function createLiveSmokeSuite(adapter: LiveSiteAdapter): LiveSmokeSuite {
  return {
    title: `${adapter.startUrl} live smoke`,
    tests: [
      {
        title: 'opens the popup on the real site',
        run: async ({ extension }, testInfo) => {
          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-popup-1`,
              title: `${adapter.name} live translate`,
              content: `${adapter.name} live popup first prompt`,
              normalOrder: 1,
            }),
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-popup-2`,
              title: `${adapter.name} live summarize`,
              content: `${adapter.name} live popup second prompt`,
              normalOrder: 2,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'open popup',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await expect(
                page.locator('[data-testid="promptit-popup"]'),
              ).toBeVisible();
            },
          );
          await expectPopupTitles(adapter, page, testInfo, [
            `${adapter.name} live translate`,
            `${adapter.name} live summarize`,
          ]);
        },
      },
      {
        title: 'closes the popup with Escape and cleans up the trigger on the real site',
        run: async ({ extension }, testInfo) => {
          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-escape-cleanup`,
              title: `${adapter.name} live cleanup`,
              content: `${adapter.name} live cleanup prompt`,
              normalOrder: 1,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'close popup with Escape',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await page.keyboard.press('Escape');
              await waitForPromptPopupToClose(page);

              const composerText = normalizeComposerText(
                await adapter.readComposerText(page),
              );

              if (composerText !== '') {
                throw new Error(
                  `composer was not empty after Escape cleanup; observed ${JSON.stringify(composerText)}`,
                );
              }
            },
          );
        },
      },
      {
        title: 'inserts a saved prompt and keeps it visible in the composer on the real site',
        run: async ({ extension }, testInfo) => {
          const promptContent = `${adapter.name} live insert prompt body`;

          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-insert`,
              title: `${adapter.name} live insert`,
              content: promptContent,
              normalOrder: 1,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'insert saved prompt',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await page.keyboard.press('Enter');
              await waitForPromptPopupToClose(page);

              await expectComposerContainsVisibleText(
                await adapter.readComposerText(page),
                [promptContent],
              );
            },
          );
        },
      },
      {
        title: 'preserves existing composer text and keeps the inserted prompt visible on the real site',
        run: async ({ extension }, testInfo) => {
          const prefix = `${adapter.name} live prefix: `;
          const promptContent = `${adapter.name} live preserved prompt body`;

          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-preserve-prefix`,
              title: `${adapter.name} live preserve prefix`,
              content: promptContent,
              normalOrder: 1,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'insert saved prompt after existing text',
            },
            async () => {
              const composer = await getComposer(page, adapter.composerSelector);
              await composer.click();
              await page.keyboard.type(prefix);
              await expect
                .poll(async () => await adapter.readComposerText(page))
                .toContain(prefix);

              await page.keyboard.type('/ ');
              await expect(
                page.locator('[data-testid="promptit-popup"]'),
              ).toBeVisible();
              await page.keyboard.press('Enter');
              await waitForPromptPopupToClose(page);

              await expectComposerContainsOrderedTextWithoutTrigger(
                await adapter.readComposerText(page),
                prefix,
                promptContent,
              );
            },
          );
        },
      },
      {
        title: 'inserts multiline prompts visibly in the composer on the real site',
        run: async ({ extension }, testInfo) => {
          const firstLine = 'line 1';
          const secondLine = 'line 2';
          const promptContent = `${firstLine}\n${secondLine}`;

          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-multiline`,
              title: `${adapter.name} live multiline`,
              content: promptContent,
              normalOrder: 1,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'insert multiline prompt',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await page.keyboard.press('Enter');
              await waitForPromptPopupToClose(page);

              await expectComposerPreservesMultilinePrompt(
                await readVisibleComposerText(page, adapter.composerSelector),
                firstLine,
                secondLine,
              );
            },
          );
        },
      },
      {
        title: 'copies a saved prompt from the real site',
        run: async ({ extension }, testInfo) => {
          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'grant clipboard permissions',
            },
            async () => {
              try {
                await extension.context.grantPermissions(
                  ['clipboard-read', 'clipboard-write'],
                  { origin: adapter.origin },
                );
              } catch (error) {
                throw new Error(
                  'Chromium denied clipboard permissions for the live origin',
                  { cause: error },
                );
              }
            },
          );

          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-copy-1`,
              title: `${adapter.name} live draft`,
              content: `${adapter.name} live first copy prompt`,
              normalOrder: 1,
            }),
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-copy-2`,
              title: `${adapter.name} live copy`,
              content: `${adapter.name} clipboard prompt body`,
              normalOrder: 2,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'copy saved prompt',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await page.keyboard.press('ArrowDown');
              await page.keyboard.press('ArrowRight');
              await page.keyboard.press('Enter');
              await waitForPromptPopupToClose(page);

              const clipboardText = await page
                .evaluate(() => navigator.clipboard.readText())
                .catch((error: unknown) => {
                  throw new Error(
                    'Chromium or the live origin denied clipboard readback',
                    { cause: error },
                  );
                });

              expect(clipboardText).toBe(`${adapter.name} clipboard prompt body`);
            },
          );
        },
      },
      {
        title: 'persists pinned ordering after reopening the real site popup',
        run: async ({ extension }, testInfo) => {
          const firstTitle = `${adapter.name} live first normal`;
          const secondTitle = `${adapter.name} live second pinned later`;

          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-reopen-pin-first`,
              title: firstTitle,
              content: `${adapter.name} live first normal prompt`,
              normalOrder: 1,
            }),
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-reopen-pin-second`,
              title: secondTitle,
              content: `${adapter.name} live second normal prompt`,
              normalOrder: 2,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'persist pinned ordering after reopen',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await expectPopupTitles(adapter, page, testInfo, [
                firstTitle,
                secondTitle,
              ]);

              await page.keyboard.press('ArrowDown');
              await page.keyboard.press('ArrowLeft');
              await page.keyboard.press('Enter');

              await expect
                .poll(async () => {
                  return (await extension.getPromptMetas()).find(
                    (prompt) =>
                      prompt.id ===
                      `${adapter.name.toLowerCase()}-live-reopen-pin-second`,
                  )?.pinned;
                })
                .toBe(true);

              await page.keyboard.press('Escape');
              await waitForPromptPopupToClose(page);

              await openPromptPopup(page, adapter.composerSelector);
              await expectPopupTitles(adapter, page, testInfo, [
                secondTitle,
                firstTitle,
              ]);
            },
          );
        },
      },
      {
        title: 'toggles pinned state from the real site popup',
        run: async ({ extension }, testInfo) => {
          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-pin-normal`,
              title: `${adapter.name} live normal`,
              content: `${adapter.name} live normal prompt`,
              normalOrder: 1,
            }),
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-pin-pinned`,
              title: `${adapter.name} live pinned`,
              content: `${adapter.name} live pinned prompt`,
              normalOrder: 2,
              pinned: true,
              pinnedOrder: 1,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'toggle pinned state',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await expectPopupTitles(adapter, page, testInfo, [
                `${adapter.name} live pinned`,
                `${adapter.name} live normal`,
              ]);
              await page.keyboard.press('ArrowDown');
              await page.keyboard.press('ArrowLeft');
              await page.keyboard.press('Enter');

              await expect(
                page.locator('[data-testid="promptit-popup"]'),
              ).toBeVisible();
              await expect
                .poll(async () => {
                  return (await extension.getPromptMetas()).find(
                    (prompt) =>
                      prompt.id ===
                      `${adapter.name.toLowerCase()}-live-pin-normal`,
                  )?.pinned;
                })
                .toBe(true);
            },
          );
        },
      },
      {
        title: 'opens the options page from a non-empty real site popup',
        run: async ({ extension }, testInfo) => {
          await extension.setPromptRecords([
            createPromptRecord({
              id: `${adapter.name.toLowerCase()}-live-non-empty-options`,
              title: `${adapter.name} live options prompt`,
              content: `${adapter.name} live options prompt body`,
              normalOrder: 1,
            }),
          ]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'open options from non-empty popup',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await expect(
                page.locator('[data-testid="promptit-popup"]'),
              ).toBeVisible();

              const optionsPagePromise = extension.context.waitForEvent('page');
              await clickPopupFooterSettingsButton(page);

              const optionsPage = await optionsPagePromise;
              await optionsPage.waitForLoadState('domcontentloaded');
              await expect(optionsPage).toHaveTitle(/promptit Settings/i);
            },
          );
        },
      },
      {
        title: 'opens the options page from the real site empty state',
        run: async ({ extension }, testInfo) => {
          await extension.setPromptRecords([]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'open options from empty state',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await expectPopupTitles(adapter, page, testInfo, [
                'No saved prompts.',
              ]);

              const optionsPagePromise = extension.context.waitForEvent('page');
              await page.keyboard.press('Enter');
              await waitForPromptPopupToClose(page);

              const optionsPage = await optionsPagePromise;
              await optionsPage.waitForLoadState('domcontentloaded');
              await expect(optionsPage).toHaveTitle(/promptit Settings/i);
            },
          );
        },
      },
    ],
  };
}

export function runLiveSmokeSuite(adapter: LiveSiteAdapter): void {
  const suite = createLiveSmokeSuite(adapter);

  test.describe(suite.title, () => {
    for (const liveTest of suite.tests) {
      test(liveTest.title, liveTest.run);
    }
  });
}
