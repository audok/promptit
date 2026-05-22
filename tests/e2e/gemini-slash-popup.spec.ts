import { expect, test as base } from '@playwright/test';

import { launchExtension, type LoadedExtension } from '../playwright/extension';
import {
  clearComposer,
  createPromptRecord,
  GEMINI_COMPOSER_SELECTOR,
  GEMINI_FIXTURE_URL,
  getComposerText,
  getPopupTitles,
  openFixturePage,
  openPromptPopup,
  waitForPromptPopupToClose,
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

const geminiPrompts = [
  createPromptRecord({
    id: 'gemini-prompt-translate',
    title: 'Gemini 번역',
    content: 'Gemini에서 자연스럽게 번역해줘.',
    normalOrder: 10,
  }),
  createPromptRecord({
    id: 'gemini-prompt-summary',
    title: 'Gemini 요약',
    content: 'Gemini에서 핵심만 요약해줘.',
    normalOrder: 20,
  }),
];

async function dispatchNestedChildGeminiInput(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate((composerSelector) => {
    const composer = document.querySelector(composerSelector);

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Gemini composer not found.');
    }

    const child = document.createElement('span');
    child.textContent = '/ ';
    composer.replaceChildren(child);
    composer.focus();

    const textNode = child.firstChild;
    const selection = window.getSelection();

    if (!(textNode instanceof Text) || !selection) {
      throw new Error('Failed to prepare Gemini child selection.');
    }

    const range = document.createRange();
    range.setStart(textNode, textNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    child.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
  }, GEMINI_COMPOSER_SELECTOR);
}

test('initializes Promptit on the Gemini fixture', async ({ extension }) => {
  const page = await extension.context.newPage();
  await openFixturePage(page, GEMINI_FIXTURE_URL, GEMINI_COMPOSER_SELECTOR);

  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-ready',
    'true',
  );
});

test('opens the slash popup from the Gemini composer', async ({ extension }) => {
  await extension.setPromptRecords(geminiPrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, GEMINI_FIXTURE_URL, GEMINI_COMPOSER_SELECTOR);

  await openPromptPopup(page, GEMINI_COMPOSER_SELECTOR);

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(await getPopupTitles(page)).toEqual([
    'Gemini 번역',
    'Gemini 요약',
  ]);
});

test('inserts the active prompt and replaces the Gemini trigger text', async ({
  extension,
}) => {
  await extension.setPromptRecords(geminiPrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, GEMINI_FIXTURE_URL, GEMINI_COMPOSER_SELECTOR);

  await openPromptPopup(page, GEMINI_COMPOSER_SELECTOR);
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(page.locator('[data-testid="gemini-host-submit-count"]')).toHaveText(
    '0',
  );
  await expect(page.locator('[data-testid="gemini-host-submit-text"]')).toHaveText(
    '',
  );
  await expect(await getComposerText(page, GEMINI_COMPOSER_SELECTOR)).toBe(
    'Gemini에서 자연스럽게 번역해줘.',
  );
});

test('reads the Gemini prompt body on selection instead of popup open', async ({
  extension,
}) => {
  const prompt = createPromptRecord({
    id: 'gemini-body-on-select',
    title: 'Gemini 지연 본문',
    content: 'Gemini 처음 본문',
    normalOrder: 1,
  });

  await extension.setPromptRecords([prompt]);

  const page = await extension.context.newPage();
  await openFixturePage(page, GEMINI_FIXTURE_URL, GEMINI_COMPOSER_SELECTOR);

  await openPromptPopup(page, GEMINI_COMPOSER_SELECTOR);
  await extension.setPromptRecords([
    createPromptRecord({
      ...prompt,
      content: 'Gemini 선택 시점 본문',
      bodyUpdatedAt: '2026-03-29T00:12:00.000Z',
      updatedAt: '2026-03-29T00:12:00.000Z',
    }),
  ]);
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(page.locator('[data-testid="gemini-host-submit-count"]')).toHaveText(
    '0',
  );
  await expect(await getComposerText(page, GEMINI_COMPOSER_SELECTOR)).toBe(
    'Gemini 선택 시점 본문',
  );
});

test('opens from a nested Gemini child input event and inserts the active prompt', async ({
  extension,
}) => {
  await extension.setPromptRecords(geminiPrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, GEMINI_FIXTURE_URL, GEMINI_COMPOSER_SELECTOR);

  await dispatchNestedChildGeminiInput(page);

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(await getPopupTitles(page)).toEqual([
    'Gemini 번역',
    'Gemini 요약',
  ]);

  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(page.locator('[data-testid="gemini-host-submit-count"]')).toHaveText(
    '0',
  );
  await expect(page.locator('[data-testid="gemini-host-submit-text"]')).toHaveText(
    '',
  );
  await expect(await getComposerText(page, GEMINI_COMPOSER_SELECTOR)).toBe(
    'Gemini에서 자연스럽게 번역해줘.',
  );
});

test('cleans up Gemini trigger text on escape and backspace', async ({
  extension,
}) => {
  await extension.setPromptRecords(geminiPrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, GEMINI_FIXTURE_URL, GEMINI_COMPOSER_SELECTOR);

  await openPromptPopup(page, GEMINI_COMPOSER_SELECTOR);
  await page.keyboard.press('Escape');
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page, GEMINI_COMPOSER_SELECTOR)).toBe('');

  await clearComposer(page, GEMINI_COMPOSER_SELECTOR);
  await openPromptPopup(page, GEMINI_COMPOSER_SELECTOR);
  await page.keyboard.press('Backspace');
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page, GEMINI_COMPOSER_SELECTOR)).toBe('');
});

test('ignores Gemini ql-clipboard edits', async ({ extension }) => {
  await extension.setPromptRecords(geminiPrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, GEMINI_FIXTURE_URL, GEMINI_COMPOSER_SELECTOR);

  await page.evaluate(() => {
    const clipboard = document.querySelector('[data-testid="gemini-clipboard"]');

    if (!(clipboard instanceof HTMLElement)) {
      throw new Error('Gemini clipboard fixture not found.');
    }

    clipboard.textContent = '/ ';
    clipboard.focus();

    const textNode = clipboard.firstChild;
    const selection = window.getSelection();

    if (!(textNode instanceof Text) || !selection) {
      throw new Error('Failed to prepare clipboard selection.');
    }

    const range = document.createRange();
    range.setStart(textNode, textNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    clipboard.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
  });

  await page.waitForTimeout(150);
  await waitForPromptPopupToClose(page);
});

test('anchors the Gemini popup to the composer wrapper', async ({
  extension,
}) => {
  await extension.setPromptRecords(geminiPrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, GEMINI_FIXTURE_URL, GEMINI_COMPOSER_SELECTOR);

  await openPromptPopup(page, GEMINI_COMPOSER_SELECTOR);

  const snapshot = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');
    const wrapper = document.querySelector('[data-testid="gemini-composer-wrapper"]');
    const editor = document.querySelector('[data-testid="gemini-composer"]');

    if (
      !(host instanceof HTMLElement) ||
      !(wrapper instanceof HTMLElement) ||
      !(editor instanceof HTMLElement)
    ) {
      throw new Error('Gemini anchor elements not found.');
    }

    return {
      popupWidth: host.getBoundingClientRect().width,
      wrapperWidth: wrapper.getBoundingClientRect().width,
      editorWidth: editor.getBoundingClientRect().width,
    };
  });

  expect(Math.abs(snapshot.popupWidth - snapshot.wrapperWidth)).toBeLessThan(1);
  expect(snapshot.popupWidth).toBeGreaterThan(snapshot.editorWidth + 80);
});
