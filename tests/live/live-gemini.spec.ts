import { expect, test as base, type Page } from '@playwright/test';

import {
  launchExtension,
  type LoadedExtension,
} from '../playwright/extension';
import {
  createPromptItem,
  GEMINI_COMPOSER_SELECTOR,
  getComposer,
  getComposerText,
  openPromptPopup,
  waitForPromptPopupToClose,
} from '../playwright/promptit';

const GEMINI_APP_URL = 'https://gemini.google.com/app';

const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await use(extension);
    await extension.close();
  },
});

async function openLiveGemini(page: Page): Promise<void> {
  await page.goto(GEMINI_APP_URL, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-ready',
    'true',
    { timeout: 20_000 },
  );
  await getComposer(page, GEMINI_COMPOSER_SELECTOR);
}

test.describe.skip('gemini.google.com live smoke', () => {
  // Public Gemini currently moves the selected Promptit text into page-level
  // submitted state and clears the composer, so this is not a safe no-submit
  // live smoke. Keep deterministic Gemini coverage in tests/e2e instead.
  test('opens the popup and inserts a saved prompt', async ({
    extension,
  }) => {
    await extension.setPrompts([
      createPromptItem({
        id: 'live-gemini-insert',
        title: 'Gemini 라이브 삽입',
        content: 'Gemini 실사이트 삽입 검증용 프롬프트',
        sortOrder: 1,
      }),
    ]);

    const page = await extension.context.newPage();
    await openLiveGemini(page);

    await openPromptPopup(page, GEMINI_COMPOSER_SELECTOR);
    await page.keyboard.press('Enter');
    await waitForPromptPopupToClose(page);

    await expect(await getComposerText(page, GEMINI_COMPOSER_SELECTOR)).toContain(
      'Gemini 실사이트 삽입 검증용 프롬프트',
    );
  });
});
