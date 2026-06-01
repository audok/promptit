import {
  expect,
  test as base,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

import {
  launchExtension,
  type LoadedExtension,
} from './extension';
import {
  createPromptRecord,
} from './promptit';
import {
  PROMPT_BODY_MAX_BYTES,
  type PromptRecord,
} from '../../src/prompt/schema';
import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  GET_PROMPT_BODY_MESSAGE,
  GET_PROMPT_RECORD_MESSAGE,
  IMPORT_PROMPTS_MESSAGE,
  LIST_PROMPT_METAS_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  RESTORE_BACKUP_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  UPDATE_PROMPT_RECORD_MESSAGE,
} from '../../src/runtime/messages';
import { THEME_PREFERENCE_STORAGE_KEY } from '../../src/shared/theme';

export const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();

    try {
      await extension.setLanguagePreference('ko');
      await use(extension);
    } finally {
      await extension.close();
    }
  },
});

export const BODY_LOAD_ERROR_MESSAGE =
  '프롬프트 본문을 읽지 못했습니다. 잠시 후 다시 시도해주세요.';
export const PROMPT_GROUP_CROSS_REORDER_MESSAGE =
  '고정됨 목록과 일반 목록 사이에서는 끌어서 순서를 바꿀 수 없습니다.';

export async function openOptionsPageShell(
  extension: LoadedExtension,
  setupPage?: (page: Page) => Promise<void>,
): Promise<Page> {
  const page = await extension.context.newPage();

  if (setupPage) {
    await setupPage(page);
  }

  await page.goto(extension.optionsPageUrl, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page).toHaveTitle(/promptit Settings/i);
  await expect(page.getByText('promptit')).toBeVisible();

  return page;
}

async function expectKoreanOptionsLanding(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: '프롬프트를 저장하고 붙여 넣으세요.' }),
  ).toBeVisible();
  await expect(
    page.getByText(/ChatGPT, Gemini/),
  ).toBeVisible();
  await expect(page.getByLabel('/ space')).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: '/' })).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: 'Space' })).toBeVisible();
}

export async function expectEnglishOptionsLanding(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Save and paste prompts.' }),
  ).toBeVisible();
  await expect(page.getByText(/ChatGPT and Gemini/)).toBeVisible();
  await expect(page.getByLabel('/ Space')).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: '/' })).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: 'Space' })).toBeVisible();
}

export async function openOptionsPage(
  extension: LoadedExtension,
  setupPage?: (page: Page) => Promise<void>,
): Promise<Page> {
  const page = await openOptionsPageShell(extension, setupPage);
  await expectKoreanOptionsLanding(page);
  return page;
}

export async function deferInitialPromptLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const runtime = chrome.runtime as typeof chrome.runtime & {
      sendMessage: (...args: unknown[]) => Promise<unknown>;
    };
    const originalSendMessage = runtime.sendMessage.bind(runtime);
    const pendingListRequests: Array<{
      args: unknown[];
      reject: (reason: unknown) => void;
      resolve: (value: unknown) => void;
    }> = [];
    let isReleased = false;

    (window as Window & {
      __releasePromptitInitialLoad?: () => Promise<void>;
    }).__releasePromptitInitialLoad = async () => {
      if (isReleased) {
        return;
      }

      isReleased = true;

      for (const pendingRequest of pendingListRequests.splice(0)) {
        try {
          pendingRequest.resolve(await originalSendMessage(...pendingRequest.args));
        } catch (error) {
          pendingRequest.reject(error);
        }
      }
    };

    runtime.sendMessage = async (...args: unknown[]) => {
      const [message] = args;

      if (
        isReleased ||
        typeof message !== 'object' ||
        message === null ||
        (message as { type?: unknown }).type !== 'promptit/list-prompt-metas'
      ) {
        return await originalSendMessage(...args);
      }

      return await new Promise((resolve, reject) => {
        pendingListRequests.push({ args, reject, resolve });
      });
    };
  });
}

export async function patchRuntimeMessageFailure(
  page: Page,
  messageTypes: string[],
  message: string,
): Promise<void> {
  await page.evaluate(({ failureMessage, types }) => {
    const runtime = chrome.runtime as typeof chrome.runtime & {
      sendMessage: (...args: unknown[]) => Promise<unknown>;
    };
    const originalSendMessage = runtime.sendMessage.bind(runtime);

    runtime.sendMessage = async (...args: unknown[]) => {
      const [request] = args;

      if (
        typeof request === 'object' &&
        request !== null &&
        types.includes(String((request as { type?: unknown }).type))
      ) {
        throw new Error(failureMessage);
      }

      return await originalSendMessage(...args);
    };
  }, {
    failureMessage: message,
    types: messageTypes,
  });
}

export async function patchRuntimeMessageResponse(
  page: Page,
  messageTypes: string[],
  response: unknown,
): Promise<void> {
  await page.evaluate(({ mockedResponse, types }) => {
    const runtime = chrome.runtime as typeof chrome.runtime & {
      sendMessage: (...args: unknown[]) => Promise<unknown>;
    };
    const originalSendMessage = runtime.sendMessage.bind(runtime);

    runtime.sendMessage = async (...args: unknown[]) => {
      const [request] = args;

      if (
        typeof request === 'object' &&
        request !== null &&
        types.includes(String((request as { type?: unknown }).type))
      ) {
        return mockedResponse;
      }

      return await originalSendMessage(...args);
    };
  }, {
    mockedResponse: response,
    types: messageTypes,
  });
}

export async function expectBodyLoadErrorStatusOnly(page: Page): Promise<void> {
  await expect(
    page.getByRole('status').filter({ hasText: BODY_LOAD_ERROR_MESSAGE }),
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: BODY_LOAD_ERROR_MESSAGE }),
  ).toHaveCount(0);
  await expect(
    page
      .locator('[aria-live="assertive"]')
      .filter({ hasText: BODY_LOAD_ERROR_MESSAGE }),
  ).toHaveCount(0);
  await expect(getOptionsToast(page)).toHaveCount(0);
}

export function getPromptList(page: Page): Locator {
  return page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '저장된 프롬프트' }) });
}

export function getPromptEditor(page: Page): Locator {
  return page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: /프롬프트 (?:추가|수정)/ }) });
}

export function getOptionsToast(page: Page): Locator {
  return page.getByTestId('options-toast');
}

export async function getOptionsThemeSnapshot(page: Page): Promise<{
  bodyBackgroundImage: string;
  colorScheme: string;
  heroBorderColor: string;
  mainBackgroundColor: string;
  rootTheme: string | null;
  textColor: string;
}> {
  return await page.evaluate(() => {
    const hero = document.querySelector('section');
    const main = document.querySelector('main');

    if (!(hero instanceof HTMLElement) || !(main instanceof HTMLElement)) {
      throw new Error('Options theme snapshot could not find required elements.');
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const heroStyle = getComputedStyle(hero);
    const mainStyle = getComputedStyle(main);

    return {
      bodyBackgroundImage: bodyStyle.backgroundImage,
      colorScheme: rootStyle.colorScheme,
      heroBorderColor: heroStyle.borderTopColor,
      mainBackgroundColor: mainStyle.backgroundColor,
      rootTheme: document.documentElement.dataset.promptitTheme ?? null,
      textColor: mainStyle.color,
    };
  });
}

function parseRgbChannels(value: string): number[] {
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, [\d.]+)?\)$/.exec(value);

  expect(match).not.toBeNull();

  return match?.slice(1, 4).map(Number) ?? [];
}

export function parseRgbColor(value: string): {
  alpha: number;
  blue: number;
  green: number;
  red: number;
} {
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value);

  expect(match).not.toBeNull();

  return {
    red: Number(match?.[1] ?? 0),
    green: Number(match?.[2] ?? 0),
    blue: Number(match?.[3] ?? 0),
    alpha: match?.[4] === undefined ? 1 : Number(match[4]),
  };
}

export function expectRgbChannelsBetween(
  value: string,
  minimum: number,
  maximum: number,
): void {
  for (const channel of parseRgbChannels(value)) {
    expect(channel).toBeGreaterThanOrEqual(minimum);
    expect(channel).toBeLessThanOrEqual(maximum);
  }
}

export function expectNeutralRgbChannelsBetween(
  value: string,
  minimum: number,
  maximum: number,
): void {
  const channels = parseRgbChannels(value);

  for (const channel of channels) {
    expect(channel).toBeGreaterThanOrEqual(minimum);
    expect(channel).toBeLessThanOrEqual(maximum);
  }

  expect(Math.max(...channels) - Math.min(...channels)).toBeLessThanOrEqual(8);
}

export function expectRgbaAlphaBetween(
  value: string,
  minimum: number,
  maximum: number,
): void {
  const color = parseRgbColor(value);

  expect(color.alpha).toBeGreaterThanOrEqual(minimum);
  expect(color.alpha).toBeLessThanOrEqual(maximum);
}

export async function getComputedThemeStyle(locator: Locator): Promise<{
  backgroundColor: string;
  borderColor: string;
  color: string;
  fontSize: string;
  fontWeight: number;
  lineHeight: string;
}> {
  await expect(locator).toBeVisible();

  return await locator.evaluate((node) => {
    const style = getComputedStyle(node as HTMLElement);

    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: Number(style.fontWeight),
      lineHeight: style.lineHeight,
    };
  });
}

function getBackupShareOpenButton(page: Page): Locator {
  return getPromptList(page).getByRole('button', {
    name: '백업/공유',
    exact: true,
  });
}

function getBackupShareModal(page: Page): Locator {
  return page.getByRole('dialog', { name: '백업/공유' });
}

export async function openBackupShareModal(page: Page): Promise<Locator> {
  await getBackupShareOpenButton(page).click();

  const modal = getBackupShareModal(page);
  await expect(modal).toBeVisible();
  return modal;
}

export async function writeJsonFixture(
  testInfo: TestInfo,
  filename: string,
  value: unknown,
): Promise<string> {
  const filePath = testInfo.outputPath(filename);
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  return filePath;
}

export async function readDownloadedJson<T = unknown>(
  page: Page,
  triggerDownload: () => Promise<void>,
): Promise<{
  filename: string;
  raw: string;
  value: T;
}> {
  const downloadPromise = page.waitForEvent('download');

  await triggerDownload();

  const download = await downloadPromise;
  const downloadPath = await download.path();

  if (!downloadPath) {
    throw new Error('Downloaded JSON file path was not available.');
  }

  const raw = await readFile(downloadPath, 'utf8');

  return {
    filename: download.suggestedFilename(),
    raw,
    value: JSON.parse(raw) as T,
  };
}

function getPromptListButtons(page: Page): Locator {
  return getPromptList(page).locator('[data-testid="prompt-card"]');
}

export function getPromptListCreateButton(page: Page): Locator {
  return getPromptList(page).getByRole('button', {
    name: '프롬프트 추가',
    exact: true,
  });
}

export function getPromptCard(page: Page, title: string): Locator {
  return getPromptListButtons(page).filter({ hasText: title }).first();
}

export async function expectPromptMetaValuesToUseTwoLineLayout(
  promptCard: Locator,
): Promise<void> {
  await expect(promptCard.getByTestId('prompt-meta-line')).toHaveCount(2);

  const metaLineLayout = await promptCard
    .getByTestId('prompt-meta-line')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const element = node as HTMLElement;
        const label = element.querySelector('[data-testid="prompt-meta-label"]');
        const value = element.querySelector('[data-testid="prompt-meta-value"]');
        const style = getComputedStyle(element);
        const valueStyle =
          value instanceof HTMLElement ? getComputedStyle(value) : null;
        const labelRect =
          label instanceof HTMLElement ? label.getBoundingClientRect() : null;
        const valueRect =
          value instanceof HTMLElement ? value.getBoundingClientRect() : null;

        return {
          display: style.display,
          lineHeight: style.lineHeight,
          overflow: style.overflow,
          textOverflow: valueStyle?.textOverflow ?? null,
          valueStartsAfterLabel:
            labelRect !== null && valueRect !== null
              ? valueRect.top >= labelRect.bottom - 1
              : false,
          verticalGap:
            labelRect !== null && valueRect !== null
              ? valueRect.top - labelRect.bottom
              : null,
          whiteSpace: valueStyle?.whiteSpace ?? null,
        };
      }),
    );
  const metaLineOverflowStates = await promptCard
    .getByTestId('prompt-meta-line')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const element = node as HTMLElement;

        return element.scrollWidth > element.clientWidth + 1;
      }),
    );

  expect(metaLineLayout).toHaveLength(2);
  expect(metaLineOverflowStates).toEqual([false, false]);

  for (const layout of metaLineLayout) {
    expect(layout.display).toBe('grid');
    expect(layout.lineHeight).toBe('16px');
    expect(layout.overflow).toBe('visible');
    expect(layout.textOverflow).not.toBe('ellipsis');
    expect(layout.valueStartsAfterLabel).toBe(true);
    expect(layout.verticalGap).not.toBeNull();
    expect(layout.verticalGap as number).toBeLessThanOrEqual(2);
    expect(layout.whiteSpace).not.toBe('nowrap');
  }
}

async function getTypographyStyle(locator: Locator): Promise<{
  fontSize: string;
  fontWeight: number;
  letterSpacing: number;
  textTransform: string;
}> {
  return await locator.evaluate((node) => {
    const style = getComputedStyle(node as HTMLElement);

    return {
      fontSize: style.fontSize,
      fontWeight: Number(style.fontWeight),
      letterSpacing: Number.parseFloat(style.letterSpacing),
      textTransform: style.textTransform,
    };
  });
}

export async function expectPromptListMicrocopyTypography(
  page: Page,
  promptTitle: string,
  locale: 'ko' | 'en',
): Promise<void> {
  const promptCard = page
    .getByTestId('prompt-card')
    .filter({ hasText: promptTitle })
    .first();
  const compactLabelLocators = [
    promptCard.getByTestId('prompt-group-label'),
    promptCard.getByTestId('prompt-char-count'),
    page.getByTestId('prompt-delete-button').first(),
  ];
  const compactLabelStyles = await Promise.all(
    compactLabelLocators.map((labelLocator) => getTypographyStyle(labelLocator)),
  );
  const baseCompactLabelStyle = compactLabelStyles[0];

  for (const style of compactLabelStyles) {
    expect(style.fontSize).toBe(baseCompactLabelStyle.fontSize);
    expect(style.fontWeight).toBe(baseCompactLabelStyle.fontWeight);
    expect(style.letterSpacing).toBe(baseCompactLabelStyle.letterSpacing);
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing).toBeGreaterThan(1);

    if (locale === 'ko') {
      expect(style.fontWeight).toBeGreaterThanOrEqual(800);
    } else {
      expect(style.fontWeight).toBeGreaterThanOrEqual(600);
      expect(style.fontWeight).toBeLessThanOrEqual(700);
    }
  }

  const metaLabelWeights = await promptCard
    .getByTestId('prompt-meta-label')
    .evaluateAll((nodes) =>
      nodes.map((node) => Number(getComputedStyle(node as HTMLElement).fontWeight)),
    );

  expect(metaLabelWeights).toHaveLength(2);

  for (const fontWeight of metaLabelWeights) {
    if (locale === 'ko') {
      expect(fontWeight).toBeGreaterThanOrEqual(800);
    } else {
      expect(fontWeight).toBeGreaterThanOrEqual(600);
      expect(fontWeight).toBeLessThanOrEqual(700);
    }
  }
}

export function getPromptDragHandle(page: Page, title: string): Locator {
  return getPromptList(page).getByRole('button', {
    name: `${title} 순서 변경`,
    exact: true,
  });
}

export function getPromptPinToggle(page: Page, title: string): Locator {
  return getPromptList(page)
    .getByRole('button', {
      name: new RegExp(`^${escapeRegExp(title)} 고정(?: 해제)?$`),
    })
    .first();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function expectPinnedEditorCheckboxRemoved(page: Page): Promise<void> {
  await expect(page.locator('form').getByRole('checkbox', { name: /고정/ })).toHaveCount(0);
}

export async function expectVisiblePromptOrder(
  page: Page,
  titles: string[],
): Promise<void> {
  const promptButtons = getPromptListButtons(page);

  await expect(promptButtons).toHaveCount(titles.length);

  for (const [index, title] of titles.entries()) {
    await expect(promptButtons.nth(index)).toContainText(title);
  }
}

export async function expectStoredPromptMetaOrder(
  extension: LoadedExtension,
  ids: string[],
): Promise<void> {
  await expect
    .poll(async () =>
      (await extension.getPromptMetas()).map((prompt) => prompt.id),
    )
    .toEqual(ids);
}

export async function expectPromptListToHideInternalOrderFields(
  page: Page,
): Promise<void> {
  const promptList = getPromptList(page);

  await expect(promptList).not.toContainText('normalOrder');
  await expect(promptList).not.toContainText('pinnedOrder');
}

export async function expectSortOrderInputToBeRemoved(page: Page): Promise<void> {
  await expect(page.locator('form').getByLabel(/정렬 순서/)).toHaveCount(0);
}

export async function createPromptFromOptions(
  page: Page,
  title: string,
  content: string,
): Promise<void> {
  await getTitleInput(page).fill(title);
  await getContentInput(page).fill(content);
  await getPromptSubmitButton(page, '프롬프트 추가').click();
}

export function getTitleInput(page: Page): Locator {
  return page.locator('form').getByRole('textbox', { name: /제목/ });
}

export function getContentInput(page: Page): Locator {
  return page.locator('form').getByRole('textbox', { name: /본문/ });
}

export function getPromptSubmitButton(page: Page, name: string): Locator {
  return page.locator('form').getByRole('button', { name });
}

export async function pressPromptHandleKey(
  page: Page,
  title: string,
  key: 'ArrowDown' | 'ArrowUp',
): Promise<void> {
  const handle = getPromptDragHandle(page, title);

  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press(key);
}

export async function dragPromptHandleToPrompt(
  page: Page,
  sourceTitle: string,
  targetTitle: string,
  placement: 'after' | 'before',
): Promise<void> {
  const handle = getPromptDragHandle(page, sourceTitle);
  const targetItem = getPromptCard(page, targetTitle).locator(
    'xpath=ancestor::*[@role="listitem"][1]',
  );

  await expect(handle).toBeVisible();
  await expect(targetItem).toBeVisible();

  const targetBox = await targetItem.boundingBox();

  if (!targetBox) {
    throw new Error(`Prompt drop target not found for ${targetTitle}.`);
  }

  await handle.dragTo(targetItem, {
    targetPosition: {
      x: targetBox.width / 2,
      y: placement === 'before' ? 4 : targetBox.height - 4,
    },
  });
}

export async function expectNoChromeStoragePromptBody(
  extension: LoadedExtension,
  bodyText: string,
): Promise<void> {
  const snapshot = await extension.getChromeStorageLocalSnapshot();

  expect(JSON.stringify(snapshot)).not.toContain(bodyText);
}

export async function getRequiredPromptRecord(
  extension: LoadedExtension,
  id: string,
): Promise<PromptRecord> {
  const record =
    (await extension.getPromptRecords()).find((prompt) => prompt.id === id) ??
    null;

  expect(record).not.toBeNull();
  return record as PromptRecord;
}

export async function setPromptPinnedThroughRuntime(
  extension: LoadedExtension,
  prompt: PromptRecord,
  pinned: boolean,
): Promise<void> {
  const response = await extension.sendRuntimeMessage({
    type: 'promptit/set-prompt-pinned',
    id: prompt.id,
    pinned,
    expectedUpdatedAt: prompt.updatedAt,
  } as any) as any;

  expect(response).toEqual(
    expect.objectContaining({
      ok: true,
      status: 'success',
    }),
  );
}

async function sendRawRuntimeMessageResult(
  extension: LoadedExtension,
  message: unknown,
): Promise<
  | { status: 'resolved'; value: unknown }
  | { status: 'rejected'; error: unknown }
> {
  try {
    return {
      status: 'resolved',
      value: await extension.sendRawRuntimeMessage(message),
    };
  } catch (error) {
    return { status: 'rejected', error };
  }
}

export async function expectRawRuntimeMessageNotAccepted(
  extension: LoadedExtension,
  message: unknown,
): Promise<void> {
  const beforeRecords = await extension.getPromptRecords();
  const beforeLanguagePreference = await extension.getLanguagePreference();
  const beforeThemePreference = await extension.getThemePreference();
  const result = await sendRawRuntimeMessageResult(extension, message);

  if (result.status === 'resolved') {
    expect(result.value).not.toEqual(expect.objectContaining({ ok: true }));
  }

  expect(await extension.getPromptRecords()).toEqual(beforeRecords);
  expect(await extension.getLanguagePreference()).toBe(beforeLanguagePreference);
  expect(await extension.getThemePreference()).toBe(beforeThemePreference);
}

export function expectExactKeys(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  expect(value).toEqual(expect.any(Object));
  expect(Object.keys(value as Record<string, unknown>)).toEqual(keys);
}

export function expectPromptRecordJsonShape(value: unknown): void {
  expectExactKeys(value, [
    'id',
    'title',
    'pinned',
    'normalOrder',
    'pinnedOrder',
    'createdAt',
    'updatedAt',
    'bodyUpdatedAt',
    'charCount',
    'content',
  ]);
}

export function expectValidIsoTimestamp(value: unknown): void {
  expect(typeof value).toBe('string');
  expect(Number.isNaN(Date.parse(value as string))).toBe(false);
}

export function expectNoInternalBackupKeys(rawJson: string): void {
  expect(rawJson).not.toContain('promptit:promptsRevision');
  expect(rawJson).not.toContain('promptit:migration');
  expect(rawJson).not.toContain('promptit:test');
  expect(rawJson).not.toContain('promptit:internal');
  expect(rawJson).not.toContain(THEME_PREFERENCE_STORAGE_KEY);
  expect(rawJson).not.toContain('revision');
}


export {
  expect,
  launchExtension,
  createPromptRecord,
  PROMPT_BODY_MAX_BYTES,
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  GET_PROMPT_BODY_MESSAGE,
  GET_PROMPT_RECORD_MESSAGE,
  IMPORT_PROMPTS_MESSAGE,
  LIST_PROMPT_METAS_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  RESTORE_BACKUP_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  UPDATE_PROMPT_RECORD_MESSAGE,
  THEME_PREFERENCE_STORAGE_KEY,
};

export type {
  LoadedExtension,
  Locator,
  Page,
  PromptRecord,
  TestInfo,
};
