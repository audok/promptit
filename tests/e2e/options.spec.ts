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
} from '../playwright/extension';
import {
  createPromptRecord,
} from '../playwright/promptit';
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

const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await extension.setLanguagePreference('ko');
    await use(extension);
    await extension.close();
  },
});

const BODY_LOAD_ERROR_MESSAGE =
  '프롬프트 본문을 읽지 못했습니다. 잠시 후 다시 시도해주세요.';
const PROMPT_GROUP_CROSS_REORDER_MESSAGE =
  '고정됨 목록과 일반 목록 사이에서는 끌어서 순서를 바꿀 수 없습니다.';

async function openOptionsPageShell(
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

async function expectEnglishOptionsLanding(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Save and paste prompts.' }),
  ).toBeVisible();
  await expect(page.getByText(/ChatGPT and Gemini/)).toBeVisible();
  await expect(page.getByLabel('/ Space')).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: '/' })).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: 'Space' })).toBeVisible();
}

async function openOptionsPage(
  extension: LoadedExtension,
  setupPage?: (page: Page) => Promise<void>,
): Promise<Page> {
  const page = await openOptionsPageShell(extension, setupPage);
  await expectKoreanOptionsLanding(page);
  return page;
}

async function deferInitialPromptLoad(page: Page): Promise<void> {
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

async function patchRuntimeMessageFailure(
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

async function patchRuntimeMessageResponse(
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

async function expectBodyLoadErrorStatusOnly(page: Page): Promise<void> {
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

function getPromptList(page: Page): Locator {
  return page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '저장된 프롬프트' }) });
}

function getPromptEditor(page: Page): Locator {
  return page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: /프롬프트 (?:추가|수정)/ }) });
}

function getOptionsToast(page: Page): Locator {
  return page.getByTestId('options-toast');
}

async function getOptionsThemeSnapshot(page: Page): Promise<{
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

function parseRgbColor(value: string): {
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

function expectRgbChannelsBetween(
  value: string,
  minimum: number,
  maximum: number,
): void {
  for (const channel of parseRgbChannels(value)) {
    expect(channel).toBeGreaterThanOrEqual(minimum);
    expect(channel).toBeLessThanOrEqual(maximum);
  }
}

function expectNeutralRgbChannelsBetween(
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

function expectRgbaAlphaBetween(
  value: string,
  minimum: number,
  maximum: number,
): void {
  const color = parseRgbColor(value);

  expect(color.alpha).toBeGreaterThanOrEqual(minimum);
  expect(color.alpha).toBeLessThanOrEqual(maximum);
}

async function getComputedThemeStyle(locator: Locator): Promise<{
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

async function openBackupShareModal(page: Page): Promise<Locator> {
  await getBackupShareOpenButton(page).click();

  const modal = getBackupShareModal(page);
  await expect(modal).toBeVisible();
  return modal;
}

async function writeJsonFixture(
  testInfo: TestInfo,
  filename: string,
  value: unknown,
): Promise<string> {
  const filePath = testInfo.outputPath(filename);
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  return filePath;
}

async function readDownloadedJson<T = unknown>(
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

function getPromptListCreateButton(page: Page): Locator {
  return getPromptList(page).getByRole('button', {
    name: '프롬프트 추가',
    exact: true,
  });
}

function getPromptCard(page: Page, title: string): Locator {
  return getPromptListButtons(page).filter({ hasText: title }).first();
}

async function expectPromptMetaValuesToUseTwoLineLayout(
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

async function expectPromptListMicrocopyTypography(
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

function getPromptDragHandle(page: Page, title: string): Locator {
  return getPromptList(page).getByRole('button', {
    name: `${title} 순서 변경`,
    exact: true,
  });
}

function getPromptPinToggle(page: Page, title: string): Locator {
  return getPromptList(page)
    .getByRole('button', {
      name: new RegExp(`^${escapeRegExp(title)} 고정(?: 해제)?$`),
    })
    .first();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function expectPinnedEditorCheckboxRemoved(page: Page): Promise<void> {
  await expect(page.locator('form').getByRole('checkbox', { name: /고정/ })).toHaveCount(0);
}

async function expectVisiblePromptOrder(
  page: Page,
  titles: string[],
): Promise<void> {
  const promptButtons = getPromptListButtons(page);

  await expect(promptButtons).toHaveCount(titles.length);

  for (const [index, title] of titles.entries()) {
    await expect(promptButtons.nth(index)).toContainText(title);
  }
}

async function expectStoredPromptMetaOrder(
  extension: LoadedExtension,
  ids: string[],
): Promise<void> {
  await expect
    .poll(async () =>
      (await extension.getPromptMetas()).map((prompt) => prompt.id),
    )
    .toEqual(ids);
}

async function expectPromptListToHideInternalOrderFields(
  page: Page,
): Promise<void> {
  const promptList = getPromptList(page);

  await expect(promptList).not.toContainText('normalOrder');
  await expect(promptList).not.toContainText('pinnedOrder');
}

async function expectSortOrderInputToBeRemoved(page: Page): Promise<void> {
  await expect(page.locator('form').getByLabel(/정렬 순서/)).toHaveCount(0);
}

async function createPromptFromOptions(
  page: Page,
  title: string,
  content: string,
): Promise<void> {
  await getTitleInput(page).fill(title);
  await getContentInput(page).fill(content);
  await getPromptSubmitButton(page, '프롬프트 추가').click();
}

function getTitleInput(page: Page): Locator {
  return page.locator('form').getByRole('textbox', { name: /제목/ });
}

function getContentInput(page: Page): Locator {
  return page.locator('form').getByRole('textbox', { name: /본문/ });
}

function getPromptSubmitButton(page: Page, name: string): Locator {
  return page.locator('form').getByRole('button', { name });
}

async function pressPromptHandleKey(
  page: Page,
  title: string,
  key: 'ArrowDown' | 'ArrowUp',
): Promise<void> {
  const handle = getPromptDragHandle(page, title);

  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press(key);
}

async function dragPromptHandleToPrompt(
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

async function expectNoChromeStoragePromptBody(
  extension: LoadedExtension,
  bodyText: string,
): Promise<void> {
  const snapshot = await extension.getChromeStorageLocalSnapshot();

  expect(JSON.stringify(snapshot)).not.toContain(bodyText);
}

async function getRequiredPromptRecord(
  extension: LoadedExtension,
  id: string,
): Promise<PromptRecord> {
  const record =
    (await extension.getPromptRecords()).find((prompt) => prompt.id === id) ??
    null;

  expect(record).not.toBeNull();
  return record as PromptRecord;
}

async function setPromptPinnedThroughRuntime(
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

async function expectRawRuntimeMessageNotAccepted(
  extension: LoadedExtension,
  message: unknown,
): Promise<void> {
  const beforeRecords = await extension.getPromptRecords();
  const result = await sendRawRuntimeMessageResult(extension, message);

  if (result.status === 'resolved') {
    expect(result.value).not.toEqual(expect.objectContaining({ ok: true }));
  }

  expect(await extension.getPromptRecords()).toEqual(beforeRecords);
}

function expectExactKeys(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  expect(value).toEqual(expect.any(Object));
  expect(Object.keys(value as Record<string, unknown>)).toEqual(keys);
}

function expectPromptRecordJsonShape(value: unknown): void {
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

function expectValidIsoTimestamp(value: unknown): void {
  expect(typeof value).toBe('string');
  expect(Number.isNaN(Date.parse(value as string))).toBe(false);
}

function expectNoInternalBackupKeys(rawJson: string): void {
  expect(rawJson).not.toContain('promptit:promptsRevision');
  expect(rawJson).not.toContain('promptit:migration');
  expect(rawJson).not.toContain('promptit:test');
  expect(rawJson).not.toContain('promptit:internal');
  expect(rawJson).not.toContain('theme');
  expect(rawJson).not.toContain('revision');
}

test('opens the options page', async ({ extension }) => {
  await openOptionsPage(extension);
});

test('restores the theme selector and persists dark preference', async ({
  extension,
}) => {
  await extension.setChromeStorageLocalValue(
    THEME_PREFERENCE_STORAGE_KEY,
    'system',
  );

  const page = await openOptionsPage(extension);
  const themeSelector = page.getByRole('group', { name: '테마 선택' });
  const systemButton = themeSelector.getByRole('button', { name: '시스템' });
  const darkButton = themeSelector.getByRole('button', { name: '다크' });

  await expect(themeSelector).toBeVisible();
  await expect(systemButton).toHaveAttribute('aria-pressed', 'true');

  await darkButton.click();

  await expect(darkButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-theme',
    'dark',
  );
  expect(
    (await extension.getChromeStorageLocalSnapshot())[
      THEME_PREFERENCE_STORAGE_KEY
    ],
  ).toBe('dark');

  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(
    page.getByRole('group', { name: '테마 선택' }).getByRole('button', {
      name: '다크',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-theme',
    'dark',
  );
});

test('opens backup/share modal from the prompt header and disables empty sharing', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);
  const headerButtons = getPromptList(page).getByRole('button');

  await expect(headerButtons).toHaveCount(2);
  await expect(headerButtons.nth(0)).toHaveText('백업/공유');
  await expect(headerButtons.nth(1)).toHaveText('프롬프트 추가');

  const modal = await openBackupShareModal(page);

  await expect(modal.getByText('promptit의 설정, 저장된 프롬프트 등 모든 데이터를 백업 또는 복원합니다.')).toBeVisible();
  await expect(modal.getByText('또는 저장된 프롬프트만 공유하거나 가져옵니다.')).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'promptit 데이터 백업 & 복원' })).toBeVisible();
  await expect(modal.getByRole('button', { name: '백업', exact: true })).toBeEnabled();
  await expect(modal.getByTestId('backup-restore-file-button')).toBeEnabled();
  await expect(modal.getByRole('heading', { name: '프롬프트 공유 & 가져오기' })).toBeVisible();
  await expect(modal.getByRole('button', { name: '프롬프트 전체 공유' })).toBeDisabled();
  await expect(modal.getByText('저장된 프롬프트가 없습니다.')).toBeVisible();
  await expect(modal.getByTestId('prompts-import-file-button')).toBeEnabled();
});

test('downloads backup JSON with prompt records and language only', async ({
  extension,
}) => {
  const normalPrompt = createPromptRecord({
    id: 'backup-normal',
    title: '백업 일반',
    content: '백업 일반 본문',
    normalOrder: 2,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-01T02:00:00.000Z',
  });
  const pinnedPrompt = createPromptRecord({
    id: 'backup-pinned',
    title: '백업 고정',
    content: '백업 고정 본문',
    pinned: true,
    normalOrder: 1,
    pinnedOrder: 1,
    createdAt: '2026-05-02T00:00:00.000Z',
    updatedAt: '2026-05-02T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-02T02:00:00.000Z',
  });

  await extension.setPromptRecords([normalPrompt, pinnedPrompt]);
  await extension.setLanguagePreference('ko');
  await extension.setChromeStorageLocalValue('promptit:migration:version', 3);
  await extension.setChromeStorageLocalValue('promptit:test:flag', true);
  await extension.setChromeStorageLocalValue('promptit:internal:cache', {
    value: 'do not export',
  });
  await extension.setChromeStorageLocalValue(
    THEME_PREFERENCE_STORAGE_KEY,
    'dark',
  );

  const storageSnapshot = await extension.getChromeStorageLocalSnapshot();
  expect(storageSnapshot).toEqual(
    expect.objectContaining({
      'promptit:migration:version': 3,
      'promptit:test:flag': true,
      'promptit:internal:cache': { value: 'do not export' },
      [THEME_PREFERENCE_STORAGE_KEY]: 'dark',
    }),
  );
  expect(storageSnapshot).toHaveProperty('promptit:promptsRevision');

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);
  const download = await readDownloadedJson<Record<string, unknown>>(
    page,
    async () => {
      await modal.getByTestId('backup-export-button').click();
    },
  );

  expect(download.filename).toMatch(/^promptit-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expectNoInternalBackupKeys(download.raw);
  expectExactKeys(download.value, ['type', 'appVersion', 'exportedAt', 'data']);
  expect(download.value.type).toBe('promptit.backup');
  expect(download.value.appVersion).toBe('0.9.0');
  expectValidIsoTimestamp(download.value.exportedAt);

  const data = download.value.data;
  expectExactKeys(data, ['prompts', 'settings']);
  expect(data.settings).toEqual({ languagePreference: 'ko' });
  expect(data.prompts).toEqual([pinnedPrompt, normalPrompt]);

  for (const prompt of data.prompts as unknown[]) {
    expectPromptRecordJsonShape(prompt);
  }
});

test('downloads shared prompts JSON with title and content only', async ({
  extension,
}) => {
  const normalPrompt = createPromptRecord({
    id: 'share-normal',
    title: '공유 일반',
    content: '공유 일반 본문',
    normalOrder: 2,
  });
  const pinnedPrompt = createPromptRecord({
    id: 'share-pinned',
    title: '공유 고정',
    content: '공유 고정 본문',
    pinned: true,
    pinnedOrder: 1,
    normalOrder: 1,
  });

  await extension.setPromptRecords([normalPrompt, pinnedPrompt]);
  await extension.setChromeStorageLocalValue('promptit:test:flag', true);
  await extension.setChromeStorageLocalValue(
    THEME_PREFERENCE_STORAGE_KEY,
    'dark',
  );

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);
  const download = await readDownloadedJson<Record<string, unknown>>(
    page,
    async () => {
      await modal.getByTestId('prompts-share-button').click();
    },
  );

  expect(download.filename).toMatch(/^promptit-prompts-\d{4}-\d{2}-\d{2}\.json$/);
  expectNoInternalBackupKeys(download.raw);
  expectExactKeys(download.value, ['type', 'appVersion', 'exportedAt', 'data']);
  expect(download.value.type).toBe('promptit.prompts');
  expect(download.value.appVersion).toBe('0.9.0');
  expectValidIsoTimestamp(download.value.exportedAt);

  const data = download.value.data;
  expectExactKeys(data, ['prompts']);
  expect(data.prompts).toEqual([
    {
      title: pinnedPrompt.title,
      content: pinnedPrompt.content,
    },
    {
      title: normalPrompt.title,
      content: normalPrompt.content,
    },
  ]);

  for (const prompt of data.prompts as unknown[]) {
    expectExactKeys(prompt, ['title', 'content']);
  }
});

test('restore file selection previews without writing, then confirmation replaces prompts and language', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'restore-current',
    title: '현재 프롬프트',
    content: '복원 전 본문',
    normalOrder: 1,
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-03T02:00:00.000Z',
  });
  const restoredPrompt = createPromptRecord({
    id: 'restore-backed-up',
    title: '복원된 프롬프트',
    content: '복원 파일 본문',
    pinned: true,
    normalOrder: 7,
    pinnedOrder: 2,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-04T02:00:00.000Z',
  });
  const backupFile = {
    type: 'promptit.backup',
    appVersion: '0.9.0',
    exportedAt: '2026-05-05T03:04:05.000Z',
    data: {
      prompts: [restoredPrompt],
      settings: {
        languagePreference: 'en',
      },
    },
  };

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');
  const beforeRevision = await extension.getPromptStorageRevision();
  const filePath = await writeJsonFixture(
    testInfo,
    'restore-backup.json',
    backupFile,
  );

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);

  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toBeVisible();
  await expect(modal.getByText('restore-backup.json')).toBeVisible();
  await expect(modal.getByText('백업 생성일')).toBeVisible();
  await expect(modal.getByText('프롬프트 수')).toBeVisible();
  await expect(modal.getByText('언어 설정')).toBeVisible();
  await expect(modal.getByText('0.9.0')).toBeVisible();
  await expect(modal.getByText('현재 저장된 프롬프트와 설정을 모두 지우고 백업 파일의 내용으로 되돌립니다.')).toBeVisible();
  expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
  expect(await extension.getLanguagePreference()).toBe('ko');

  await modal.getByTestId('backup-restore-confirm-button').click();

  await expect(getOptionsToast(page)).toContainText(
    'restore-backup.json로부터 데이터를 복원했습니다.',
  );
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([
    restoredPrompt,
  ]);
  await expect.poll(async () => await extension.getLanguagePreference()).toBe('en');
  expect(await extension.getPromptStorageRevision()).not.toEqual(beforeRevision);
});

test('refreshes an open editor when restore replaces the same prompt id and timestamps', async ({
  extension,
}, testInfo) => {
  const initialPrompt = createPromptRecord({
    id: 'restore-same-id-open-editor',
    title: '동일 ID 복원 대상',
    content: 'old body text',
    normalOrder: 1,
    createdAt: '2026-05-05T01:00:00.000Z',
    updatedAt: '2026-05-05T02:00:00.000Z',
    bodyUpdatedAt: '2026-05-05T03:00:00.000Z',
  });
  const restoredPrompt = createPromptRecord({
    id: initialPrompt.id,
    title: initialPrompt.title,
    content: 'new body text',
    normalOrder: initialPrompt.normalOrder,
    pinned: initialPrompt.pinned,
    createdAt: initialPrompt.createdAt,
    updatedAt: initialPrompt.updatedAt,
    bodyUpdatedAt: initialPrompt.bodyUpdatedAt,
  });
  const filePath = await writeJsonFixture(testInfo, 'restore-same-id.json', {
    type: 'promptit.backup',
    appVersion: '1.0.0',
    exportedAt: '2026-05-05T04:00:00.000Z',
    data: {
      prompts: [restoredPrompt],
      settings: {
        languagePreference: 'ko',
      },
    },
  });

  await extension.setPromptRecords([initialPrompt]);

  const editorPage = await openOptionsPage(extension);
  await getPromptCard(editorPage, initialPrompt.title).click();
  await expect(getContentInput(editorPage)).toHaveValue(initialPrompt.content);

  const restorePage = await openOptionsPage(extension);
  const modal = await openBackupShareModal(restorePage);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);
  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toBeVisible();
  await modal.getByTestId('backup-restore-confirm-button').click();
  await expect(getOptionsToast(restorePage)).toContainText(
    'restore-same-id.json로부터 데이터를 복원했습니다.',
  );

  await expect(getContentInput(editorPage)).toHaveValue(restoredPrompt.content);

  await getTitleInput(editorPage).fill('복원 후 제목 저장');
  await getPromptSubmitButton(editorPage, '프롬프트 수정').click();
  await expect(getOptionsToast(editorPage)).toContainText(
    '프롬프트를 업데이트했습니다.',
  );

  const savedPrompt = await getRequiredPromptRecord(extension, initialPrompt.id);
  expect(savedPrompt.title).toBe('복원 후 제목 저장');
  expect(savedPrompt.content).toBe(restoredPrompt.content);
});

test('invalid restore files preserve current data', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'invalid-restore-current',
    title: '유지할 프롬프트',
    content: '잘못된 복원 후에도 유지되어야 한다.',
    normalOrder: 1,
  });

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');
  const filePath = await writeJsonFixture(testInfo, 'invalid-restore.json', {
    type: 'promptit.not-backup',
    appVersion: '0.9.0',
    exportedAt: '2026-05-05T03:04:05.000Z',
    data: {
      prompts: [],
      settings: {
        languagePreference: 'en',
      },
    },
  });

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);

  await expect(getOptionsToast(page)).toContainText(
    '복원에 실패했습니다. 현재 데이터는 변경되지 않았습니다.',
  );
  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toHaveCount(0);
  expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
  expect(await extension.getLanguagePreference()).toBe('ko');
});

test('restore persistence failure rolls back prompt replacement and preserves language', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'restore-failure-current',
    title: '롤백되어야 하는 현재 프롬프트',
    content: '언어 저장 실패 뒤에도 남아야 한다.',
    normalOrder: 1,
  });
  const restoredPrompt = createPromptRecord({
    id: 'restore-failure-backup',
    title: '반영되면 안 되는 백업 프롬프트',
    content: '언어 저장 실패 때문에 최종 저장되면 안 된다.',
    normalOrder: 2,
  });
  const filePath = await writeJsonFixture(testInfo, 'restore-write-fails.json', {
    type: 'promptit.backup',
    appVersion: '0.9.0',
    exportedAt: '2026-05-05T03:04:05.000Z',
    data: {
      prompts: [restoredPrompt],
      settings: {
        languagePreference: 'en',
      },
    },
  });

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);
  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toBeVisible();

  await extension.failLanguagePreferenceWrites();
  await modal.getByTestId('backup-restore-confirm-button').click();

  await expect(getOptionsToast(page)).toContainText(
    '복원에 실패했습니다. 현재 데이터는 변경되지 않았습니다.',
  );
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([
    currentPrompt,
  ]);
  expect(await extension.getLanguagePreference()).toBe('ko');
});

test('prompt import appends new prompt records without overwriting existing prompts', async ({
  extension,
}, testInfo) => {
  const existingPrompt = createPromptRecord({
    id: 'import-existing',
    title: '기존 프롬프트',
    content: '기존 본문',
    normalOrder: 1,
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-06T02:00:00.000Z',
  });
  const sharedPrompts = [
    {
      title: '가져온 첫 번째',
      content: '가져온 첫 번째 본문',
    },
    {
      title: '가져온 두 번째',
      content: '가져온 두 번째 본문',
    },
  ];
  const filePath = await writeJsonFixture(testInfo, 'shared-prompts.json', {
    type: 'promptit.prompts',
    appVersion: '0.9.0',
    exportedAt: '2026-05-07T03:04:05.000Z',
    data: {
      prompts: sharedPrompts,
    },
  });

  await extension.setPromptRecords([existingPrompt]);
  const beforeRevision = await extension.getPromptStorageRevision();

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);
  const importStartedAt = Date.now();

  await modal.getByTestId('prompts-import-file-input').setInputFiles(filePath);

  await expect(getOptionsToast(page)).toContainText(
    '2개의 프롬프트를 가져왔습니다.',
  );

  const importFinishedAt = Date.now();
  const records = await extension.getPromptRecords();

  expect(records.map((prompt) => prompt.title)).toEqual([
    existingPrompt.title,
    '가져온 첫 번째',
    '가져온 두 번째',
  ]);
  expect(records[0]).toEqual(existingPrompt);

  for (const [index, importedPrompt] of records.slice(1).entries()) {
    const sourcePrompt = sharedPrompts[index];

    expect(importedPrompt).toEqual(
      expect.objectContaining({
        title: sourcePrompt.title,
        content: sourcePrompt.content,
        pinned: false,
        pinnedOrder: null,
        charCount: Array.from(sourcePrompt.content).length,
      }),
    );
    expect(importedPrompt.id).not.toBe(existingPrompt.id);
    expect(importedPrompt.normalOrder).toBeGreaterThan(
      index === 0 ? existingPrompt.normalOrder : records[index].normalOrder,
    );

    for (const timestamp of [
      importedPrompt.createdAt,
      importedPrompt.updatedAt,
      importedPrompt.bodyUpdatedAt,
    ]) {
      const timestampMs = Date.parse(timestamp);

      expect(timestampMs).toBeGreaterThanOrEqual(importStartedAt - 1000);
      expect(timestampMs).toBeLessThanOrEqual(importFinishedAt + 1000);
    }
  }

  expect(await extension.getPromptStorageRevision()).not.toEqual(beforeRevision);
});

test('invalid prompt import files preserve current data', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'invalid-import-current',
    title: '가져오기 전 프롬프트',
    content: '잘못된 가져오기 후에도 유지되어야 한다.',
    normalOrder: 1,
  });
  const filePath = await writeJsonFixture(testInfo, 'invalid-import.json', {
    type: 'promptit.prompts',
    appVersion: '0.9.0',
    exportedAt: '2026-05-07T03:04:05.000Z',
    data: {
      prompts: [
        {
          title: '추가되면 안 됨',
          content: '공유 프롬프트 객체에는 id가 있으면 안 된다.',
          id: 'invalid-extra-id',
        },
      ],
    },
  });

  await extension.setPromptRecords([currentPrompt]);

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('prompts-import-file-input').setInputFiles(filePath);

  await expect(getOptionsToast(page)).toContainText(
    '프롬프트 가져오기에 실패했습니다.',
  );
  expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
});

test('malformed restore and import runtime messages are not accepted', async ({
  extension,
}) => {
  const currentPrompt = createPromptRecord({
    id: 'malformed-portability-current',
    title: '런타임 계약 유지',
    content: '잘못된 런타임 메시지 뒤에도 유지되어야 한다.',
    normalOrder: 1,
  });

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');

  await expectRawRuntimeMessageNotAccepted(extension, {
    type: RESTORE_BACKUP_MESSAGE,
    backup: {
      type: 'promptit.backup',
      appVersion: '0.9.0',
      exportedAt: '2026-05-08T00:00:00.000Z',
      data: {
        prompts: [],
        settings: {
          languagePreference: 'fr',
        },
      },
    },
  });
  expect(await extension.getLanguagePreference()).toBe('ko');

  await expectRawRuntimeMessageNotAccepted(extension, {
    type: IMPORT_PROMPTS_MESSAGE,
    prompts: {
      type: 'promptit.prompts',
      appVersion: '0.9.0',
      exportedAt: '2026-05-08T00:00:00.000Z',
      data: {
        prompts: [
          {
            title: '계약 위반',
            content: 'extra 키 때문에 거부되어야 한다.',
            normalOrder: 1,
          },
        ],
      },
    },
  });
  expect(await extension.getLanguagePreference()).toBe('ko');

  expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
});

test('uses English browser UI language when preference is browser default', async () => {
  const extension = await launchExtension({ browserLocale: 'en-US' });

  try {
    await extension.clearLanguagePreference();

    await expect
      .poll(async () => await extension.getLanguagePreference())
      .toBeUndefined();
    await expect
      .poll(async () => await extension.getBrowserUiLanguage())
      .toMatch(/^en(?:-|$)/i);

    const page = await openOptionsPageShell(extension);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectEnglishOptionsLanding(page);
    await expect(
      page.getByRole('button', {
        name: /Open language menu: System, current English/,
      }),
    ).toBeVisible();
  } finally {
    await extension.close();
  }
});

test('falls back to Korean for unsupported browser UI language in browser default mode', async () => {
  const extension = await launchExtension();

  try {
    await extension.clearLanguagePreference();

    const page = await openOptionsPage(extension, async (nextPage) => {
      await nextPage.addInitScript(() => {
        Object.defineProperty(chrome.i18n, 'getUILanguage', {
          configurable: true,
          value: () => 'fr-FR',
        });
      });
    });

    await expect
      .poll(async () => await extension.getLanguagePreference())
      .toBeUndefined();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(
      page.getByRole('button', { name: /언어 메뉴 열기: 시스템, 현재 한국어/ }),
    ).toBeVisible();
    expect(await page.evaluate(() => chrome.i18n.getUILanguage())).toBe('fr-FR');
  } finally {
    await extension.close();
  }
});

test('theme selector defaults to system and persists dark preference', async ({
  extension,
}) => {
  const themePrompt = createPromptRecord({
    id: 'theme-dark-palette-contract',
    title: '다크 팔레트 검증',
    content: '선택 행과 편집 버튼의 다크 팔레트를 검증한다.',
  });

  await extension.clearThemePreference();
  await extension.setPromptRecords([themePrompt]);

  const page = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.emulateMedia({ colorScheme: 'light' });
  });

  const themeSelector = page.getByRole('group', { name: '테마 선택' });
  const systemButton = themeSelector.getByRole('button', { name: '시스템' });
  const darkButton = themeSelector.getByRole('button', { name: '다크' });

  await expect(systemButton).toHaveAttribute('aria-pressed', 'true');
  await expect(await getOptionsThemeSnapshot(page)).toMatchObject({
    colorScheme: 'light',
    mainBackgroundColor: 'rgb(245, 245, 244)',
    rootTheme: 'light',
  });

  const promptCard = getPromptCard(page, themePrompt.title);
  await promptCard.click();
  await expect(
    page.getByRole('heading', { name: '프롬프트 수정' }),
  ).toBeVisible();
  await expect(getContentInput(page)).toHaveValue(themePrompt.content);

  const createButtonStyle = await getComputedThemeStyle(
    getPromptListCreateButton(page),
  );
  const cancelEditButtonStyle = await getComputedThemeStyle(
    getPromptEditor(page).getByRole('button', {
      name: '편집 취소',
      exact: true,
    }),
  );
  expect(cancelEditButtonStyle.fontSize).toBe(createButtonStyle.fontSize);
  expect(cancelEditButtonStyle.fontWeight).toBe(createButtonStyle.fontWeight);
  expect(cancelEditButtonStyle.lineHeight).toBe(createButtonStyle.lineHeight);

  const lightPromptListSurfaceStyle = await getComputedThemeStyle(
    getPromptList(page),
  );
  const lightPromptEditorIdleSurfaceStyle = await getComputedThemeStyle(
    getPromptEditor(page),
  );
  expect(lightPromptEditorIdleSurfaceStyle.backgroundColor).toBe(
    lightPromptListSurfaceStyle.backgroundColor,
  );
  expect(lightPromptEditorIdleSurfaceStyle.backgroundColor).toBe(
    'rgb(255, 255, 255)',
  );

  await getTitleInput(page).focus();

  const lightPromptEditorActiveSurfaceStyle = await getComputedThemeStyle(
    getPromptEditor(page),
  );
  expect(lightPromptEditorActiveSurfaceStyle.backgroundColor).toBe(
    'rgb(246, 248, 245)',
  );

  await darkButton.click();
  await expect.poll(async () => await extension.getThemePreference()).toBe('dark');
  await expect(darkButton).toHaveAttribute('aria-pressed', 'true');

  const darkSnapshot = await getOptionsThemeSnapshot(page);
  expect(darkSnapshot.rootTheme).toBe('dark');
  expect(darkSnapshot.colorScheme).toBe('dark');
  expectRgbChannelsBetween(darkSnapshot.mainBackgroundColor, 19, 21);
  expectRgbChannelsBetween(darkSnapshot.heroBorderColor, 45, 70);
  expectRgbChannelsBetween(darkSnapshot.textColor, 238, 242);

  const promptListSurfaceStyle = await getComputedThemeStyle(getPromptList(page));
  const promptEditorIdleSurfaceStyle = await getComputedThemeStyle(
    getPromptEditor(page),
  );
  expect(promptEditorIdleSurfaceStyle.backgroundColor).toBe(
    promptListSurfaceStyle.backgroundColor,
  );
  expect(promptEditorIdleSurfaceStyle.backgroundColor).toBe('rgb(34, 34, 34)');

  await getTitleInput(page).focus();

  const promptEditorActiveSurfaceStyle = await getComputedThemeStyle(
    getPromptEditor(page),
  );
  const promptEditorSurface = parseRgbColor(
    promptEditorActiveSurfaceStyle.backgroundColor,
  );
  const promptEditorSurfaceChannels = [
    promptEditorSurface.red,
    promptEditorSurface.green,
    promptEditorSurface.blue,
  ];
  const darkMainSurface = parseRgbColor(darkSnapshot.mainBackgroundColor);

  expect(Math.min(...promptEditorSurfaceChannels)).toBeGreaterThanOrEqual(34);
  expect(Math.max(...promptEditorSurfaceChannels)).toBeLessThanOrEqual(46);
  expect(
    Math.max(...promptEditorSurfaceChannels) -
      Math.min(...promptEditorSurfaceChannels),
  ).toBeLessThanOrEqual(5);
  expect(promptEditorSurface.green - promptEditorSurface.red).toBeGreaterThanOrEqual(
    2,
  );
  expect(promptEditorSurface.green - promptEditorSurface.blue).toBeGreaterThanOrEqual(
    2,
  );
  expect(promptEditorSurface.green - promptEditorSurface.red).toBeLessThanOrEqual(
    4,
  );
  expect(promptEditorSurface.green - promptEditorSurface.blue).toBeLessThanOrEqual(
    4,
  );
  expect(
    Math.max(
      Math.abs(promptEditorSurface.red - darkMainSurface.red),
      Math.abs(promptEditorSurface.green - darkMainSurface.green),
      Math.abs(promptEditorSurface.blue - darkMainSurface.blue),
    ),
  ).toBeLessThanOrEqual(28);

  const selectedPromptSurface = promptCard.locator('xpath=../..');

  await expect
    .poll(async () => (await getComputedThemeStyle(selectedPromptSurface)).backgroundColor)
    .toBe('rgb(62, 62, 62)');

  const selectedPromptSurfaceStyle = await getComputedThemeStyle(
    selectedPromptSurface,
  );
  expectNeutralRgbChannelsBetween(
    selectedPromptSurfaceStyle.backgroundColor,
    58,
    66,
  );
  expectNeutralRgbChannelsBetween(selectedPromptSurfaceStyle.borderColor, 96, 112);

  const selectedPromptBadgeStyle = await getComputedThemeStyle(
    promptCard.getByTestId('prompt-group-label'),
  );
  expectRgbaAlphaBetween(selectedPromptBadgeStyle.backgroundColor, 0.08, 0.13);

  const primaryButtonStyle = await getComputedThemeStyle(
    getPromptSubmitButton(page, '프롬프트 수정'),
  );
  expectNeutralRgbChannelsBetween(primaryButtonStyle.backgroundColor, 48, 82);

  const destructiveButtonStyle = await getComputedThemeStyle(
    getPromptEditor(page).getByRole('button', {
      name: '프롬프트 삭제',
      exact: true,
    }),
  );
  expect(destructiveButtonStyle.fontSize).toBe(primaryButtonStyle.fontSize);
  expect(destructiveButtonStyle.fontWeight).toBe(primaryButtonStyle.fontWeight);
  expect(destructiveButtonStyle.lineHeight).toBe(primaryButtonStyle.lineHeight);

  const destructiveSurface = parseRgbColor(destructiveButtonStyle.backgroundColor);
  const destructiveBorder = parseRgbColor(destructiveButtonStyle.borderColor);
  const destructiveText = parseRgbColor(destructiveButtonStyle.color);

  expect(destructiveSurface.red).toBeGreaterThan(destructiveSurface.green);
  expect(destructiveSurface.red).toBeGreaterThan(destructiveSurface.blue);
  expect(destructiveSurface.red).toBeLessThanOrEqual(140);
  expect(destructiveSurface.alpha).toBeGreaterThanOrEqual(0.2);
  expect(destructiveSurface.alpha).toBeLessThanOrEqual(0.45);
  expect(destructiveBorder.red).toBeGreaterThan(destructiveBorder.green);
  expect(destructiveBorder.red).toBeGreaterThan(destructiveBorder.blue);
  expect(destructiveBorder.alpha).toBeGreaterThanOrEqual(0.3);
  expect(destructiveBorder.alpha).toBeLessThanOrEqual(0.6);
  expect(destructiveText.red).toBeGreaterThan(destructiveText.green);
  expect(destructiveText.red).toBeGreaterThan(destructiveText.blue);
  expect(destructiveText.red).toBeLessThanOrEqual(245);
  expect(destructiveText.green).toBeGreaterThanOrEqual(120);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('group', { name: '테마 선택' }).getByRole('button', { name: '다크' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('dark');
});

test('theme selector follows dark system media and light overrides it', async ({
  extension,
}) => {
  await extension.clearThemePreference();

  const page = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.emulateMedia({ colorScheme: 'dark' });
  });

  const themeSelector = page.getByRole('group', { name: '테마 선택' });
  const systemButton = themeSelector.getByRole('button', { name: '시스템' });
  const lightButton = themeSelector.getByRole('button', { name: '라이트' });

  await expect(systemButton).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('dark');
  await expect(await getOptionsThemeSnapshot(page)).toMatchObject({
    colorScheme: 'dark',
    rootTheme: 'dark',
  });

  await lightButton.click();

  await expect.poll(async () => await extension.getThemePreference()).toBe('light');
  await expect(lightButton).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('light');
  await expect(await getOptionsThemeSnapshot(page)).toMatchObject({
    colorScheme: 'light',
    mainBackgroundColor: 'rgb(245, 245, 244)',
    rootTheme: 'light',
  });
});

test('theme selector reacts to storage changes from another extension page', async ({
  extension,
}) => {
  await extension.setThemePreference('dark');

  const page = await openOptionsPage(extension);
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('dark');

  await extension.setThemePreference('light');

  await expect(page.getByRole('group', { name: '테마 선택' }).getByRole('button', { name: '라이트' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('light');
  await expect(await getOptionsThemeSnapshot(page)).toMatchObject({
    colorScheme: 'light',
    mainBackgroundColor: 'rgb(245, 245, 244)',
  });
});

test('uses heavier Korean prompt list microcopy to match English visual density', async ({
  extension,
}) => {
  const koreanPrompt = createPromptRecord({
    id: 'korean-list-microcopy-density',
    title: '한국어 라벨',
    content: '본문',
    normalOrder: 1,
  });

  await extension.setPromptRecords([koreanPrompt]);

  const page = await openOptionsPage(extension);

  await expectPromptListMicrocopyTypography(page, koreanPrompt.title, 'ko');
});

test('switches options UI to English while keeping fixed literals and Korean prompt data unchanged', async ({
  extension,
}) => {
  const koreanPrompt = createPromptRecord({
    id: 'english-options-korean-prompt',
    title: '한국어 제목',
    content: '한국어 본문은 번역되면 안 됩니다.',
    createdAt: '2026-05-24T10:17:00.000Z',
    updatedAt: '2026-05-26T08:44:00.000Z',
    normalOrder: 1,
  });

  await extension.setPromptRecords([koreanPrompt]);

  const page = await openOptionsPage(extension);

  await page.getByRole('button', { name: /언어 메뉴 열기/ }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();

  await expect.poll(async () => await extension.getLanguagePreference()).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'Save and paste prompts.' }),
  ).toBeVisible();
  await expect(page.getByText(/ChatGPT and Gemini/)).toBeVisible();
  await expect(page.getByText('promptit')).toBeVisible();
  await expect(page.getByLabel('/ Space')).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: '/' })).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: 'Space' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved prompts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add prompt' })).toBeVisible();
  await expect(page.getByText('Prompt list')).toBeVisible();
  await expect(page.getByText('Editor').first()).toBeVisible();

  await expect(page.getByText(koreanPrompt.title)).toBeVisible();
  await expectPromptMetaValuesToUseTwoLineLayout(
    page.getByTestId('prompt-card').filter({ hasText: koreanPrompt.title }).first(),
  );
  await expectPromptListMicrocopyTypography(page, koreanPrompt.title, 'en');
  await page.getByRole('button', { name: `Edit ${koreanPrompt.title}` }).click();
  await expect(page.getByRole('heading', { name: 'Edit prompt' })).toBeVisible();
  await expect(page.locator('form').getByRole('textbox', { name: /Title/ }))
    .toHaveValue(koreanPrompt.title);
  await expect(page.locator('form').getByRole('textbox', { name: /Body/ }))
    .toHaveValue(koreanPrompt.content);

  const englishPromptList = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Saved prompts' }) });
  await englishPromptList.getByRole('button', {
    name: 'Add prompt',
    exact: true,
  }).click();
  await page.locator('form').getByRole('textbox', { name: /Title/ }).fill('   ');
  await page.locator('form').getByRole('textbox', { name: /Body/ }).fill('   ');
  await page.locator('form').getByRole('button', { name: 'Add prompt' }).click();
  await expect(page.getByText('Body cannot be empty.')).toBeVisible();

  await page.locator('form').getByRole('textbox', { name: /Title/ })
    .fill('새 한국어 제목');
  await page.locator('form').getByRole('textbox', { name: /Body/ })
    .fill('새 한국어 본문도 그대로 저장됩니다.');
  await page.locator('form').getByRole('button', { name: 'Add prompt' }).click();
  await expect(getOptionsToast(page)).toContainText('Prompt saved.');

  await page.locator('form').getByRole('textbox', { name: /Title/ })
    .fill('Unsaved draft');
  await page.locator('form').getByRole('textbox', { name: /Body/ })
    .fill('Unsaved body');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      'You have unsaved changes. Discard them and continue?',
    );
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: `Edit ${koreanPrompt.title}` }).click();
  await expect(page.locator('form').getByRole('textbox', { name: /Title/ }))
    .toHaveValue('Unsaved draft');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      'You have unsaved changes. Discard them and continue?',
    );
    await dialog.accept();
  });
  await page.getByRole('button', { name: `Edit ${koreanPrompt.title}` }).click();
  await expect(page.locator('form').getByRole('textbox', { name: /Title/ }))
    .toHaveValue(koreanPrompt.title);

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(`Delete "${koreanPrompt.title}" prompt?`);
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Delete prompt', exact: true }).click();
});

test('creates and updates prompts from the options page', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);
  await expectSortOrderInputToBeRemoved(page);

  await createPromptFromOptions(
    page,
    '  회의록 정리  ',
    '대화 내용을 구조화해서 정리해줘.',
  );

  await expect(getOptionsToast(page)).toContainText('프롬프트를 저장했습니다.');
  await expect(getOptionsToast(page).getByRole('status')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  await expect(
    getPromptEditor(page).getByText('프롬프트를 저장했습니다.'),
  ).toHaveCount(0);
  await expect(getTitleInput(page)).toHaveValue('');
  await expectPromptListToHideInternalOrderFields(page);

  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        title: prompt.title,
        content: prompt.content,
      })),
    )
    .toEqual([
      {
        title: '회의록 정리',
        content: '대화 내용을 구조화해서 정리해줘.',
      },
    ]);

  await getPromptCard(page, '회의록 정리').click();
  await expect(
    page.getByRole('heading', { name: '프롬프트 수정' }),
  ).toBeVisible();
  await expectSortOrderInputToBeRemoved(page);

  await getTitleInput(page).fill('회의록 요약');
  await getContentInput(page).fill('회의 내용을 요약하고 액션 아이템을 정리해줘.');
  await page.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(getOptionsToast(page)).toContainText('프롬프트를 업데이트했습니다.');
  await expect(getTitleInput(page)).toHaveValue('회의록 요약');

  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        title: prompt.title,
        content: prompt.content,
      })),
    )
    .toEqual([
      {
        title: '회의록 요약',
        content: '회의 내용을 요약하고 액션 아이템을 정리해줘.',
      },
    ]);
  await expect(
    page.getByRole('alert').filter({
      hasText:
        '다른 창의 변경이 먼저 저장되었습니다. 현재 입력은 유지되며 저장 시 충돌이 발생할 수 있습니다.',
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: '충돌 감지됨' }),
  ).toHaveCount(0);
  await expect(page.getByText('최신 저장본')).toHaveCount(0);
});

test('appends newly created normal prompts by default', async ({
  extension,
}) => {
  const existingPrompt = createPromptRecord({
    id: 'append-existing-normal',
    title: '기존 일반',
    content: '기존 일반 본문',
    normalOrder: 1,
  });

  await extension.setPromptRecords([existingPrompt]);

  const page = await openOptionsPage(extension);

  await createPromptFromOptions(page, '새 일반', '새 일반 본문');

  await expect(getOptionsToast(page)).toContainText('프롬프트를 저장했습니다.');
  await expectVisiblePromptOrder(page, ['기존 일반', '새 일반']);
  await expectPromptListToHideInternalOrderFields(page);

  const createdPrompt = (await extension.getPromptRecords()).find(
    (prompt) => prompt.title === '새 일반',
  );

  if (!createdPrompt) {
    throw new Error('Newly created prompt was not persisted.');
  }

  await expectStoredPromptMetaOrder(extension, [
    existingPrompt.id,
    createdPrompt.id,
  ]);
});

test('creates prompt records without writing production bodies to chrome.storage.local', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);
  const bodyText = 'IndexedDB 본문 분리 저장 검증용 본문';

  await createPromptFromOptions(page, '분리 저장', bodyText);

  await expect(getOptionsToast(page)).toContainText('프롬프트를 저장했습니다.');

  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        title: prompt.title,
        content: prompt.content,
        bodyUpdatedAt: prompt.bodyUpdatedAt,
        charCount: prompt.charCount,
      })),
    )
    .toEqual([
      expect.objectContaining({
        title: '분리 저장',
        content: bodyText,
        charCount: Array.from(bodyText).length,
      }),
    ]);
  await expectNoChromeStoragePromptBody(extension, bodyText);
});

test('accepts an exact 500 KiB body and rejects oversized updates without truncation', async ({
  extension,
}) => {
  const exactLimitBody = 'a'.repeat(PROMPT_BODY_MAX_BYTES);
  const oversizedBody = `${exactLimitBody}b`;
  const initialPrompt = createPromptRecord({
    id: 'body-limit-prompt',
    title: '본문 용량 제한',
    content: exactLimitBody,
    normalOrder: 1,
  });

  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);
  await createPromptFromOptions(page, initialPrompt.title, exactLimitBody);

  await expect(getOptionsToast(page)).toContainText('프롬프트를 저장했습니다.');

  const [createdPrompt] = await extension.getPromptRecords();
  expect(createdPrompt.content).toBe(exactLimitBody);
  expect(createdPrompt.charCount).toBe(PROMPT_BODY_MAX_BYTES);
  await expectNoChromeStoragePromptBody(extension, exactLimitBody);

  await getPromptCard(page, initialPrompt.title).click();
  await expect(getContentInput(page)).toHaveValue(exactLimitBody);
  await getContentInput(page).fill(oversizedBody);
  await page.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(page.getByText('본문은 500KB 이하로 입력해주세요.')).toBeVisible();
  await expect(await extension.getPromptBody(createdPrompt.id)).toEqual({
    id: createdPrompt.id,
    content: exactLimitBody,
    updatedAt: createdPrompt.bodyUpdatedAt,
  });
});

test('metadata-only save does not rewrite body content or body timestamp', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'metadata-only-prompt',
    title: '원래 제목',
    content: '본문은 바뀌면 안 된다.',
    normalOrder: 4,
    createdAt: '2026-03-29T01:00:00.000Z',
    updatedAt: '2026-03-29T01:00:00.000Z',
    bodyUpdatedAt: '2026-03-29T01:00:00.000Z',
  });

  await extension.setPromptRecords([initialPrompt]);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, initialPrompt.title).click();
  await expect(getContentInput(page)).toHaveValue(initialPrompt.content);
  await getTitleInput(page).fill('제목만 변경');
  await page.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(getOptionsToast(page)).toContainText('프롬프트를 업데이트했습니다.');

  const updatedPrompt = await getRequiredPromptRecord(extension, initialPrompt.id);
  const updatedBody = await extension.getPromptBody(initialPrompt.id);

  expect(updatedPrompt.title).toBe('제목만 변경');
  expect(updatedPrompt.updatedAt).not.toBe(initialPrompt.updatedAt);
  expect(updatedPrompt.bodyUpdatedAt).toBe(initialPrompt.bodyUpdatedAt);
  expect(updatedBody).toEqual({
    id: initialPrompt.id,
    content: initialPrompt.content,
    updatedAt: initialPrompt.bodyUpdatedAt,
  });
});

test('body save updates the body record, bodyUpdatedAt, and charCount', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'body-update-prompt',
    title: '본문 변경',
    content: '이전 본문',
    normalOrder: 4,
    createdAt: '2026-03-29T02:00:00.000Z',
    updatedAt: '2026-03-29T02:00:00.000Z',
    bodyUpdatedAt: '2026-03-29T02:00:00.000Z',
  });
  const nextBody = '새 본문🙂';

  await extension.setPromptRecords([initialPrompt]);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, initialPrompt.title).click();
  await expect(getContentInput(page)).toHaveValue(initialPrompt.content);
  await getContentInput(page).fill(nextBody);
  await page.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(getOptionsToast(page)).toContainText('프롬프트를 업데이트했습니다.');

  const updatedPrompt = await getRequiredPromptRecord(extension, initialPrompt.id);
  const updatedBody = await extension.getPromptBody(initialPrompt.id);

  expect(updatedPrompt.content).toBe(nextBody);
  expect(updatedPrompt.bodyUpdatedAt).not.toBe(initialPrompt.bodyUpdatedAt);
  expect(updatedPrompt.charCount).toBe(Array.from(nextBody).length);
  expect(updatedBody).toEqual({
    id: initialPrompt.id,
    content: nextBody,
    updatedAt: updatedPrompt.bodyUpdatedAt,
  });
});

test('runtime create commits when prompt revision publication fails', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);
  await extension.failPromptStorageRevisionWrites();

  const createResponse = await extension.sendRuntimeMessage({
    type: CREATE_PROMPT_MESSAGE,
    draft: {
      title: '리비전 실패 생성',
      content: '리비전 저장 실패와 무관하게 생성되어야 한다.',
      normalOrder: 1,
    },
  });

  expect(createResponse).toEqual(
    expect.objectContaining({
      type: CREATE_PROMPT_MESSAGE,
      ok: true,
      status: 'success',
    }),
  );

  const createdPrompt = (createResponse as {
    prompt: PromptRecord;
  }).prompt;
  const afterCreateRecords = await extension.getPromptRecords();

  expect(afterCreateRecords).toHaveLength(1);
  expect(afterCreateRecords[0]).toEqual(
    expect.objectContaining({
      id: createdPrompt.id,
      title: '리비전 실패 생성',
      content: '리비전 저장 실패와 무관하게 생성되어야 한다.',
    }),
  );

  const updateMetaResponse = await extension.sendRuntimeMessage({
    type: UPDATE_PROMPT_META_MESSAGE,
    id: createdPrompt.id,
    draft: {
      title: '리비전 실패 제목 수정',
      normalOrder: afterCreateRecords[0].normalOrder,
    },
    expectedUpdatedAt: afterCreateRecords[0].updatedAt,
  });

  expect(updateMetaResponse).toEqual(
    expect.objectContaining({
      type: UPDATE_PROMPT_META_MESSAGE,
      ok: true,
      status: 'success',
    }),
  );

  const afterMetaUpdate = await getRequiredPromptRecord(
    extension,
    createdPrompt.id,
  );

  expect(afterMetaUpdate.title).toBe('리비전 실패 제목 수정');
  expect(afterMetaUpdate.content).toBe(
    '리비전 저장 실패와 무관하게 생성되어야 한다.',
  );

  const updateBodyResponse = await extension.sendRuntimeMessage({
    type: UPDATE_PROMPT_BODY_MESSAGE,
    id: createdPrompt.id,
    content: '리비전 저장 실패와 무관하게 본문도 수정되어야 한다.',
    expectedUpdatedAt: afterMetaUpdate.updatedAt,
    expectedBodyUpdatedAt: afterMetaUpdate.bodyUpdatedAt,
  });

  expect(updateBodyResponse).toEqual(
    expect.objectContaining({
      type: UPDATE_PROMPT_BODY_MESSAGE,
      ok: true,
      status: 'success',
    }),
  );

  const afterBodyUpdate = await getRequiredPromptRecord(
    extension,
    createdPrompt.id,
  );

  expect(afterBodyUpdate.content).toBe(
    '리비전 저장 실패와 무관하게 본문도 수정되어야 한다.',
  );

  const deleteResponse = await extension.sendRuntimeMessage({
    type: DELETE_PROMPT_MESSAGE,
    id: createdPrompt.id,
    expectedUpdatedAt: afterBodyUpdate.updatedAt,
    expectedBodyUpdatedAt: afterBodyUpdate.bodyUpdatedAt,
  });

  expect(deleteResponse).toEqual(
    expect.objectContaining({
      type: DELETE_PROMPT_MESSAGE,
      ok: true,
      status: 'success',
      id: createdPrompt.id,
    }),
  );
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([]);
});

test('runtime create accepts drafts without conflict timestamps', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const response = await extension.sendRawRuntimeMessage({
    type: CREATE_PROMPT_MESSAGE,
    draft: {
      title: '타임스탬프 없는 생성',
      content: '생성은 충돌 타임스탬프가 없어도 허용된다.',
      normalOrder: 1,
    },
  });

  expect(response).toEqual(
    expect.objectContaining({
      type: CREATE_PROMPT_MESSAGE,
      ok: true,
      status: 'success',
    }),
  );
  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        title: prompt.title,
        content: prompt.content,
      })),
    )
    .toEqual([
      {
        title: '타임스탬프 없는 생성',
        content: '생성은 충돌 타임스탬프가 없어도 허용된다.',
      },
    ]);
});

test('runtime mutations without required conflict timestamps are not accepted', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'runtime-contract-prompt',
    title: '런타임 계약',
    content: '타임스탬프 누락 요청은 반영되면 안 된다.',
    normalOrder: 1,
    createdAt: '2026-03-29T03:00:00.000Z',
    updatedAt: '2026-03-29T03:00:00.000Z',
    bodyUpdatedAt: '2026-03-29T03:00:00.000Z',
  });

  await extension.setPromptRecords([initialPrompt]);

  await expectRawRuntimeMessageNotAccepted(extension, {
    type: UPDATE_PROMPT_META_MESSAGE,
    id: initialPrompt.id,
    draft: {
      title: '반영되면 안 되는 제목',
      normalOrder: 2,
    },
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: SET_PROMPT_PINNED_MESSAGE,
    id: initialPrompt.id,
    pinned: true,
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: MOVE_PROMPT_MESSAGE,
    id: initialPrompt.id,
    previousId: null,
    nextId: null,
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: MOVE_PROMPT_MESSAGE,
    id: initialPrompt.id,
    nextId: null,
    expectedUpdatedAt: initialPrompt.updatedAt,
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: MOVE_PROMPT_MESSAGE,
    id: initialPrompt.id,
    previousId: null,
    expectedUpdatedAt: initialPrompt.updatedAt,
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: UPDATE_PROMPT_BODY_MESSAGE,
    id: initialPrompt.id,
    content: '반영되면 안 되는 본문',
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: UPDATE_PROMPT_BODY_MESSAGE,
    id: initialPrompt.id,
    content: '반영되면 안 되는 본문',
    expectedBodyUpdatedAt: initialPrompt.bodyUpdatedAt,
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: UPDATE_PROMPT_RECORD_MESSAGE,
    id: initialPrompt.id,
    draft: {
      title: '반영되면 안 되는 제목',
      content: '반영되면 안 되는 본문',
    },
    expectedBodyUpdatedAt: initialPrompt.bodyUpdatedAt,
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: UPDATE_PROMPT_RECORD_MESSAGE,
    id: initialPrompt.id,
    draft: {
      title: '반영되면 안 되는 제목',
      content: '반영되면 안 되는 본문',
    },
    expectedUpdatedAt: initialPrompt.updatedAt,
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: DELETE_PROMPT_MESSAGE,
    id: initialPrompt.id,
    expectedBodyUpdatedAt: initialPrompt.bodyUpdatedAt,
  });
});

test('rejects stale body updates when the prompt metadata timestamp changed', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'runtime-body-meta-conflict',
    title: '본문 저장 메타 충돌',
    content: '메타 변경 전 본문',
    normalOrder: 1,
    createdAt: '2026-03-29T04:00:00.000Z',
    updatedAt: '2026-03-29T04:00:00.000Z',
    bodyUpdatedAt: '2026-03-29T04:00:00.000Z',
  });

  await extension.setPromptRecords([initialPrompt]);

  const metaResponse = await extension.sendRuntimeMessage({
    type: UPDATE_PROMPT_META_MESSAGE,
    id: initialPrompt.id,
    draft: {
      title: '다른 창의 최신 제목',
      normalOrder: initialPrompt.normalOrder,
    },
    expectedUpdatedAt: initialPrompt.updatedAt,
  });

  expect(metaResponse).toEqual(
    expect.objectContaining({
      type: UPDATE_PROMPT_META_MESSAGE,
      ok: true,
      status: 'success',
    }),
  );

  const afterMetaUpdate = await getRequiredPromptRecord(
    extension,
    initialPrompt.id,
  );

  expect(afterMetaUpdate.updatedAt).not.toBe(initialPrompt.updatedAt);
  expect(afterMetaUpdate.bodyUpdatedAt).toBe(initialPrompt.bodyUpdatedAt);

  const staleBodyResponse = await extension.sendRawRuntimeMessage({
    type: UPDATE_PROMPT_BODY_MESSAGE,
    id: initialPrompt.id,
    content: '오래된 메타 기준 본문',
    expectedUpdatedAt: initialPrompt.updatedAt,
    expectedBodyUpdatedAt: initialPrompt.bodyUpdatedAt,
  });

  expect(staleBodyResponse).toEqual(
    expect.objectContaining({
      type: UPDATE_PROMPT_BODY_MESSAGE,
      ok: false,
      status: 'conflict',
      id: initialPrompt.id,
    }),
  );
  await expect
    .poll(async () => await getRequiredPromptRecord(extension, initialPrompt.id))
    .toEqual(
      expect.objectContaining({
        title: '다른 창의 최신 제목',
        content: initialPrompt.content,
        bodyUpdatedAt: initialPrompt.bodyUpdatedAt,
      }),
    );
  expect(await extension.getPromptBody(initialPrompt.id)).toEqual({
    id: initialPrompt.id,
    content: initialPrompt.content,
    updatedAt: initialPrompt.bodyUpdatedAt,
  });
});

test('orders prompts with matching normalOrder by createdAt and id tie-breaks', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'same-sort-later',
      title: '생성일 늦은 프롬프트',
      content: '생성일이 가장 늦어서 마지막에 보여야 한다.',
      normalOrder: 5,
      createdAt: new Date('2026-03-29T00:03:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:03:00.000Z').toISOString(),
    }),
    createPromptRecord({
      id: 'same-sort-id-b',
      title: '같은 생성일 ID B',
      content: '같은 생성일에서는 ID A 다음에 보여야 한다.',
      normalOrder: 5,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
    createPromptRecord({
      id: 'same-sort-earlier',
      title: '생성일 빠른 프롬프트',
      content: '생성일이 가장 빨라서 먼저 보여야 한다.',
      normalOrder: 5,
      createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    }),
    createPromptRecord({
      id: 'same-sort-id-a',
      title: '같은 생성일 ID A',
      content: '같은 생성일에서는 ID B보다 먼저 보여야 한다.',
      normalOrder: 5,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expectVisiblePromptOrder(page, [
    '생성일 빠른 프롬프트',
    '같은 생성일 ID A',
    '같은 생성일 ID B',
    '생성일 늦은 프롬프트',
  ]);
  await expectPromptListToHideInternalOrderFields(page);
});

test('orders pinned prompts first and restores normal position when unpinned', async ({
  extension,
}) => {
  const normalFirst = createPromptRecord({
    id: 'normal-first',
    title: '일반 첫 번째',
    content: '일반 첫 번째 본문',
    normalOrder: 1,
  });
  const pinnedMiddle = createPromptRecord({
    id: 'pinned-middle',
    title: '고정된 중간',
    content: '고정된 중간 본문',
    normalOrder: 2,
    pinned: true,
    pinnedOrder: 1,
  });
  const normalLast = createPromptRecord({
    id: 'normal-last',
    title: '일반 마지막',
    content: '일반 마지막 본문',
    normalOrder: 3,
  });

  await extension.setPromptRecords([normalLast, pinnedMiddle, normalFirst]);

  const page = await openOptionsPage(extension);

  await expectVisiblePromptOrder(page, [
    '고정된 중간',
    '일반 첫 번째',
    '일반 마지막',
  ]);
  await expectPromptListToHideInternalOrderFields(page);

  await setPromptPinnedThroughRuntime(extension, pinnedMiddle, false);

  await expect
    .poll(async () =>
      (await extension.getPromptMetas()).map((prompt) => ({
        id: prompt.id,
        pinned: prompt.pinned,
        normalOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      { id: 'normal-first', pinned: false, normalOrder: 1 },
      { id: 'pinned-middle', pinned: false, normalOrder: 2 },
      { id: 'normal-last', pinned: false, normalOrder: 3 },
    ]);

  await expectVisiblePromptOrder(page, [
    '일반 첫 번째',
    '고정된 중간',
    '일반 마지막',
  ]);
});

test('toggles pinned state from the prompt list pin button instead of the editor form', async ({
  extension,
}) => {
  const firstPrompt = createPromptRecord({
    id: 'list-pin-first',
    title: '목록 첫 번째',
    content: '목록 첫 번째 본문',
    normalOrder: 1,
  });
  const secondPrompt = createPromptRecord({
    id: 'list-pin-second',
    title: '목록 두 번째',
    content: '목록 두 번째 본문',
    normalOrder: 2,
  });

  await extension.setPromptRecords([firstPrompt, secondPrompt]);

  const page = await openOptionsPage(extension);

  await expectPinnedEditorCheckboxRemoved(page);
  await getPromptCard(page, secondPrompt.title).click();
  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expectPinnedEditorCheckboxRemoved(page);

  await getPromptPinToggle(page, secondPrompt.title).click();

  await expect(getOptionsToast(page)).toContainText('프롬프트를 고정했습니다.');
  await expectVisiblePromptOrder(page, [secondPrompt.title, firstPrompt.title]);
  await expect(
    getPromptList(page).getByRole('button', {
      name: `${secondPrompt.title} 고정 해제`,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => {
      const prompt = (await extension.getPromptRecords()).find(
        (record) => record.id === secondPrompt.id,
      );

      return prompt
        ? {
            pinned: prompt.pinned,
            pinnedOrder: prompt.pinnedOrder,
          }
        : null;
    })
    .toEqual({
      pinned: true,
      pinnedOrder: expect.any(Number),
    });

  await getPromptPinToggle(page, secondPrompt.title).click();

  await expect(getOptionsToast(page)).toContainText('프롬프트 고정을 해제했습니다.');
  await expectVisiblePromptOrder(page, [firstPrompt.title, secondPrompt.title]);
  await expect(
    getPromptList(page).getByRole('button', {
      name: `${secondPrompt.title} 고정`,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(async () => {
      const prompt = (await extension.getPromptRecords()).find(
        (record) => record.id === secondPrompt.id,
      );

      return prompt
        ? {
            pinned: prompt.pinned,
            pinnedOrder: prompt.pinnedOrder,
          }
        : null;
    })
    .toEqual({
      pinned: false,
      pinnedOrder: null,
    });
});

test('reorders normal prompts within the normal group using drag-handle keyboard controls', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'normal-first',
      title: '일반 첫 번째',
      content: '일반 첫 번째 본문',
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'normal-second',
      title: '일반 두 번째',
      content: '일반 두 번째 본문',
      normalOrder: 2,
    }),
    createPromptRecord({
      id: 'normal-third',
      title: '일반 세 번째',
      content: '일반 세 번째 본문',
      normalOrder: 3,
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expectVisiblePromptOrder(page, [
    '일반 첫 번째',
    '일반 두 번째',
    '일반 세 번째',
  ]);

  await pressPromptHandleKey(page, '일반 세 번째', 'ArrowUp');

  await expectVisiblePromptOrder(page, [
    '일반 첫 번째',
    '일반 세 번째',
    '일반 두 번째',
  ]);
  await expectStoredPromptMetaOrder(extension, [
    'normal-first',
    'normal-third',
    'normal-second',
  ]);
  await expectPromptListToHideInternalOrderFields(page);
});

test('reorders normal prompts using pointer drag after and before placements', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'pointer-first',
      title: '포인터 첫 번째',
      content: '포인터 첫 번째 본문',
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'pointer-second',
      title: '포인터 두 번째',
      content: '포인터 두 번째 본문',
      normalOrder: 2,
    }),
    createPromptRecord({
      id: 'pointer-third',
      title: '포인터 세 번째',
      content: '포인터 세 번째 본문',
      normalOrder: 3,
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expectVisiblePromptOrder(page, [
    '포인터 첫 번째',
    '포인터 두 번째',
    '포인터 세 번째',
  ]);

  await dragPromptHandleToPrompt(
    page,
    '포인터 세 번째',
    '포인터 첫 번째',
    'after',
  );

  await expectVisiblePromptOrder(page, [
    '포인터 첫 번째',
    '포인터 세 번째',
    '포인터 두 번째',
  ]);
  await expectStoredPromptMetaOrder(extension, [
    'pointer-first',
    'pointer-third',
    'pointer-second',
  ]);
  await expect(getOptionsToast(page)).toContainText(
    '포인터 세 번째 순서를 변경했습니다.',
  );

  await dragPromptHandleToPrompt(
    page,
    '포인터 세 번째',
    '포인터 첫 번째',
    'before',
  );

  await expectVisiblePromptOrder(page, [
    '포인터 세 번째',
    '포인터 첫 번째',
    '포인터 두 번째',
  ]);
  await expectStoredPromptMetaOrder(extension, [
    'pointer-third',
    'pointer-first',
    'pointer-second',
  ]);
  await expectPromptListToHideInternalOrderFields(page);
});

test('centers the drag-handle dot icon inside its button', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'centered-handle',
      title: '핸들 중앙',
      content: '핸들 중앙 본문',
      normalOrder: 1,
    }),
  ]);

  const page = await openOptionsPage(extension);
  const handle = getPromptDragHandle(page, '핸들 중앙');

  await expect(handle).toBeVisible();
  await expect(handle.locator('svg circle')).toHaveCount(6);

  const alignment = await handle.evaluate((button) => {
    const icon = button.querySelector('svg');

    if (!icon) {
      throw new Error('Drag handle icon not found.');
    }

    const buttonRect = button.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();

    return {
      horizontalOffset: Math.abs(
        buttonRect.left + buttonRect.width / 2 - (iconRect.left + iconRect.width / 2),
      ),
      verticalOffset: Math.abs(
        buttonRect.top + buttonRect.height / 2 - (iconRect.top + iconRect.height / 2),
      ),
    };
  });

  expect(alignment.horizontalOffset).toBeLessThan(1);
  expect(alignment.verticalOffset).toBeLessThan(1);
});

test('reorders pinned prompts within the pinned group using drag-handle keyboard controls', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'normal-only',
      title: '일반 프롬프트',
      content: '일반 프롬프트 본문',
      normalOrder: 10,
    }),
    createPromptRecord({
      id: 'pinned-first',
      title: '고정 첫 번째',
      content: '고정 첫 번째 본문',
      pinned: true,
      pinnedOrder: 1,
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'pinned-second',
      title: '고정 두 번째',
      content: '고정 두 번째 본문',
      pinned: true,
      pinnedOrder: 2,
      normalOrder: 2,
    }),
    createPromptRecord({
      id: 'pinned-third',
      title: '고정 세 번째',
      content: '고정 세 번째 본문',
      pinned: true,
      pinnedOrder: 3,
      normalOrder: 3,
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expectVisiblePromptOrder(page, [
    '고정 첫 번째',
    '고정 두 번째',
    '고정 세 번째',
    '일반 프롬프트',
  ]);

  await pressPromptHandleKey(page, '고정 두 번째', 'ArrowUp');

  await expectVisiblePromptOrder(page, [
    '고정 두 번째',
    '고정 첫 번째',
    '고정 세 번째',
    '일반 프롬프트',
  ]);
  await expectStoredPromptMetaOrder(extension, [
    'pinned-second',
    'pinned-first',
    'pinned-third',
    'normal-only',
  ]);
  await expectPromptListToHideInternalOrderFields(page);
});

test('keeps storage unchanged when drag-handle keyboard movement would cross groups', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'pinned-boundary',
      title: '고정 경계',
      content: '고정 경계 본문',
      pinned: true,
      pinnedOrder: 1,
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'normal-boundary',
      title: '일반 경계',
      content: '일반 경계 본문',
      normalOrder: 2,
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expectVisiblePromptOrder(page, ['고정 경계', '일반 경계']);
  await expectStoredPromptMetaOrder(extension, [
    'pinned-boundary',
    'normal-boundary',
  ]);

  await pressPromptHandleKey(page, '일반 경계', 'ArrowUp');

  await expectVisiblePromptOrder(page, ['고정 경계', '일반 경계']);
  await expectStoredPromptMetaOrder(extension, [
    'pinned-boundary',
    'normal-boundary',
  ]);
  await expect(getOptionsToast(page)).toContainText(
    '일반 경계은 이미 일반 목록의 첫 번째입니다.',
  );
  await expectPromptListToHideInternalOrderFields(page);
});

test('keeps storage unchanged when pointer drag lands in the same position', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'pointer-noop-first',
      title: '포인터 제자리 첫 번째',
      content: '포인터 제자리 첫 번째 본문',
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'pointer-noop-second',
      title: '포인터 제자리 두 번째',
      content: '포인터 제자리 두 번째 본문',
      normalOrder: 2,
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expectVisiblePromptOrder(page, [
    '포인터 제자리 첫 번째',
    '포인터 제자리 두 번째',
  ]);
  await expectStoredPromptMetaOrder(extension, [
    'pointer-noop-first',
    'pointer-noop-second',
  ]);

  await dragPromptHandleToPrompt(
    page,
    '포인터 제자리 첫 번째',
    '포인터 제자리 두 번째',
    'before',
  );

  await expectVisiblePromptOrder(page, [
    '포인터 제자리 첫 번째',
    '포인터 제자리 두 번째',
  ]);
  await expectStoredPromptMetaOrder(extension, [
    'pointer-noop-first',
    'pointer-noop-second',
  ]);
  await expect(getOptionsToast(page)).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(
    '포인터 제자리 첫 번째 순서를 변경했습니다.',
  );
  await expectPromptListToHideInternalOrderFields(page);
});

test('keeps storage unchanged when pointer drag would cross prompt groups', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'pointer-cross-pinned',
      title: '포인터 교차 고정',
      content: '포인터 교차 고정 본문',
      pinned: true,
      pinnedOrder: 1,
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'pointer-cross-normal',
      title: '포인터 교차 일반',
      content: '포인터 교차 일반 본문',
      normalOrder: 2,
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expectVisiblePromptOrder(page, [
    '포인터 교차 고정',
    '포인터 교차 일반',
  ]);
  await expectStoredPromptMetaOrder(extension, [
    'pointer-cross-pinned',
    'pointer-cross-normal',
  ]);

  await dragPromptHandleToPrompt(
    page,
    '포인터 교차 일반',
    '포인터 교차 고정',
    'before',
  );

  await expectVisiblePromptOrder(page, [
    '포인터 교차 고정',
    '포인터 교차 일반',
  ]);
  await expectStoredPromptMetaOrder(extension, [
    'pointer-cross-pinned',
    'pointer-cross-normal',
  ]);
  await expect(getOptionsToast(page)).toContainText(
    PROMPT_GROUP_CROSS_REORDER_MESSAGE,
  );
  await expect(getOptionsToast(page).getByRole('status')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  await expectPromptListToHideInternalOrderFields(page);
});

test('does not announce reorder success or mutate storage when move prompt conflicts', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'move-conflict-first',
      title: '충돌 첫 번째',
      content: '충돌 첫 번째 본문',
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'move-conflict-second',
      title: '충돌 두 번째',
      content: '충돌 두 번째 본문',
      normalOrder: 2,
    }),
    createPromptRecord({
      id: 'move-conflict-third',
      title: '충돌 세 번째',
      content: '충돌 세 번째 본문',
      normalOrder: 3,
    }),
  ]);

  const page = await openOptionsPage(extension);
  const beforeRecords = await extension.getPromptRecords();
  const conflictMeta =
    (await extension.getPromptMetas()).find(
      (prompt) => prompt.id === 'move-conflict-second',
    ) ?? null;

  if (!conflictMeta) {
    throw new Error('Move conflict fixture prompt was not persisted.');
  }

  await expectVisiblePromptOrder(page, [
    '충돌 첫 번째',
    '충돌 두 번째',
    '충돌 세 번째',
  ]);
  await patchRuntimeMessageResponse(page, [MOVE_PROMPT_MESSAGE], {
    type: MOVE_PROMPT_MESSAGE,
    ok: false,
    status: 'conflict',
    id: conflictMeta.id,
    message: 'mock move conflict',
    currentMeta: conflictMeta,
  });

  await pressPromptHandleKey(page, '충돌 두 번째', 'ArrowUp');

  await expect(
    page.getByRole('alert').filter({
      hasText: '다른 창의 변경이 먼저 저장되었습니다.',
    }),
  ).toBeVisible();
  await expect(
    page.locator('body'),
  ).not.toContainText('충돌 두 번째 순서를 변경했습니다.');
  await expect(getOptionsToast(page)).toHaveCount(0);
  await expectVisiblePromptOrder(page, [
    '충돌 첫 번째',
    '충돌 두 번째',
    '충돌 세 번째',
  ]);
  expect(await extension.getPromptRecords()).toEqual(beforeRecords);
});

test('shows a generic reorder error in the options toast when move prompt rejects', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'move-error-first',
      title: '오류 첫 번째',
      content: '오류 첫 번째 본문',
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'move-error-second',
      title: '오류 두 번째',
      content: '오류 두 번째 본문',
      normalOrder: 2,
    }),
  ]);

  const page = await openOptionsPage(extension);
  const beforeRecords = await extension.getPromptRecords();

  await page.evaluate((moveMessage) => {
    const runtime = chrome.runtime as typeof chrome.runtime & {
      sendMessage: (...args: unknown[]) => Promise<unknown>;
    };
    const originalSendMessage = runtime.sendMessage.bind(runtime);

    runtime.sendMessage = async (...args: unknown[]) => {
      const [request] = args;

      if (
        typeof request === 'object' &&
        request !== null &&
        (request as { type?: unknown }).type === moveMessage
      ) {
        throw 'mock move transport failure';
      }

      return await originalSendMessage(...args);
    };
  }, MOVE_PROMPT_MESSAGE);

  await pressPromptHandleKey(page, '오류 두 번째', 'ArrowUp');

  await expect(getOptionsToast(page)).toContainText(
    '프롬프트 순서 변경 중 오류가 발생했습니다.',
  );
  await expect(getOptionsToast(page).getByRole('alert')).toHaveAttribute(
    'aria-live',
    'assertive',
  );
  await expect(
    getPromptEditor(page)
      .getByRole('alert')
      .filter({ hasText: '프롬프트 순서 변경 중 오류가 발생했습니다.' }),
  ).toHaveCount(0);
  await expectVisiblePromptOrder(page, ['오류 첫 번째', '오류 두 번째']);
  expect(await extension.getPromptRecords()).toEqual(beforeRecords);
});

test('shows the approved reorder fallback when the prompt list move handler rejects', async ({
  extension,
}) => {
  const firstPrompt = createPromptRecord({
    id: 'move-handler-error-first',
    title: '핸들러 오류 첫 번째',
    content: '핸들러 오류 첫 번째 본문',
    normalOrder: 1,
    createdAt: '2026-03-29T04:00:00.000Z',
  });
  const secondPrompt = createPromptRecord({
    id: 'move-handler-error-second',
    title: '핸들러 오류 두 번째',
    content: '핸들러 오류 두 번째 본문',
    normalOrder: 1,
    createdAt: '2026-03-29T04:01:00.000Z',
  });

  await extension.setPromptRecords([firstPrompt, secondPrompt]);

  const page = await openOptionsPage(extension);
  const beforeRecords = await extension.getPromptRecords();

  await page.evaluate(() => {
    const originalLocaleCompare = String.prototype.localeCompare;

    (window as Window & {
      __promptitRestoreLocaleCompare?: () => void;
    }).__promptitRestoreLocaleCompare = () => {
      String.prototype.localeCompare = originalLocaleCompare;
    };

    String.prototype.localeCompare = function (
      compareString: string,
      locales?: string | string[],
      options?: Intl.CollatorOptions,
    ): number {
      const leftValue = String(this);
      const rightValue = String(compareString);
      const isPromptMovePlanTimestampCompare =
        (leftValue === '2026-03-29T04:00:00.000Z' &&
          rightValue === '2026-03-29T04:01:00.000Z') ||
        (leftValue === '2026-03-29T04:01:00.000Z' &&
          rightValue === '2026-03-29T04:00:00.000Z');

      if (isPromptMovePlanTimestampCompare) {
        throw new Error('mock prompt list move handler failure');
      }

      return originalLocaleCompare.call(this, compareString, locales, options);
    };
  });

  try {
    await pressPromptHandleKey(page, secondPrompt.title, 'ArrowUp');

    await expect(getOptionsToast(page)).toContainText(
      '프롬프트 순서 변경 중 오류가 발생했습니다.',
    );
    await expect(getOptionsToast(page).getByRole('alert')).toHaveAttribute(
      'aria-live',
      'assertive',
    );
    await expect(
      getPromptEditor(page)
        .getByRole('alert')
        .filter({ hasText: '프롬프트 순서 변경 중 오류가 발생했습니다.' }),
    ).toHaveCount(0);
    await expectVisiblePromptOrder(page, [
      firstPrompt.title,
      secondPrompt.title,
    ]);
    expect(await extension.getPromptRecords()).toEqual(beforeRecords);
  } finally {
    await page.evaluate(() => {
      (window as Window & {
        __promptitRestoreLocaleCompare?: () => void;
      }).__promptitRestoreLocaleCompare?.();
    });
  }
});

test('rejects stale reorder boundary requests without moving to an edge', async ({
  extension,
}) => {
  const firstPrompt = createPromptRecord({
    id: 'stale-boundary-first',
    title: '경계 첫 번째',
    content: '경계 첫 번째 본문',
    normalOrder: 1,
  });
  const nextPrompt = createPromptRecord({
    id: 'stale-boundary-next',
    title: '경계 다음',
    content: '경계 다음 본문',
    normalOrder: 2,
  });
  const movingPrompt = createPromptRecord({
    id: 'stale-boundary-moving',
    title: '경계 이동 대상',
    content: '경계 이동 대상 본문',
    normalOrder: 3,
  });

  await extension.setPromptRecords([
    firstPrompt,
    nextPrompt,
    movingPrompt,
  ]);

  const beforeRecords = await extension.getPromptRecords();
  const response = await extension.sendRuntimeMessage({
    type: MOVE_PROMPT_MESSAGE,
    id: movingPrompt.id,
    group: 'normal',
    previousId: 'stale-deleted-boundary',
    nextId: nextPrompt.id,
    expectedUpdatedAt: movingPrompt.updatedAt,
  });

  expect(response).toEqual(
    expect.objectContaining({
      type: MOVE_PROMPT_MESSAGE,
      ok: false,
      status: 'conflict',
      id: movingPrompt.id,
    }),
  );
  expect(await extension.getPromptRecords()).toEqual(beforeRecords);
});

test('preserves draft input while the initial prompt load resolves', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'loaded-prompt',
      title: '불러온 프롬프트',
      content: '로드가 끝난 뒤 목록에 나타나야 한다.',
      normalOrder: 7,
    }),
  ]);

  const page = await openOptionsPage(extension, async (nextPage) => {
    await deferInitialPromptLoad(nextPage);
  });

  await expect(
    page
      .getByRole('article')
      .filter({ hasText: '저장된 프롬프트를 불러오는 중입니다.' }),
  ).toBeVisible();

  await getTitleInput(page).fill('로딩 중 입력한 제목');
  await getContentInput(page).fill('로딩 중 입력한 본문');

  await page.evaluate(() => (window as any).__releasePromptitInitialLoad?.());

  await expect(getPromptCard(page, '불러온 프롬프트')).toBeVisible();
  await expect(page.getByRole('heading', { name: '프롬프트 추가' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue('로딩 중 입력한 제목');
  await expect(getContentInput(page)).toHaveValue('로딩 중 입력한 본문');
});

test('keeps dirty create draft when starting create mode is dismissed', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);

  await expect(page.getByRole('heading', { name: '프롬프트 추가' })).toBeVisible();
  await getTitleInput(page).fill('저장 전 생성 제목');
  await getContentInput(page).fill('저장 전 생성 본문');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
    );
    await dialog.dismiss();
  });
  await getPromptListCreateButton(page).click();

  await expect(page.getByRole('heading', { name: '프롬프트 추가' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue('저장 전 생성 제목');
  await expect(getContentInput(page)).toHaveValue('저장 전 생성 본문');
});

test('keeps dirty edit draft when selecting another prompt is dismissed', async ({
  extension,
}) => {
  const firstPrompt = createPromptRecord({
    id: 'dirty-select-first',
    title: '첫 번째 선택 대상',
    content: '첫 번째 원래 본문',
    normalOrder: 1,
  });
  const secondPrompt = createPromptRecord({
    id: 'dirty-select-second',
    title: '두 번째 선택 대상',
    content: '두 번째 원래 본문',
    normalOrder: 2,
  });

  await extension.setPromptRecords([firstPrompt, secondPrompt]);

  const page = await openOptionsPage(extension);

  await getPromptCard(page, firstPrompt.title).click();
  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue(firstPrompt.title);
  await expect(getContentInput(page)).toHaveValue(firstPrompt.content);

  await getTitleInput(page).fill('저장 전 수정 제목');
  await getContentInput(page).fill('저장 전 수정 본문');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
    );
    await dialog.dismiss();
  });
  await getPromptCard(page, secondPrompt.title).click();

  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue('저장 전 수정 제목');
  await expect(getContentInput(page)).toHaveValue('저장 전 수정 본문');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
    );
    await dialog.accept();
  });
  await getPromptCard(page, secondPrompt.title).click();

  await expect(getTitleInput(page)).toHaveValue(secondPrompt.title);
  await expect(getContentInput(page)).toHaveValue(secondPrompt.content);
});

test('loads selected prompts through one prompt record runtime request', async ({
  extension,
}) => {
  const firstPrompt = createPromptRecord({
    id: 'record-load-first',
    title: '레코드 로드 첫 번째',
    content: '첫 번째 원자 로드 본문',
    normalOrder: 1,
  });
  const secondPrompt = createPromptRecord({
    id: 'record-load-second',
    title: '레코드 로드 두 번째',
    content: '두 번째 원자 로드 본문',
    normalOrder: 2,
  });

  await extension.setPromptRecords([firstPrompt, secondPrompt]);

  const page = await openOptionsPage(extension);

  await page.evaluate(() => {
    const runtime = chrome.runtime as typeof chrome.runtime & {
      sendMessage: (...args: unknown[]) => Promise<unknown>;
    };
    const originalSendMessage = runtime.sendMessage.bind(runtime);
    const requestTypes: string[] = [];

    (window as Window & {
      __promptitSelectionRequestTypes?: string[];
    }).__promptitSelectionRequestTypes = requestTypes;

    runtime.sendMessage = async (...args: unknown[]) => {
      const [request] = args;

      if (typeof request === 'object' && request !== null) {
        requestTypes.push(String((request as { type?: unknown }).type));
      }

      return await originalSendMessage(...args);
    };
  });

  await getPromptCard(page, secondPrompt.title).click();

  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue(secondPrompt.title);
  await expect(getContentInput(page)).toHaveValue(secondPrompt.content);

  const requestTypes = await page.evaluate(() =>
    (window as Window & {
      __promptitSelectionRequestTypes?: string[];
    }).__promptitSelectionRequestTypes ?? [],
  );

  expect(requestTypes).toContain(GET_PROMPT_RECORD_MESSAGE);
  expect(requestTypes).not.toContain(LIST_PROMPT_METAS_MESSAGE);
  expect(requestTypes).not.toContain(GET_PROMPT_BODY_MESSAGE);
});

test('keeps dirty edit draft when edit cancel is dismissed', async ({
  extension,
}) => {
  const prompt = createPromptRecord({
    id: 'dirty-cancel-prompt',
    title: '취소 확인 대상',
    content: '취소 확인 원래 본문',
    normalOrder: 1,
  });

  await extension.setPromptRecords([prompt]);

  const page = await openOptionsPage(extension);

  await getPromptCard(page, prompt.title).click();
  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue(prompt.title);
  await expect(getContentInput(page)).toHaveValue(prompt.content);

  await getTitleInput(page).fill('취소 전 수정 제목');
  await getContentInput(page).fill('취소 전 수정 본문');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
    );
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: '편집 취소', exact: true }).click();

  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue('취소 전 수정 제목');
  await expect(getContentInput(page)).toHaveValue('취소 전 수정 본문');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
    );
    await dialog.accept();
  });
  await page.getByRole('button', { name: '편집 취소', exact: true }).click();

  await expect(page.getByRole('heading', { name: '프롬프트 추가' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue('');
  await expect(getContentInput(page)).toHaveValue('');
});

test('preserves dirty create draft when selected prompt record load fails', async ({
  extension,
}) => {
  const targetPrompt = createPromptRecord({
    id: 'dirty-create-body-load-failure',
    title: '본문 로드 실패 대상',
    content: '이 본문은 실패 응답 때문에 편집기에 들어오면 안 된다.',
    normalOrder: 1,
  });

  await extension.setPromptRecords([targetPrompt]);

  const page = await openOptionsPage(extension);
  await getTitleInput(page).fill('작성 중인 제목');
  await getContentInput(page).fill('작성 중인 본문');
  await patchRuntimeMessageFailure(
    page,
    [GET_PROMPT_RECORD_MESSAGE],
    'mock selected body load failure',
  );

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
    );
    await dialog.accept();
  });
  await getPromptCard(page, targetPrompt.title).click();

  await expectBodyLoadErrorStatusOnly(page);
  await expect(page.getByRole('heading', { name: '프롬프트 추가' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue('작성 중인 제목');
  await expect(getContentInput(page)).toHaveValue('작성 중인 본문');
  expect(await extension.getPromptRecords()).toEqual([targetPrompt]);
});

test('uses prompt-specific accessible names for list delete buttons', async ({
  extension,
}) => {
  const firstPrompt = createPromptRecord({
    id: 'list-delete-accessible-name',
    title: '목록 삭제 접근성 첫 번째',
    content: '첫 번째 목록 삭제 버튼 이름을 검증한다.',
    normalOrder: 1,
  });
  const secondPrompt = createPromptRecord({
    id: 'list-delete-accessible-name-second',
    title: '목록 삭제 접근성 두 번째',
    content: '두 번째 목록 삭제 버튼 이름을 검증한다.',
    normalOrder: 2,
  });

  await extension.setPromptRecords([firstPrompt, secondPrompt]);

  const page = await openOptionsPage(extension);

  await expect(
    getPromptList(page).getByRole('button', {
      name: `${firstPrompt.title} 삭제`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    getPromptList(page).getByRole('button', {
      name: `${secondPrompt.title} 삭제`,
      exact: true,
    }),
  ).toBeVisible();
});

test('selects prompt cards by keyboard with specific edit names', async ({
  extension,
}) => {
  const firstPrompt = createPromptRecord({
    id: 'keyboard-card-first',
    title: '키보드 카드 첫 번째',
    content: '첫 번째 카드 본문',
    normalOrder: 1,
  });
  const secondPrompt = createPromptRecord({
    id: 'keyboard-card-second',
    title: '키보드 카드 두 번째',
    content: '두 번째 카드 본문',
    normalOrder: 2,
  });

  await extension.setPromptRecords([firstPrompt, secondPrompt]);

  const page = await openOptionsPage(extension);
  const firstCard = getPromptList(page).getByRole('button', {
    name: `${firstPrompt.title} 편집`,
    exact: true,
  });
  const secondCard = getPromptList(page).getByRole('button', {
    name: `${secondPrompt.title} 편집`,
    exact: true,
  });

  await expect(firstCard).toBeVisible();
  await expect(secondCard).toBeVisible();
  await expect(firstCard).not.toHaveAttribute('aria-pressed', /.*/);
  await expect(secondCard).not.toHaveAttribute('aria-pressed', /.*/);

  await secondCard.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue(secondPrompt.title);
  await expect(secondCard).toHaveAttribute('aria-current', 'true');

  await firstCard.focus();
  await page.keyboard.press('Space');

  await expect(getTitleInput(page)).toHaveValue(firstPrompt.title);
  await expect(firstCard).toHaveAttribute('aria-current', 'true');
});

test('blocks save when dirty edit discard is followed by selected record load failure', async ({
  extension,
}) => {
  const firstPrompt = createPromptRecord({
    id: 'dirty-edit-failed-select-first',
    title: '기존 편집 대상',
    content: '기존 편집 본문',
    normalOrder: 1,
  });
  const secondPrompt = createPromptRecord({
    id: 'dirty-edit-failed-select-second',
    title: '실패 선택 대상',
    content: '선택 실패 대상 본문',
    normalOrder: 2,
  });

  await extension.setPromptRecords([firstPrompt, secondPrompt]);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, firstPrompt.title).click();
  await expect(getTitleInput(page)).toHaveValue(firstPrompt.title);
  await expect(getContentInput(page)).toHaveValue(firstPrompt.content);

  await getTitleInput(page).fill('버리기로 승인한 수정 제목');
  await getContentInput(page).fill('버리기로 승인한 수정 본문');
  await patchRuntimeMessageFailure(
    page,
    [GET_PROMPT_RECORD_MESSAGE],
    'mock selected body load failure',
  );

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
    );
    await dialog.accept();
  });
  await getPromptCard(page, secondPrompt.title).click();

  await expectBodyLoadErrorStatusOnly(page);
  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue(secondPrompt.title);
  await expect(getContentInput(page)).toHaveValue('');
  await expect(
    getPromptSubmitButton(page, '프롬프트 수정'),
  ).toBeDisabled();
  await expect(
    page.locator('form').getByRole('button', {
      name: '프롬프트 삭제',
      exact: true,
    }),
  ).toBeEnabled();

  await page.locator('form').evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });

  await expectBodyLoadErrorStatusOnly(page);
  expect(await extension.getPromptRecords()).toEqual([firstPrompt, secondPrompt]);
});

test('disables save when selected prompt record did not load', async ({
  extension,
}) => {
  const targetPrompt = createPromptRecord({
    id: 'disabled-save-body-load-failure',
    title: '저장 차단 대상',
    content: '본문 로드 실패 뒤 빈 본문으로 저장되면 안 된다.',
    normalOrder: 1,
  });

  await extension.setPromptRecords([targetPrompt]);

  const page = await openOptionsPage(extension);
  await patchRuntimeMessageFailure(
    page,
    [GET_PROMPT_RECORD_MESSAGE],
    'mock selected body load failure',
  );

  await getPromptCard(page, targetPrompt.title).click();

  await expectBodyLoadErrorStatusOnly(page);
  await expect(
    getPromptSubmitButton(page, '프롬프트 수정'),
  ).toBeDisabled();
  await page.locator('form').evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  await expectBodyLoadErrorStatusOnly(page);
  expect(await extension.getPromptRecords()).toEqual([targetPrompt]);
});

test('shows validation errors instead of saving invalid prompts', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);

  await getTitleInput(page).fill('   ');
  await getContentInput(page).fill('   ');
  await getPromptSubmitButton(page, '프롬프트 추가').click();

  await expect(
    page.getByText('제목은 1자 이상 40자 이하로 입력해주세요.'),
  ).toBeVisible();
  await expect(
    page.getByText('본문은 비워둘 수 없습니다.'),
  ).toBeVisible();

  await expect.poll(async () => await extension.getPromptRecords()).toEqual([]);
});

test('cancels and confirms prompt deletion from edit mode', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'prompt-delete-target',
      title: '삭제 테스트',
      content: '삭제 흐름을 검증한다.',
      normalOrder: 2,
    }),
  ]);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, '삭제 테스트').click();

  page.once('dialog', async (dialog) => {
    await dialog.dismiss();
  });
  await page
    .locator('form')
    .getByRole('button', { name: '프롬프트 삭제', exact: true })
    .click();

  await expect
    .poll(async () => (await extension.getPromptRecords()).map((prompt) => prompt.id))
    .toEqual(['prompt-delete-target']);

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page
    .locator('form')
    .getByRole('button', { name: '프롬프트 삭제', exact: true })
    .click();

  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '편집 중인 프롬프트가 삭제되어 프롬프트 추가 모드로 전환했습니다.' }),
  ).toBeVisible();
  await expect(getOptionsToast(page)).toHaveCount(0);
  await expect(
    page.getByText(
      '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 프롬프트를 추가하세요.',
    ),
  ).toBeVisible();
  await expect
    .poll(async () => await extension.getPromptRecords())
    .toEqual([]);
});

test('shows delete success in the options toast when deleting from the list', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'prompt-list-delete-target',
      title: '목록 삭제 테스트',
      content: '목록 삭제 흐름을 검증한다.',
      normalOrder: 2,
    }),
  ]);

  const page = await openOptionsPage(extension);

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await getPromptList(page)
    .getByRole('button', { name: '목록 삭제 테스트 삭제', exact: true })
    .click();

  await expect(getOptionsToast(page)).toContainText('프롬프트를 삭제했습니다.');
  await expect(
    getPromptEditor(page).getByText('프롬프트를 삭제했습니다.'),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await extension.getPromptRecords()).map((prompt) => prompt.id))
    .toEqual([]);
});

test('returns to create mode when the editing prompt is deleted elsewhere', async ({
  extension,
}) => {
  const prompts = [
    createPromptRecord({
      id: 'prompt-editing',
      title: '편집 중',
      content: '현재 편집 중인 프롬프트',
      normalOrder: 1,
    }),
    createPromptRecord({
      id: 'prompt-remaining',
      title: '남아있는 프롬프트',
      content: '삭제되지 않는 프롬프트',
      normalOrder: 5,
    }),
  ];

  await extension.setPromptRecords(prompts);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, '편집 중').click();
  await expect(
    page.getByRole('heading', { name: '프롬프트 수정' }),
  ).toBeVisible();

  await extension.setPromptRecords([prompts[1]]);

  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '편집 중인 프롬프트가 삭제되어 프롬프트 추가 모드로 전환했습니다.' }),
  ).toBeVisible();
  await expect(getOptionsToast(page)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '프롬프트 추가' }),
  ).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue('');
  await expect(getContentInput(page)).toHaveValue('');
});

test('surfaces a stale delete conflict when a second tab deletes an edited prompt', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'shared-delete-prompt',
    title: '삭제 충돌 대상',
    content: '두 번째 탭이 오래된 상태로 삭제를 시도한다.',
    normalOrder: 2,
  });

  await extension.setPromptRecords([initialPrompt]);

  const primaryPage = await openOptionsPage(extension);
  const stalePage = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.addInitScript(() => {
      const storageEventArea = chrome.storage.onChanged as typeof chrome.storage.onChanged & {
        addListener: typeof chrome.storage.onChanged.addListener;
      };

      storageEventArea.addListener = () => {};
    });
  });

  await getPromptCard(primaryPage, '삭제 충돌 대상').click();
  await getPromptCard(stalePage, '삭제 충돌 대상').click();

  await getTitleInput(primaryPage).fill('최신 삭제 충돌 제목');
  await primaryPage.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(primaryPage.getByTestId('options-toast')).toContainText(
    '프롬프트를 업데이트했습니다.',
  );

  stalePage.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await stalePage
    .locator('form')
    .getByRole('button', { name: '프롬프트 삭제', exact: true })
    .click();

  await expect(
    stalePage.getByRole('alert').filter({
      hasText: '다른 창의 변경이 먼저 저장되었습니다.',
    }),
  ).toBeVisible();
  await expect(
    stalePage.getByRole('status').filter({ hasText: '충돌 감지됨' }),
  ).toBeVisible();
  await expect(stalePage.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expect(
    stalePage.locator('form').getByRole('textbox', { name: /제목/ }),
  ).toHaveValue('최신 삭제 충돌 제목');

  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        normalOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      {
        id: 'shared-delete-prompt',
        title: '최신 삭제 충돌 제목',
        content: '두 번째 탭이 오래된 상태로 삭제를 시도한다.',
        normalOrder: 2,
      },
    ]);
});

test('keeps the active editor content when non-active delete conflict body load fails', async ({
  extension,
}) => {
  const activePrompt = createPromptRecord({
    id: 'delete-conflict-active',
    title: '활성 삭제 충돌 아님',
    content: '활성 편집기 본문은 유지되어야 한다.',
    normalOrder: 1,
  });
  const deleteTarget = createPromptRecord({
    id: 'delete-conflict-target',
    title: '목록 삭제 충돌 대상',
    content: '이 본문은 로드 실패로 편집기에 들어오면 안 된다.',
    normalOrder: 2,
  });
  const { content: _content, ...deleteTargetMeta } = deleteTarget;

  await extension.setPromptRecords([activePrompt, deleteTarget]);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, activePrompt.title).click();
  await expect(getTitleInput(page)).toHaveValue(activePrompt.title);
  await expect(getContentInput(page)).toHaveValue(activePrompt.content);

  await page.evaluate((config) => {
    const runtime = chrome.runtime as typeof chrome.runtime & {
      sendMessage: (...args: unknown[]) => Promise<unknown>;
    };
    const originalSendMessage = runtime.sendMessage.bind(runtime);

    runtime.sendMessage = async (...args: unknown[]) => {
      const [request] = args;

      if (typeof request === 'object' && request !== null) {
        const type = String((request as { type?: unknown }).type);
        const id = String((request as { id?: unknown }).id);

        if (type === config.deleteMessage && id === config.deleteTargetId) {
          return config.deleteConflictResponse;
        }

        if (
          (type === config.getRecordMessage || type === config.getBodyMessage) &&
          id === config.deleteTargetId
        ) {
          throw new Error('mock delete conflict record load failure');
        }
      }

      return await originalSendMessage(...args);
    };
  }, {
    deleteConflictResponse: {
      type: DELETE_PROMPT_MESSAGE,
      ok: false,
      status: 'conflict',
      id: deleteTarget.id,
      message: 'mock delete conflict',
      currentMeta: deleteTargetMeta,
    },
    deleteMessage: DELETE_PROMPT_MESSAGE,
    deleteTargetId: deleteTarget.id,
    getBodyMessage: GET_PROMPT_BODY_MESSAGE,
    getRecordMessage: GET_PROMPT_RECORD_MESSAGE,
  });

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await getPromptList(page)
    .getByRole('button', {
      name: `${deleteTarget.title} 삭제`,
      exact: true,
    })
    .click();

  await expect(
    page.getByRole('alert').filter({ hasText: BODY_LOAD_ERROR_MESSAGE }),
  ).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue(activePrompt.title);
  await expect(getContentInput(page)).toHaveValue(activePrompt.content);
  await expect(getPromptCard(page, deleteTarget.title)).toBeVisible();
  expect(await extension.getPromptRecords()).toEqual([
    activePrompt,
    deleteTarget,
  ]);
});

test('preserves prompts and shows a load error when prompt storage reads fail', async ({
  extension,
}) => {
  const existingPrompts = [
    createPromptRecord({
      id: 'stale-prompt',
      title: '남은 프롬프트',
      content: '이 값은 지워지면 안 된다.',
      normalOrder: 4,
    }),
  ];

  await extension.setPromptRecords(existingPrompts);

  const page = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.addInitScript(() => {
      const runtime = chrome.runtime as typeof chrome.runtime & {
        sendMessage: (...args: unknown[]) => Promise<unknown>;
      };
      const originalSendMessage = runtime.sendMessage.bind(runtime);

      runtime.sendMessage = async (...args: unknown[]) => {
        const [message] = args;

        if (
          typeof message === 'object' &&
          message !== null &&
          (message as { type?: unknown }).type === 'promptit/list-prompt-metas'
        ) {
          throw new Error('mock list metas failure');
        }

        return await originalSendMessage(...args);
      };
    });
  });

  await expect(page.getByText(
    '저장된 프롬프트를 읽지 못했습니다. 확장 프로그램을 다시 열어 확인해보세요.',
  )).toBeVisible();
  await expect(
    page.getByText(
      '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 프롬프트를 추가하세요.',
    ),
  ).toHaveCount(0);
  await expect.poll(async () => await extension.getPromptRecords()).toEqual(
    existingPrompts,
  );
});

test('surfaces a conflict when two options tabs save the same prompt stale', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'shared-prompt',
    title: '동시 수정 대상',
    content: '같은 프롬프트를 두 탭에서 편집한다.',
    normalOrder: 2,
  });

  await extension.setPromptRecords([initialPrompt]);

  const primaryPage = await openOptionsPage(extension);
  const stalePage = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.addInitScript(() => {
      const storageEventArea = chrome.storage.onChanged as typeof chrome.storage.onChanged & {
        addListener: typeof chrome.storage.onChanged.addListener;
      };

      storageEventArea.addListener = () => {};
    });
  });

  await getPromptCard(primaryPage, '동시 수정 대상').click();
  await getPromptCard(stalePage, '동시 수정 대상').click();

  await getTitleInput(primaryPage).fill('첫 번째 저장');
  await primaryPage.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(primaryPage.getByTestId('options-toast')).toContainText(
    '프롬프트를 업데이트했습니다.',
  );
  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        normalOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      {
        id: 'shared-prompt',
        title: '첫 번째 저장',
        content: '같은 프롬프트를 두 탭에서 편집한다.',
        normalOrder: 2,
      },
    ]);

  await getTitleInput(stalePage).fill('두 번째 저장');
  await stalePage.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(
    stalePage
      .getByRole('alert')
      .filter({ hasText: '다른 창의 변경이 먼저 저장되었습니다.' }),
  ).toBeVisible();
  await expect(
    getPromptEditor(stalePage).getByRole('status').filter({ hasText: '충돌 감지됨' }),
  ).toBeVisible();
  await expect(getPromptEditor(stalePage).getByText(/^최신 저장본 /)).toBeVisible();
  await expect(getOptionsToast(stalePage)).toHaveCount(0);
  await expect(getTitleInput(stalePage)).toHaveValue('첫 번째 저장');
  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        normalOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      {
        id: 'shared-prompt',
        title: '첫 번째 저장',
        content: '같은 프롬프트를 두 탭에서 편집한다.',
        normalOrder: 2,
      },
    ]);
});

test('uses atomic record save so conflicts cannot partially commit editor changes', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'atomic-save-conflict',
    title: '원자 저장 원본',
    content: '원자 저장 원본 본문',
    normalOrder: 1,
    createdAt: '2026-03-29T05:00:00.000Z',
    updatedAt: '2026-03-29T05:00:00.000Z',
    bodyUpdatedAt: '2026-03-29T05:00:00.000Z',
  });
  const { content: _content, ...initialMeta } = initialPrompt;

  await extension.setPromptRecords([initialPrompt]);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, initialPrompt.title).click();
  await expect(getContentInput(page)).toHaveValue(initialPrompt.content);

  await page.evaluate((config) => {
    const runtime = chrome.runtime as typeof chrome.runtime & {
      sendMessage: (...args: unknown[]) => Promise<unknown>;
    };
    const originalSendMessage = runtime.sendMessage.bind(runtime);
    const requestTypes: string[] = [];

    (window as Window & {
      __promptitSaveRequestTypes?: string[];
    }).__promptitSaveRequestTypes = requestTypes;

    runtime.sendMessage = async (...args: unknown[]) => {
      const [request] = args;

      if (typeof request === 'object' && request !== null) {
        const type = String((request as { type?: unknown }).type);

        requestTypes.push(type);

        if (type === config.updateRecordMessage) {
          return config.updateRecordConflictResponse;
        }

        if (type === config.updateBodyMessage) {
          return config.updateBodyConflictResponse;
        }
      }

      return await originalSendMessage(...args);
    };
  }, {
    updateBodyConflictResponse: {
      type: UPDATE_PROMPT_BODY_MESSAGE,
      ok: false,
      status: 'conflict',
      id: initialPrompt.id,
      message: 'mock body conflict after partial meta save',
      currentMeta: initialMeta,
      currentRecord: initialPrompt,
    },
    updateBodyMessage: UPDATE_PROMPT_BODY_MESSAGE,
    updateRecordConflictResponse: {
      type: UPDATE_PROMPT_RECORD_MESSAGE,
      ok: false,
      status: 'conflict',
      id: initialPrompt.id,
      message: 'mock atomic record conflict',
      currentMeta: initialMeta,
      currentRecord: initialPrompt,
    },
    updateRecordMessage: UPDATE_PROMPT_RECORD_MESSAGE,
  });

  await getTitleInput(page).fill('부분 커밋되면 안 되는 제목');
  await getContentInput(page).fill('부분 커밋되면 안 되는 본문');
  await getPromptSubmitButton(page, '프롬프트 수정').click();

  await expect(
    page.getByRole('alert').filter({
      hasText: '다른 창의 변경이 먼저 저장되었습니다.',
    }),
  ).toBeVisible();

  const requestTypes = await page.evaluate(() =>
    (window as Window & {
      __promptitSaveRequestTypes?: string[];
    }).__promptitSaveRequestTypes ?? [],
  );

  expect(requestTypes).toContain(UPDATE_PROMPT_RECORD_MESSAGE);
  expect(requestTypes).not.toContain(UPDATE_PROMPT_META_MESSAGE);
  expect(requestTypes).not.toContain(UPDATE_PROMPT_BODY_MESSAGE);
  expect(requestTypes).not.toContain(SET_PROMPT_PINNED_MESSAGE);
  expect(await extension.getPromptRecords()).toEqual([initialPrompt]);
});

test('surfaces a conflict when two options tabs save the same body stale', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'shared-body-prompt',
    title: '본문 동시 수정 대상',
    content: '두 탭 모두 이 본문에서 시작한다.',
    normalOrder: 2,
  });

  await extension.setPromptRecords([initialPrompt]);

  const primaryPage = await openOptionsPage(extension);
  const stalePage = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.addInitScript(() => {
      const storageEventArea = chrome.storage.onChanged as typeof chrome.storage.onChanged & {
        addListener: typeof chrome.storage.onChanged.addListener;
      };

      storageEventArea.addListener = () => {};
    });
  });

  await getPromptCard(primaryPage, '본문 동시 수정 대상').click();
  await getPromptCard(stalePage, '본문 동시 수정 대상').click();
  await expect(getContentInput(primaryPage)).toHaveValue(initialPrompt.content);
  await expect(getContentInput(stalePage)).toHaveValue(initialPrompt.content);

  await getContentInput(primaryPage).fill('첫 번째 탭의 최신 본문');
  await primaryPage.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(primaryPage.getByTestId('options-toast')).toContainText(
    '프롬프트를 업데이트했습니다.',
  );

  await getContentInput(stalePage).fill('두 번째 탭의 오래된 본문');
  await stalePage.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(
    stalePage
      .getByRole('alert')
      .filter({ hasText: '다른 창의 변경이 먼저 저장되었습니다.' }),
  ).toBeVisible();
  await expect(getContentInput(stalePage)).toHaveValue('첫 번째 탭의 최신 본문');
  await expect(await extension.getPromptBody(initialPrompt.id)).toEqual({
    id: initialPrompt.id,
    content: '첫 번째 탭의 최신 본문',
    updatedAt: (await getRequiredPromptRecord(extension, initialPrompt.id)).bodyUpdatedAt,
  });
});

test('shows an error when saving fails', async ({ extension }) => {
  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);
  await patchRuntimeMessageFailure(
    page,
    ['promptit/create-prompt'],
    'mock create failure',
  );

  await createPromptFromOptions(page, '저장 실패', '저장 실패를 검증한다.');

  await expect(getOptionsToast(page)).toContainText(
    '프롬프트 저장 중 오류가 발생했습니다.',
  );
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([]);
});

test('shows an error when deleting fails', async ({ extension }) => {
  const prompts = [
    createPromptRecord({
      id: 'delete-failure',
      title: '삭제 실패',
      content: '삭제 실패를 검증한다.',
      normalOrder: 2,
    }),
  ];

  await extension.setPromptRecords(prompts);

  const page = await openOptionsPage(extension);

  await getPromptCard(page, '삭제 실패').click();
  await patchRuntimeMessageFailure(
    page,
    ['promptit/delete-prompt'],
    'mock delete failure',
  );
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page
    .getByRole('button', { name: '프롬프트 삭제', exact: true })
    .click();

  await expect(getOptionsToast(page)).toContainText(
    '프롬프트 삭제 중 오류가 발생했습니다.',
  );
  await expect
    .poll(async () => (await extension.getPromptRecords()).map((prompt) => prompt.id))
    .toEqual(['delete-failure']);
});
