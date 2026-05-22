import { randomUUID } from 'node:crypto';

import { expect, type BrowserContext, type Page } from '@playwright/test';

import {
  PROMPT_ORDER_GAP,
  type PromptBody,
  type PromptMeta,
  type PromptRecord,
} from '../../src/prompt/schema';

export const FIXTURE_ORIGIN = 'http://127.0.0.1:4173';
export const CONTENTEDITABLE_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/chatgpt-contenteditable.html`;
export const TEXTAREA_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/chatgpt-textarea.html`;
export const EDITOR_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/editor.html`;
export const GEMINI_FIXTURE_URL =
  `${FIXTURE_ORIGIN}/gemini-contenteditable.html`;

const CHATGPT_COMPOSER_SELECTOR = [
  'textarea#prompt-textarea',
  'textarea[data-testid="prompt-textarea"]',
  'div#prompt-textarea[contenteditable="true"]',
  'div[data-testid="prompt-textarea"][contenteditable="true"]',
  'div#prompt-textarea[contenteditable="true"][data-lexical-editor="true"]',
  'div[data-testid="prompt-textarea"][contenteditable="true"][data-lexical-editor="true"]',
  'div#prompt-textarea.ProseMirror[contenteditable="true"]',
  'div[data-testid="prompt-textarea"].ProseMirror[contenteditable="true"]',
].join(', ');
export const GEMINI_COMPOSER_SELECTOR =
  'rich-textarea div.ql-editor[contenteditable="true"][role="textbox"], div.ql-editor.textarea[contenteditable="true"][role="textbox"]';
const COMPOSER_SELECTOR = [
  CHATGPT_COMPOSER_SELECTOR,
  GEMINI_COMPOSER_SELECTOR,
].join(', ');

function getPromptTimestamp(overrides: {
  createdAt?: string;
  updatedAt?: string;
  bodyUpdatedAt?: string;
}): string {
  return (
    overrides.updatedAt ??
    overrides.bodyUpdatedAt ??
    overrides.createdAt ??
    new Date('2026-03-29T00:00:00.000Z').toISOString()
  );
}

export function createPromptMeta(overrides: {
  title: string;
  content?: string;
  normalOrder?: number;
  pinned?: boolean;
  pinnedOrder?: number | null;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  bodyUpdatedAt?: string;
  charCount?: number;
}): PromptMeta {
  const timestamp = getPromptTimestamp(overrides);
  const content = overrides.content ?? '';

  return {
    id: overrides.id ?? randomUUID(),
    title: overrides.title,
    pinned: overrides.pinned ?? false,
    normalOrder: overrides.normalOrder ?? PROMPT_ORDER_GAP,
    pinnedOrder: overrides.pinned ? (overrides.pinnedOrder ?? PROMPT_ORDER_GAP) : null,
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
    bodyUpdatedAt: overrides.bodyUpdatedAt ?? timestamp,
    charCount: overrides.charCount ?? Array.from(content).length,
  };
}

export function createPromptBody(overrides: {
  id: string;
  content: string;
  updatedAt?: string;
  bodyUpdatedAt?: string;
}): PromptBody {
  return {
    id: overrides.id,
    content: overrides.content,
    updatedAt:
      overrides.updatedAt ??
      overrides.bodyUpdatedAt ??
      new Date('2026-03-29T00:00:00.000Z').toISOString(),
  };
}

export function createPromptRecord(overrides: {
  title: string;
  content: string;
  normalOrder?: number;
  pinned?: boolean;
  pinnedOrder?: number | null;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  bodyUpdatedAt?: string;
  charCount?: number;
}): PromptRecord {
  const meta = createPromptMeta(overrides);

  return {
    ...meta,
    content: overrides.content,
  };
}

export async function grantFixtureClipboardPermissions(
  context: BrowserContext,
): Promise<void> {
  await context.grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: FIXTURE_ORIGIN },
  );
}

export async function openFixturePage(
  page: Page,
  url: string,
  composerSelector = COMPOSER_SELECTOR,
): Promise<void> {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-ready',
    'true',
  );
  await expect(page.locator(composerSelector).first()).toBeVisible();
}

export async function getComposer(
  page: Page,
  composerSelector = COMPOSER_SELECTOR,
) {
  const composer = page.locator(composerSelector).first();
  await expect(composer).toBeVisible();
  return composer;
}

export async function clearComposer(
  page: Page,
  composerSelector = COMPOSER_SELECTOR,
): Promise<void> {
  const composer = await getComposer(page, composerSelector);
  await composer.click();

  const isTextarea = await composer.evaluate(
    (element) => element instanceof HTMLTextAreaElement,
  );

  if (isTextarea) {
    await composer.fill('');
  } else {
    await composer.evaluate((element) => {
      element.textContent = '';
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'deleteContentBackward',
          data: null,
        }),
      );
    });
  }

  await expect
    .poll(async () => await getComposerText(page, composerSelector))
    .toBe('');
}

export async function getComposerText(
  page: Page,
  composerSelector = COMPOSER_SELECTOR,
): Promise<string> {
  const composer = await getComposer(page, composerSelector);

  return await composer.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) {
      return element.value;
    }

    return (element.textContent ?? '').replace(/\u00A0/g, ' ');
  });
}

export async function openPromptPopup(
  page: Page,
  composerSelector = COMPOSER_SELECTOR,
): Promise<void> {
  const composer = await getComposer(page, composerSelector);
  await composer.click();
  await page.keyboard.type('/ ');
  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
}

export async function waitForPromptPopupToClose(
  page: Page,
): Promise<void> {
  await expect(page.locator('[data-testid="promptit-popup"]')).toBeHidden();
}

export async function getPopupTitles(page: Page): Promise<string[]> {
  return await page
    .locator('[data-testid="promptit-title-cell"] .promptit-row-title')
    .allInnerTexts();
}

export async function getActivePopupCellLabel(
  page: Page,
): Promise<string | null> {
  return await page
    .locator('[data-testid="promptit-popup"] [aria-current="true"]')
    .getAttribute('aria-label');
}

export async function replaceComposerTextWithoutInputEvent(
  page: Page,
  text: string,
  composerSelector = COMPOSER_SELECTOR,
): Promise<void> {
  const composer = await getComposer(page, composerSelector);

  await composer.evaluate((element, nextText) => {
    if (element instanceof HTMLTextAreaElement) {
      element.value = nextText;
      element.selectionStart = nextText.length;
      element.selectionEnd = nextText.length;
      return;
    }

    element.textContent = nextText;

    const textNode = element.firstChild;
    const selection = window.getSelection();

    if (!(textNode instanceof Text) || !selection) {
      return;
    }

    const range = document.createRange();
    range.setStart(textNode, textNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, text);
}

export async function getToastText(page: Page): Promise<string | null> {
  return await page
    .locator('[data-promptit-toast-host] [data-role="toast-content"]')
    .textContent();
}

export async function dispatchPromptitTestEvent(
  page: Page,
  eventName: string,
  detail?: unknown,
): Promise<void> {
  await page.evaluate(
    ({ nextEventName, nextDetail }) => {
      document.dispatchEvent(
        new CustomEvent(nextEventName, {
          detail: nextDetail,
        }),
      );
    },
    {
      nextEventName: eventName,
      nextDetail: detail,
    },
  );
}
