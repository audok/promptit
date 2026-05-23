import { expect, test as base, type Page } from '@playwright/test';

import {
  launchExtension,
  type LoadedExtension,
} from '../playwright/extension';
import {
  createPromptRecord,
  getComposer,
  getComposerText,
  getPopupTitles,
  openPromptPopup,
  waitForPromptPopupToClose,
} from '../playwright/promptit';

const CHATGPT_HOME_URL = 'https://chatgpt.com/';
const CHATGPT_ORIGIN = 'https://chatgpt.com';

const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await use(extension);
    await extension.close();
  },
});

async function openLiveChatGPT(page: Page): Promise<void> {
  await openLiveHost(page, CHATGPT_HOME_URL);
}

async function openLiveHost(page: Page, url: string): Promise<void> {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-ready',
    'true',
    { timeout: 20_000 },
  );
  await getComposer(page);
}

test.describe('chatgpt.com live smoke', () => {
  test('opens the popup and inserts a saved prompt', async ({
    extension,
  }) => {
    await extension.setPromptRecords([
      createPromptRecord({
        id: 'live-insert',
        title: '라이브 삽입',
        content: '실사이트 삽입 검증용 프롬프트',
        normalOrder: 1,
      }),
    ]);

    const page = await extension.context.newPage();
    await openLiveChatGPT(page);

    await openPromptPopup(page);
    await page.keyboard.press('Enter');
    await waitForPromptPopupToClose(page);

    await expect(await getComposerText(page)).toContain(
      '실사이트 삽입 검증용 프롬프트',
    );
  });

  test('copies a saved prompt from the real ChatGPT composer', async ({
    extension,
  }) => {
    await extension.context.grantPermissions(
      ['clipboard-read', 'clipboard-write'],
      { origin: CHATGPT_ORIGIN },
    );
    await extension.setPromptRecords([
      createPromptRecord({
        id: 'live-copy-1',
        title: '라이브 번역',
        content: '실사이트 복사 검증용 프롬프트',
        normalOrder: 1,
      }),
      createPromptRecord({
        id: 'live-copy-2',
        title: '라이브 복사',
        content: '클립보드로 복사되는 프롬프트',
        normalOrder: 2,
      }),
    ]);

    const page = await extension.context.newPage();
    await openLiveChatGPT(page);

    await openPromptPopup(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await waitForPromptPopupToClose(page);

    await expect(await getComposerText(page)).toBe('');
    await expect(
      await page.evaluate(() => navigator.clipboard.readText()),
    ).toBe('클립보드로 복사되는 프롬프트');
  });

  test('opens the options page from the empty state on chatgpt.com', async ({
    extension,
  }) => {
    await extension.setPromptRecords([]);

    const page = await extension.context.newPage();
    await openLiveChatGPT(page);

    await openPromptPopup(page);
    await expect(await getPopupTitles(page)).toEqual([
      '저장된 프롬프트가 없습니다.',
    ]);

    const optionsPagePromise = extension.context.waitForEvent('page');
    await page.keyboard.press('Enter');
    await waitForPromptPopupToClose(page);

    const optionsPage = await optionsPagePromise;
    await optionsPage.waitForLoadState('domcontentloaded');

    await expect(optionsPage).toHaveTitle(/promptit Settings/i);
    await expect(await getComposerText(page)).toBe('');
  });
});
