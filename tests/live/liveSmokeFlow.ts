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
import {
  behaviorFailure,
  environmentBlocked,
  runLiveStep,
} from './liveSmokeClassification';
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
      behaviorMessage: 'could not navigate to the live site',
    },
    async () => {
      let response;

      try {
        response = await page.goto(adapter.startUrl, {
          waitUntil: 'domcontentloaded',
        });
      } catch (error) {
        throw environmentBlocked(
          adapter.name,
          'open site',
          'navigation failed before the live site could be exercised',
          error,
        );
      }

      const status = response?.status();

      if (
        status === 401 ||
        status === 403 ||
        status === 429 ||
        (status !== undefined && status >= 500)
      ) {
        throw environmentBlocked(
          adapter.name,
          'open site',
          `live site returned HTTP ${status}`,
        );
      }
    },
  );

  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'detect blockers after navigation',
      behaviorMessage: 'could not inspect the live site for blocking UI',
    },
    async () => {
      const blockerReason = await adapter.detectEnvironmentBlockers(page);

      if (blockerReason) {
        throw environmentBlocked(
          adapter.name,
          'detect blockers after navigation',
          blockerReason,
        );
      }
    },
  );

  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'wait for Promptit ready marker',
      behaviorMessage:
        'Promptit did not mark the real site ready after the composer became available',
    },
    async () => {
      const ready = await page
        .locator('html')
        .getAttribute('data-promptit-ready', { timeout: 20_000 })
        .catch(() => null);

      if (ready === 'true') {
        return;
      }

      const blockerReason = await adapter.detectEnvironmentBlockers(page);

      if (blockerReason) {
        throw environmentBlocked(
          adapter.name,
          'wait for Promptit ready marker',
          blockerReason,
        );
      }

      const composerVisible = await page
        .locator(adapter.composerSelector)
        .first()
        .isVisible({ timeout: 1_000 })
        .catch(() => false);

      if (composerVisible) {
        throw behaviorFailure(
          adapter.name,
          'wait for Promptit ready marker',
          'composer is visible, but Promptit never set html[data-promptit-ready="true"]',
        );
      }

      // Let the composer step classify a missing production-supported composer.
      return;
    },
  );

  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'find composer',
      behaviorMessage: 'Promptit could not find the real site composer',
    },
    async () => {
      const blockerReason = await adapter.detectEnvironmentBlockers(page);

      if (blockerReason) {
        throw environmentBlocked(adapter.name, 'find composer', blockerReason);
      }

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
      behaviorMessage: 'saved prompt titles did not render in the popup',
    },
    async () => {
      await expect.poll(async () => await getPopupTitles(page)).toEqual(titles);
    },
  );
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
              behaviorMessage:
                'the `/ ` trigger did not open the Promptit popup',
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
        title: 'inserts a saved prompt without submitting on the real site',
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
              behaviorMessage:
                'the selected prompt did not remain in the real site composer',
            },
            async () => {
              await openPromptPopup(page, adapter.composerSelector);
              await page.keyboard.press('Enter');
              await waitForPromptPopupToClose(page);

              const composerText = await adapter.readComposerText(page);

              if (composerText.includes(promptContent)) {
                return;
              }

              const submittedText = await adapter.readSubmittedText(page);

              if (
                composerText === '' &&
                submittedText?.includes(promptContent)
              ) {
                throw behaviorFailure(
                  adapter.name,
                  'insert saved prompt',
                  'prompt text appears to have submitted or moved out of the composer',
                );
              }

              throw behaviorFailure(
                adapter.name,
                'insert saved prompt',
                `composer text did not contain the saved prompt; observed ${JSON.stringify(composerText)}`,
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
              behaviorMessage: 'clipboard permissions could not be granted',
            },
            async () => {
              try {
                await extension.context.grantPermissions(
                  ['clipboard-read', 'clipboard-write'],
                  { origin: adapter.origin },
                );
              } catch (error) {
                throw environmentBlocked(
                  adapter.name,
                  'grant clipboard permissions',
                  'Chromium denied clipboard permissions for the live origin',
                  error,
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
              behaviorMessage:
                'the popup copy command did not copy the selected prompt',
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
                  throw environmentBlocked(
                    adapter.name,
                    'copy saved prompt',
                    'Chromium or the live origin denied clipboard readback',
                    error,
                  );
                });

              expect(clipboardText).toBe(`${adapter.name} clipboard prompt body`);
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
              behaviorMessage:
                'the popup pin command did not persist pinned state on the live site',
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
        title: 'opens the options page from the real site empty state',
        run: async ({ extension }, testInfo) => {
          await extension.setPromptRecords([]);

          const page = await newLivePage(extension, adapter, testInfo);

          await runLiveStep(
            testInfo,
            {
              site: adapter.name,
              step: 'open options from empty state',
              behaviorMessage:
                'the popup empty state did not open the extension options page',
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
