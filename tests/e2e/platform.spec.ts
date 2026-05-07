import { expect, test as base } from '@playwright/test';

import {
  launchExtension,
  type LoadedExtension,
} from '../playwright/extension';
import {
  CONTENTEDITABLE_FIXTURE_URL,
  EDITOR_FIXTURE_URL,
  openFixturePage,
} from '../playwright/promptit';

async function getServiceWorker(extension: LoadedExtension) {
  const [serviceWorker] = extension.context.serviceWorkers();

  if (serviceWorker) {
    return serviceWorker;
  }

  return await extension.context.waitForEvent('serviceworker');
}

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

test('ignores malformed runtime messages without opening the options page', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  const pageCountBefore = extension.context.pages().length;

  const optionsPagePromise = extension.context.waitForEvent('page', {
    timeout: 500,
  });
  const serviceWorker = await getServiceWorker(extension);

  await serviceWorker.evaluate(async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'promptit/malformed-runtime-message',
        payload: { invalid: true },
      });
    } catch {
      // Malformed messages are intentionally ignored by the background listener.
    }
  });

  await expect(optionsPagePromise).rejects.toThrow(/Timeout/);
  await expect(extension.context.pages()).toHaveLength(pageCountBefore);
  await expect(page.locator('[data-testid="promptit-popup"]')).toHaveCount(0);
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

test('does not initialize Promptit on unsupported localhost fixtures', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await page.goto(EDITOR_FIXTURE_URL, {
    waitUntil: 'domcontentloaded',
  });
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
