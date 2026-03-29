import { expect, test as base } from '@playwright/test';

import {
  launchExtension,
  type LoadedExtension,
} from '../playwright/extension';
import {
  CONTENTEDITABLE_FIXTURE_URL,
  openFixturePage,
} from '../playwright/promptit';

const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await use(extension);
    await extension.close();
  },
});

test('opens the options page when the content script sends the runtime message', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  const optionsPagePromise = extension.context.waitForEvent('page');

  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('promptit:test-open-options-page'),
    );
  });

  const optionsPage = await optionsPagePromise;
  await optionsPage.waitForLoadState('domcontentloaded');

  await expect(optionsPage).toHaveTitle(/Promptit Settings/i);
  await expect(optionsPage.getByText('Promptit Sprint 3')).toBeVisible();
});

test('does not initialize Promptit on unsupported URLs', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await page.goto('about:blank');
  await page.waitForTimeout(150);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return {
          initialized:
            '__promptitContentInitialized__' in window &&
            Object.prototype.hasOwnProperty.call(
              window,
              '__promptitContentInitialized__',
            ),
          readyAttribute:
            document.documentElement.getAttribute('data-promptit-ready'),
        };
      });
    })
    .toEqual({
      initialized: false,
      readyAttribute: null,
    });
});
