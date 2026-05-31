import {
  BODY_LOAD_ERROR_MESSAGE,
  test,
  openOptionsPage,
  deferInitialPromptLoad,
  patchRuntimeMessageFailure,
  expectBodyLoadErrorStatusOnly,
  getPromptList,
  getPromptEditor,
  getOptionsToast,
  getPromptListCreateButton,
  getPromptCard,
  createPromptFromOptions,
  getTitleInput,
  getContentInput,
  getPromptSubmitButton,
  getRequiredPromptRecord,
  expect,
  createPromptRecord,
  DELETE_PROMPT_MESSAGE,
  GET_PROMPT_BODY_MESSAGE,
  GET_PROMPT_RECORD_MESSAGE,
  LIST_PROMPT_METAS_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  UPDATE_PROMPT_RECORD_MESSAGE,
} from '../playwright/optionsPage';

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
