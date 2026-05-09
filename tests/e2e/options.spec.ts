import { expect, test as base, type Page } from '@playwright/test';

import {
  launchExtension,
  type LoadedExtension,
} from '../playwright/extension';
import { createPromptItem } from '../playwright/promptit';
import { STARTER_PROMPT_ID } from '../../src/prompt/schema';

const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await use(extension);
    await extension.close();
  },
});

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
    const localStorageArea = chrome.storage.local as typeof chrome.storage.local & {
      get: (...args: unknown[]) => Promise<unknown>;
    };
    const originalGet = localStorageArea.get.bind(localStorageArea);
    const pendingGets: Array<{
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

      for (const pendingGet of pendingGets.splice(0)) {
        try {
          pendingGet.resolve(await originalGet(...pendingGet.args));
        } catch (error) {
          pendingGet.reject(error);
        }
      }
    };

    localStorageArea.get = async (...args: unknown[]) => {
      if (isReleased) {
        return await originalGet(...args);
      }

      return await new Promise((resolve, reject) => {
        pendingGets.push({ args, reject, resolve });
      });
    };
  });
}

async function getServiceWorker(extension: LoadedExtension) {
  const [serviceWorker] = extension.context.serviceWorkers();

  if (serviceWorker) {
    return serviceWorker;
  }

  return await extension.context.waitForEvent('serviceworker');
}

async function patchBackgroundStorageSetFailure(
  extension: LoadedExtension,
  message: string,
): Promise<void> {
  const serviceWorker = await getServiceWorker(extension);

  await serviceWorker.evaluate((failureMessage) => {
    const localStorageArea = chrome.storage.local as typeof chrome.storage.local & {
      set: (...args: unknown[]) => Promise<unknown>;
    };

    localStorageArea.set = async () => {
      throw new Error(failureMessage);
    };
  }, message);
}

test('opens the options page', async ({ extension }) => {
  await openOptionsPage(extension);
});

test('creates and updates prompts from the options page', async ({
  extension,
}) => {
  await extension.setPrompts([]);

  const page = await openOptionsPage(extension);

  await page.getByLabel(/제목/).fill('  회의록 정리  ');
  await page.getByLabel(/본문/).fill('대화 내용을 구조화해서 정리해줘.');
  await page.getByLabel(/정렬 순서/).fill('3.7');
  await page.getByRole('button', { name: '프롬프트 저장' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 저장했습니다.' }),
  ).toBeVisible();
  await expect(page.getByLabel(/제목/)).toHaveValue('');
  await expect(page.getByLabel(/정렬 순서/)).toHaveValue('4');

  await expect
    .poll(async () =>
      (await extension.getPrompts()).map((prompt) => ({
        title: prompt.title,
        content: prompt.content,
        sortOrder: prompt.sortOrder,
      })),
    )
    .toEqual([
      {
        title: '회의록 정리',
        content: '대화 내용을 구조화해서 정리해줘.',
        sortOrder: 3,
      },
    ]);

  await page.getByRole('button').filter({ hasText: '회의록 정리' }).click();
  await expect(
    page.getByRole('heading', { name: '프롬프트 수정' }),
  ).toBeVisible();

  await page.getByLabel(/제목/).fill('회의록 요약');
  await page.getByLabel(/본문/).fill('회의 내용을 요약하고 액션 아이템을 정리해줘.');
  await page.getByLabel(/정렬 순서/).fill('1');
  await page.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 업데이트했습니다.' }),
  ).toBeVisible();
  await expect(page.getByLabel(/제목/)).toHaveValue('회의록 요약');
  await expect(page.getByLabel(/정렬 순서/)).toHaveValue('1');

  await expect
    .poll(async () =>
      (await extension.getPrompts()).map((prompt) => ({
        title: prompt.title,
        content: prompt.content,
        sortOrder: prompt.sortOrder,
      })),
    )
    .toEqual([
      {
        title: '회의록 요약',
        content: '회의 내용을 요약하고 액션 아이템을 정리해줘.',
        sortOrder: 1,
      },
    ]);
});

test('orders prompts with matching sortOrder by createdAt and id tie-breaks', async ({
  extension,
}) => {
  await extension.setPrompts([
    createPromptItem({
      id: 'same-sort-later',
      title: '생성일 늦은 프롬프트',
      content: '생성일이 가장 늦어서 마지막에 보여야 한다.',
      sortOrder: 5,
      createdAt: new Date('2026-03-29T00:03:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:03:00.000Z').toISOString(),
    }),
    createPromptItem({
      id: 'same-sort-id-b',
      title: '같은 생성일 ID B',
      content: '같은 생성일에서는 ID A 다음에 보여야 한다.',
      sortOrder: 5,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
    createPromptItem({
      id: 'same-sort-earlier',
      title: '생성일 빠른 프롬프트',
      content: '생성일이 가장 빨라서 먼저 보여야 한다.',
      sortOrder: 5,
      createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    }),
    createPromptItem({
      id: 'same-sort-id-a',
      title: '같은 생성일 ID A',
      content: '같은 생성일에서는 ID B보다 먼저 보여야 한다.',
      sortOrder: 5,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
  ]);

  const page = await openOptionsPage(extension);
  const promptButtons = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '저장된 프롬프트' }) })
    .locator('button[aria-pressed]');

  await expect(promptButtons).toHaveCount(4);
  await expect(promptButtons.nth(0)).toContainText('생성일 빠른 프롬프트');
  await expect(promptButtons.nth(1)).toContainText('같은 생성일 ID A');
  await expect(promptButtons.nth(2)).toContainText('같은 생성일 ID B');
  await expect(promptButtons.nth(3)).toContainText('생성일 늦은 프롬프트');
});

test('preserves draft input while the initial prompt load resolves', async ({
  extension,
}) => {
  await extension.setPrompts([
    createPromptItem({
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

  await page.getByLabel(/제목/).fill('로딩 중 입력한 제목');
  await page.getByLabel(/본문/).fill('로딩 중 입력한 본문');
  await page.getByLabel(/정렬 순서/).fill('11');

  await page.evaluate(() => (window as any).__releasePromptitInitialLoad?.());

  await expect(
    page.getByRole('button').filter({ hasText: '불러온 프롬프트' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '새 프롬프트 추가' })).toBeVisible();
  await expect(page.getByLabel(/제목/)).toHaveValue('로딩 중 입력한 제목');
  await expect(page.getByLabel(/본문/)).toHaveValue('로딩 중 입력한 본문');
  await expect(page.getByLabel(/정렬 순서/)).toHaveValue('11');
});

test('rejects blank sortOrder before coercion and focuses the field', async ({
  extension,
}) => {
  await extension.setPrompts([]);

  const page = await openOptionsPage(extension);

  await page.getByLabel(/제목/).fill('정렬 순서 검증');
  await page.getByLabel(/본문/).fill('정렬 순서가 비어 있으면 저장되지 않아야 한다.');
  await page.getByLabel(/정렬 순서/).fill('');
  await page.getByRole('button', { name: '프롬프트 저장' }).click();

  await expect(page.getByText('정렬 순서를 입력해주세요.')).toBeVisible();
  await expect(page.getByLabel(/정렬 순서/)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel(/정렬 순서/)).toHaveAttribute(
    'aria-describedby',
    /-hint.*-error/,
  );
  await expect(page.getByLabel(/정렬 순서/)).toBeFocused();
  await expect.poll(async () => await extension.getPrompts()).toEqual([]);
});

test('shows validation errors instead of saving invalid prompts', async ({
  extension,
}) => {
  await extension.setPrompts([]);

  const page = await openOptionsPage(extension);

  await page.getByLabel(/제목/).fill('   ');
  await page.getByLabel(/본문/).fill('   ');
  await page.getByRole('button', { name: '프롬프트 저장' }).click();

  await expect(
    page.getByText('제목은 1자 이상 40자 이하로 입력해주세요.'),
  ).toBeVisible();
  await expect(
    page.getByText('본문은 비워둘 수 없습니다.'),
  ).toBeVisible();

  await expect.poll(async () => await extension.getPrompts()).toEqual([]);
});

test('cancels and confirms prompt deletion from edit mode', async ({
  extension,
}) => {
  await extension.setPrompts([
    createPromptItem({
      id: 'prompt-delete-target',
      title: '삭제 테스트',
      content: '삭제 흐름을 검증한다.',
      sortOrder: 2,
    }),
  ]);

  const page = await openOptionsPage(extension);
  await page.getByRole('button').filter({ hasText: '삭제 테스트' }).click();

  page.once('dialog', async (dialog) => {
    await dialog.dismiss();
  });
  await page
    .locator('form')
    .getByRole('button', { name: '프롬프트 삭제', exact: true })
    .click();

  await expect
    .poll(async () => (await extension.getPrompts()).map((prompt) => prompt.id))
    .toEqual(['prompt-delete-target']);

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page
    .locator('form')
    .getByRole('button', { name: '프롬프트 삭제', exact: true })
    .click();

  await expect(
    page.getByRole('status').filter({ hasText: '프롬프트를 삭제했습니다.' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 첫 프롬프트를 추가하세요.',
    ),
  ).toBeVisible();
  await expect
    .poll(async () => await extension.getPrompts())
    .toEqual([]);
});

test('returns to create mode when the editing prompt is deleted elsewhere', async ({
  extension,
}) => {
  const prompts = [
    createPromptItem({
      id: 'prompt-editing',
      title: '편집 중',
      content: '현재 편집 중인 프롬프트',
      sortOrder: 1,
    }),
    createPromptItem({
      id: 'prompt-remaining',
      title: '남아있는 프롬프트',
      content: '삭제되지 않는 프롬프트',
      sortOrder: 5,
    }),
  ];

  await extension.setPrompts(prompts);

  const page = await openOptionsPage(extension);
  await page.getByRole('button').filter({ hasText: '편집 중' }).click();
  await expect(
    page.getByRole('heading', { name: '프롬프트 수정' }),
  ).toBeVisible();

  await extension.setPrompts([prompts[1]]);

  await expect(
    page
      .getByRole('status')
      .filter({ hasText: '편집 중인 프롬프트가 삭제되어 새 프롬프트 작성 모드로 전환했습니다.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '새 프롬프트 추가' }),
  ).toBeVisible();
  await expect(page.getByLabel(/제목/)).toHaveValue('');
  await expect(page.getByLabel(/정렬 순서/)).toHaveValue('6');
});

test('surfaces a stale delete conflict when a second tab deletes an edited prompt', async ({
  extension,
}) => {
  const initialPrompt = createPromptItem({
    id: 'shared-delete-prompt',
    title: '삭제 충돌 대상',
    content: '두 번째 탭이 오래된 상태로 삭제를 시도한다.',
    sortOrder: 2,
  });

  await extension.setPrompts([initialPrompt]);

  const primaryPage = await openOptionsPage(extension);
  const stalePage = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.addInitScript(() => {
      const storageEventArea = chrome.storage.onChanged as typeof chrome.storage.onChanged & {
        addListener: typeof chrome.storage.onChanged.addListener;
      };

      storageEventArea.addListener = () => {};
    });
  });

  await primaryPage.getByRole('button').filter({ hasText: '삭제 충돌 대상' }).click();
  await stalePage.getByRole('button').filter({ hasText: '삭제 충돌 대상' }).click();

  await primaryPage.getByLabel(/제목/).fill('최신 삭제 충돌 제목');
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
      (await extension.getPrompts()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        sortOrder: prompt.sortOrder,
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

test('normalizes invalid storage entries when the options page loads', async ({
  extension,
}) => {
  await extension.setRawPrompts([
    createPromptItem({
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
    createPromptItem({
      id: 'early-prompt',
      title: '먼저 프롬프트',
      content: '첫 번째로 보여야 한다.',
      sortOrder: 3,
      createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expect(page.getByRole('button').filter({ hasText: '먼저 프롬프트' })).toBeVisible();
  await expect(page.getByRole('button').filter({ hasText: '나중 프롬프트' })).toBeVisible();
  await expect(page.getByText('starter')).toHaveCount(0);

  await expect
    .poll(async () =>
      (await extension.getPrompts()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        sortOrder: prompt.sortOrder,
      })),
    )
    .toEqual([
      {
        id: 'early-prompt',
        title: '먼저 프롬프트',
        sortOrder: 3,
      },
      {
        id: 'later-prompt',
        title: '나중 프롬프트',
        sortOrder: 8,
      },
    ]);
});

test('preserves prompts and shows a load error when prompt storage reads fail', async ({
  extension,
}) => {
  const existingPrompts = [
    createPromptItem({
      id: 'stale-prompt',
      title: '남은 프롬프트',
      content: '이 값은 지워지면 안 된다.',
      sortOrder: 4,
    }),
  ];

  await extension.setPrompts(existingPrompts);

  const page = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.addInitScript(() => {
      const localStorageArea = chrome.storage.local as typeof chrome.storage.local & {
        get: (...args: unknown[]) => Promise<unknown>;
      };

      localStorageArea.get = async (...args: unknown[]) => {
        void args;
        throw new Error('mock get failure');
      };
    });
  });

  await expect(page.getByText('mock get failure')).toBeVisible();
  await expect(
    page.getByText(
      '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 첫 프롬프트를 추가하세요.',
    ),
  ).toHaveCount(0);
  await expect.poll(async () => await extension.getPrompts()).toEqual(
    existingPrompts,
  );
});

test('does not repair malformed storage when the initial read fails', async ({
  extension,
}) => {
  const rawPrompts: unknown[] = [
    createPromptItem({
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

  await extension.setRawPrompts(rawPrompts);

  const page = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.addInitScript(() => {
      const localStorageArea = chrome.storage.local as typeof chrome.storage.local & {
        get: (...args: unknown[]) => Promise<unknown>;
      };

      localStorageArea.get = async (...args: unknown[]) => {
        void args;
        throw new Error('mock get failure');
      };
    });
  });

  await expect(page.getByText('mock get failure')).toBeVisible();
  await expect.poll(async () => await extension.getPrompts()).toEqual(rawPrompts);
});

test('surfaces a conflict when two options tabs save the same prompt stale', async ({
  extension,
}) => {
  const initialPrompt = createPromptItem({
    id: 'shared-prompt',
    title: '동시 수정 대상',
    content: '같은 프롬프트를 두 탭에서 편집한다.',
    sortOrder: 2,
  });

  await extension.setPrompts([initialPrompt]);

  const primaryPage = await openOptionsPage(extension);
  const stalePage = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.addInitScript(() => {
      const storageEventArea = chrome.storage.onChanged as typeof chrome.storage.onChanged & {
        addListener: typeof chrome.storage.onChanged.addListener;
      };

      storageEventArea.addListener = () => {};
    });
  });

  await primaryPage.getByRole('button').filter({ hasText: '동시 수정 대상' }).click();
  await stalePage.getByRole('button').filter({ hasText: '동시 수정 대상' }).click();

  await primaryPage.getByLabel(/제목/).fill('첫 번째 저장');
  await primaryPage.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(
    primaryPage
      .getByRole('status')
      .filter({ hasText: '프롬프트를 업데이트했습니다.' }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await extension.getPrompts()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        sortOrder: prompt.sortOrder,
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

  await stalePage.getByLabel(/제목/).fill('두 번째 저장');
  await stalePage.getByRole('button', { name: '프롬프트 수정' }).click();

  await expect(
    stalePage
      .getByRole('alert')
      .filter({ hasText: '다른 창의 변경이 먼저 저장되었습니다.' }),
  ).toBeVisible();
  await expect(stalePage.getByLabel(/제목/)).toHaveValue('첫 번째 저장');
  await expect
    .poll(async () =>
      (await extension.getPrompts()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        content: prompt.content,
        sortOrder: prompt.sortOrder,
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

test('shows an error when saving fails', async ({ extension }) => {
  await extension.setPrompts([]);

  const page = await openOptionsPage(extension);
  await patchBackgroundStorageSetFailure(extension, 'mock set failure');

  await page.getByLabel(/제목/).fill('저장 실패');
  await page.getByLabel(/본문/).fill('저장 실패를 검증한다.');
  await page.getByLabel(/정렬 순서/).fill('1');
  await page.getByRole('button', { name: '프롬프트 저장' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'mock set failure' })).toBeVisible();
  await expect.poll(async () => await extension.getPrompts()).toEqual([]);
});

test('shows an error when deleting fails', async ({ extension }) => {
  const prompts = [
    createPromptItem({
      id: 'delete-failure',
      title: '삭제 실패',
      content: '삭제 실패를 검증한다.',
      sortOrder: 2,
    }),
  ];

  await extension.setPrompts(prompts);

  const page = await openOptionsPage(extension);

  await page.getByRole('button').filter({ hasText: '삭제 실패' }).click();
  await patchBackgroundStorageSetFailure(extension, 'mock delete failure');
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: '프롬프트 삭제' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'mock delete failure' })).toBeVisible();
  await expect
    .poll(async () => (await extension.getPrompts()).map((prompt) => prompt.id))
    .toEqual(['delete-failure']);
});
