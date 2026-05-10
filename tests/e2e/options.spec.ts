import {
  expect,
  test as base,
  type Locator,
  type Page,
} from '@playwright/test';

import {
  launchExtension,
  type LoadedExtension,
} from '../playwright/extension';
import {
  createLegacyPromptItem,
  createPromptRecord,
} from '../playwright/promptit';
import {
  LEGACY_PROMPTS_STORAGE_KEY,
  PROMPT_BODY_MAX_BYTES,
  STARTER_PROMPT_ID,
  type PromptRecord,
} from '../../src/prompt/schema';
import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
} from '../../src/runtime/messages';

const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await use(extension);
    await extension.close();
  },
});

const PROMPT_IDB_MIGRATION_STORAGE_KEY = 'promptit:idbMigration';

async function openOptionsPage(
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

  await expect(page).toHaveTitle(/Promptit Settings/i);
  await expect(page.getByText('Promptit Sprint 3')).toBeVisible();

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

function getPromptList(page: Page): Locator {
  return page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '저장된 프롬프트' }) });
}

function getPromptListButtons(page: Page): Locator {
  return getPromptList(page).locator('[data-testid="prompt-card"]');
}

function getPromptCard(page: Page, title: string): Locator {
  return getPromptListButtons(page).filter({ hasText: title }).first();
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
  await page.getByRole('button', { name: '프롬프트 추가' }).click();
}

function getTitleInput(page: Page): Locator {
  return page.locator('form').getByRole('textbox', { name: /제목/ });
}

function getContentInput(page: Page): Locator {
  return page.locator('form').getByRole('textbox', { name: /본문/ });
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

async function expectNoChromeStoragePromptBody(
  extension: LoadedExtension,
  bodyText: string,
): Promise<void> {
  const snapshot = await extension.getChromeStorageLocalSnapshot();

  expect(JSON.stringify(snapshot)).not.toContain(bodyText);
  expect(snapshot).not.toHaveProperty(LEGACY_PROMPTS_STORAGE_KEY);
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

test('opens the options page', async ({ extension }) => {
  await openOptionsPage(extension);
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

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 저장했습니다.' }),
  ).toBeVisible();
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

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 업데이트했습니다.' }),
  ).toBeVisible();
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
    sortOrder: 1,
  });

  await extension.setPromptRecords([existingPrompt]);

  const page = await openOptionsPage(extension);

  await createPromptFromOptions(page, '새 일반', '새 일반 본문');

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 저장했습니다.' }),
  ).toBeVisible();
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

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 저장했습니다.' }),
  ).toBeVisible();

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
    sortOrder: 1,
  });

  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);
  await createPromptFromOptions(page, initialPrompt.title, exactLimitBody);

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 저장했습니다.' }),
  ).toBeVisible();

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
    sortOrder: 4,
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

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 업데이트했습니다.' }),
  ).toBeVisible();

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
    sortOrder: 4,
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

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 업데이트했습니다.' }),
  ).toBeVisible();

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
    sortOrder: 1,
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
    type: UPDATE_PROMPT_BODY_MESSAGE,
    id: initialPrompt.id,
    content: '반영되면 안 되는 본문',
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: DELETE_PROMPT_MESSAGE,
    id: initialPrompt.id,
    expectedBodyUpdatedAt: initialPrompt.bodyUpdatedAt,
  });
});

test('orders prompts with matching sortOrder by createdAt and id tie-breaks', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'same-sort-later',
      title: '생성일 늦은 프롬프트',
      content: '생성일이 가장 늦어서 마지막에 보여야 한다.',
      sortOrder: 5,
      createdAt: new Date('2026-03-29T00:03:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:03:00.000Z').toISOString(),
    }),
    createPromptRecord({
      id: 'same-sort-id-b',
      title: '같은 생성일 ID B',
      content: '같은 생성일에서는 ID A 다음에 보여야 한다.',
      sortOrder: 5,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
    createPromptRecord({
      id: 'same-sort-earlier',
      title: '생성일 빠른 프롬프트',
      content: '생성일이 가장 빨라서 먼저 보여야 한다.',
      sortOrder: 5,
      createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    }),
    createPromptRecord({
      id: 'same-sort-id-a',
      title: '같은 생성일 ID A',
      content: '같은 생성일에서는 ID B보다 먼저 보여야 한다.',
      sortOrder: 5,
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
    sortOrder: 1,
  });
  const pinnedMiddle = createPromptRecord({
    id: 'pinned-middle',
    title: '고정된 중간',
    content: '고정된 중간 본문',
    sortOrder: 2,
    pinned: true,
    pinnedOrder: 1,
  });
  const normalLast = createPromptRecord({
    id: 'normal-last',
    title: '일반 마지막',
    content: '일반 마지막 본문',
    sortOrder: 3,
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
    sortOrder: 1,
  });
  const secondPrompt = createPromptRecord({
    id: 'list-pin-second',
    title: '목록 두 번째',
    content: '목록 두 번째 본문',
    sortOrder: 2,
  });

  await extension.setPromptRecords([firstPrompt, secondPrompt]);

  const page = await openOptionsPage(extension);

  await expectPinnedEditorCheckboxRemoved(page);
  await getPromptCard(page, secondPrompt.title).click();
  await expect(page.getByRole('heading', { name: '프롬프트 수정' })).toBeVisible();
  await expectPinnedEditorCheckboxRemoved(page);

  await getPromptPinToggle(page, secondPrompt.title).click();

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
      sortOrder: 1,
    }),
    createPromptRecord({
      id: 'normal-second',
      title: '일반 두 번째',
      content: '일반 두 번째 본문',
      sortOrder: 2,
    }),
    createPromptRecord({
      id: 'normal-third',
      title: '일반 세 번째',
      content: '일반 세 번째 본문',
      sortOrder: 3,
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

test('centers the drag-handle dot icon inside its button', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'centered-handle',
      title: '핸들 중앙',
      content: '핸들 중앙 본문',
      sortOrder: 1,
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
      sortOrder: 10,
    }),
    createPromptRecord({
      id: 'pinned-first',
      title: '고정 첫 번째',
      content: '고정 첫 번째 본문',
      pinned: true,
      pinnedOrder: 1,
      sortOrder: 1,
    }),
    createPromptRecord({
      id: 'pinned-second',
      title: '고정 두 번째',
      content: '고정 두 번째 본문',
      pinned: true,
      pinnedOrder: 2,
      sortOrder: 2,
    }),
    createPromptRecord({
      id: 'pinned-third',
      title: '고정 세 번째',
      content: '고정 세 번째 본문',
      pinned: true,
      pinnedOrder: 3,
      sortOrder: 3,
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
      sortOrder: 1,
    }),
    createPromptRecord({
      id: 'normal-boundary',
      title: '일반 경계',
      content: '일반 경계 본문',
      sortOrder: 2,
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
      sortOrder: 1,
    }),
    createPromptRecord({
      id: 'move-conflict-second',
      title: '충돌 두 번째',
      content: '충돌 두 번째 본문',
      sortOrder: 2,
    }),
    createPromptRecord({
      id: 'move-conflict-third',
      title: '충돌 세 번째',
      content: '충돌 세 번째 본문',
      sortOrder: 3,
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
    page.getByRole('alert').filter({ hasText: 'mock move conflict' }),
  ).toBeVisible();
  await expect(
    page.locator('body'),
  ).not.toContainText('충돌 두 번째 순서를 변경했습니다.');
  await expectVisiblePromptOrder(page, [
    '충돌 첫 번째',
    '충돌 두 번째',
    '충돌 세 번째',
  ]);
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
      sortOrder: 7,
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
  await expect(page.getByRole('heading', { name: '새 프롬프트 추가' })).toBeVisible();
  await expect(getTitleInput(page)).toHaveValue('로딩 중 입력한 제목');
  await expect(getContentInput(page)).toHaveValue('로딩 중 입력한 본문');
});

test('shows validation errors instead of saving invalid prompts', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);

  await getTitleInput(page).fill('   ');
  await getContentInput(page).fill('   ');
  await page.getByRole('button', { name: '프롬프트 추가' }).click();

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
      sortOrder: 2,
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
      .filter({ hasText: '편집 중인 프롬프트가 삭제되어 새 프롬프트 작성 모드로 전환했습니다.' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 첫 프롬프트를 추가하세요.',
    ),
  ).toBeVisible();
  await expect
    .poll(async () => await extension.getPromptRecords())
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
      sortOrder: 1,
    }),
    createPromptRecord({
      id: 'prompt-remaining',
      title: '남아있는 프롬프트',
      content: '삭제되지 않는 프롬프트',
      sortOrder: 5,
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
      .filter({ hasText: '편집 중인 프롬프트가 삭제되어 새 프롬프트 작성 모드로 전환했습니다.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '새 프롬프트 추가' }),
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
    sortOrder: 2,
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

  await expect(
    primaryPage
      .getByRole('status')
      .filter({ hasText: '프롬프트를 업데이트했습니다.' }),
  ).toBeVisible();

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
        sortOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      {
        id: 'shared-delete-prompt',
        title: '최신 삭제 충돌 제목',
        content: '두 번째 탭이 오래된 상태로 삭제를 시도한다.',
        sortOrder: 2,
      },
    ]);
});

test('migrates valid legacy storage entries when the options page loads', async ({
  extension,
}) => {
  await extension.setLegacyRawPrompts([
    createLegacyPromptItem({
      id: 'later-prompt',
      title: '나중 프롬프트',
      content: '두 번째로 보여야 한다.',
      sortOrder: 8,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
    {
      id: STARTER_PROMPT_ID,
      title: 'starter',
      content: 'starter content',
      sortOrder: 0,
      createdAt: new Date('2026-03-29T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:00:00.000Z').toISOString(),
    },
    { id: 'broken-prompt', title: '', content: '', sortOrder: 'x' },
    createLegacyPromptItem({
      id: 'early-prompt',
      title: '먼저 프롬프트',
      content: '첫 번째로 보여야 한다.',
      sortOrder: 3,
      createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expect(getPromptCard(page, '먼저 프롬프트')).toBeVisible();
  await expect(getPromptCard(page, '나중 프롬프트')).toBeVisible();
  await expect(page.getByText('starter')).toHaveCount(0);

  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        sortOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      {
        id: 'early-prompt',
        title: '먼저 프롬프트',
        sortOrder: 1000000,
      },
      {
        id: 'later-prompt',
        title: '나중 프롬프트',
        sortOrder: 2000000,
      },
    ]);
});

test('keeps migrated prompts readable when the migration marker write fails after IDB commit', async ({
  extension,
}) => {
  await extension.setLegacyRawPrompts([
    createLegacyPromptItem({
      id: 'marker-failure-first',
      title: '마커 실패 첫 번째',
      content: '마이그레이션 커밋 뒤에도 읽혀야 한다.',
      sortOrder: 1,
      createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    }),
    createLegacyPromptItem({
      id: 'marker-failure-second',
      title: '마커 실패 두 번째',
      content: '서비스 워커 저장소가 계속 동작해야 한다.',
      sortOrder: 2,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
  ]);
  await extension.failPromptStorageKeyWritesOnce(
    [PROMPT_IDB_MIGRATION_STORAGE_KEY],
    'mock migration marker write failure',
  );

  const page = await openOptionsPage(extension);

  await expect(getPromptCard(page, '마커 실패 첫 번째')).toBeVisible();
  await expect(getPromptCard(page, '마커 실패 두 번째')).toBeVisible();
  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        sortOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      {
        id: 'marker-failure-first',
        title: '마커 실패 첫 번째',
        content: '마이그레이션 커밋 뒤에도 읽혀야 한다.',
        sortOrder: 1000000,
      },
      {
        id: 'marker-failure-second',
        title: '마커 실패 두 번째',
        content: '서비스 워커 저장소가 계속 동작해야 한다.',
        sortOrder: 2000000,
      },
    ]);
  expect(await extension.getPromptStorageRevision()).toEqual(
    expect.objectContaining({
      updatedAt: expect.any(String),
    }),
  );

  const createResponse = await extension.sendRuntimeMessage({
    type: CREATE_PROMPT_MESSAGE,
    draft: {
      title: '마커 실패 이후 생성',
      content: '일회성 저장 실패 뒤에도 새 프롬프트를 저장할 수 있어야 한다.',
      normalOrder: 3000000,
    },
  });

  expect(createResponse).toEqual(
    expect.objectContaining({
      type: CREATE_PROMPT_MESSAGE,
      ok: true,
      status: 'success',
    }),
  );
  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => prompt.title),
    )
    .toEqual([
      '마커 실패 첫 번째',
      '마커 실패 두 번째',
      '마커 실패 이후 생성',
    ]);
});

test('handles malformed legacy storage without creating prompt records', async ({
  extension,
}) => {
  const malformedLegacyValue = {
    prompts: 'not an array',
    content: '이 값은 본문으로 저장되면 안 된다.',
  };

  await extension.setLegacyRawPrompts(malformedLegacyValue);

  const page = await openOptionsPage(extension);

  await expect(
    page.getByText(
      '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 첫 프롬프트를 추가하세요.',
    ),
  ).toBeVisible();
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([]);
  await expect.poll(async () => await extension.getLegacyPrompts()).toEqual(
    malformedLegacyValue,
  );
});

test('aborts legacy migration when any legacy body exceeds the byte limit', async ({
  extension,
}) => {
  const oversizedLegacyPrompt = createLegacyPromptItem({
    id: 'legacy-oversized',
    title: '너무 큰 레거시',
    content: 'a'.repeat(PROMPT_BODY_MAX_BYTES + 1),
    sortOrder: 1,
  });
  const validLegacyPrompt = createLegacyPromptItem({
    id: 'legacy-valid',
    title: '정상 레거시',
    content: '정상 본문',
    sortOrder: 2,
  });
  const rawPrompts = [validLegacyPrompt, oversizedLegacyPrompt];

  await extension.setLegacyRawPrompts(rawPrompts);

  const page = await openOptionsPage(extension);

  await expect(
    page.getByText(/너무 큰 레거시|legacy-oversized|500|초과/),
  ).toBeVisible();
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([]);
  await expect.poll(async () => await extension.getLegacyPrompts()).toEqual(rawPrompts);
});

test('preserves prompts and shows a load error when prompt storage reads fail', async ({
  extension,
}) => {
  const existingPrompts = [
    createPromptRecord({
      id: 'stale-prompt',
      title: '남은 프롬프트',
      content: '이 값은 지워지면 안 된다.',
      sortOrder: 4,
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

  await expect(page.getByText('mock list metas failure')).toBeVisible();
  await expect(
    page.getByText(
      '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 첫 프롬프트를 추가하세요.',
    ),
  ).toHaveCount(0);
  await expect.poll(async () => await extension.getPromptRecords()).toEqual(
    existingPrompts,
  );
});

test('does not repair malformed storage when the initial read fails', async ({
  extension,
}) => {
  const rawPrompts: unknown[] = [
    createLegacyPromptItem({
      id: 'valid-prompt',
      title: '유효한 프롬프트',
      content: '이 항목은 유지되어야 한다.',
      sortOrder: 3,
    }),
    {
      id: STARTER_PROMPT_ID,
      title: 'starter',
      content: 'starter content',
      sortOrder: 0,
      createdAt: new Date('2026-03-29T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:00:00.000Z').toISOString(),
    },
    { id: 'broken-prompt', title: '', content: '', sortOrder: 'x' },
  ];

  await extension.setLegacyRawPrompts(rawPrompts);

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

  await expect(page.getByText('mock list metas failure')).toBeVisible();
  await expect.poll(async () => await extension.getLegacyPrompts()).toEqual(rawPrompts);
});

test('surfaces a conflict when two options tabs save the same prompt stale', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'shared-prompt',
    title: '동시 수정 대상',
    content: '같은 프롬프트를 두 탭에서 편집한다.',
    sortOrder: 2,
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

  await expect(
    primaryPage
      .getByRole('status')
      .filter({ hasText: '프롬프트를 업데이트했습니다.' }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        sortOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      {
        id: 'shared-prompt',
        title: '첫 번째 저장',
        content: '같은 프롬프트를 두 탭에서 편집한다.',
        sortOrder: 2,
      },
    ]);

  await getTitleInput(stalePage).fill('두 번째 저장');
  await stalePage.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(
    stalePage
      .getByRole('alert')
      .filter({ hasText: '다른 창의 변경이 먼저 저장되었습니다.' }),
  ).toBeVisible();
  await expect(getTitleInput(stalePage)).toHaveValue('첫 번째 저장');
  await expect
    .poll(async () =>
      (await extension.getPromptRecords()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        sortOrder: prompt.normalOrder,
      })),
    )
    .toEqual([
      {
        id: 'shared-prompt',
        title: '첫 번째 저장',
        content: '같은 프롬프트를 두 탭에서 편집한다.',
        sortOrder: 2,
      },
    ]);
});

test('surfaces a conflict when two options tabs save the same body stale', async ({
  extension,
}) => {
  const initialPrompt = createPromptRecord({
    id: 'shared-body-prompt',
    title: '본문 동시 수정 대상',
    content: '두 탭 모두 이 본문에서 시작한다.',
    sortOrder: 2,
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

  await expect(
    primaryPage
      .getByRole('status')
      .filter({ hasText: '프롬프트를 업데이트했습니다.' }),
  ).toBeVisible();

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

  await expect(page.getByRole('alert').filter({ hasText: 'mock create failure' })).toBeVisible();
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([]);
});

test('shows an error when deleting fails', async ({ extension }) => {
  const prompts = [
    createPromptRecord({
      id: 'delete-failure',
      title: '삭제 실패',
      content: '삭제 실패를 검증한다.',
      sortOrder: 2,
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

  await expect(page.getByRole('alert').filter({ hasText: 'mock delete failure' })).toBeVisible();
  await expect
    .poll(async () => (await extension.getPromptRecords()).map((prompt) => prompt.id))
    .toEqual(['delete-failure']);
});
