import {
  type PromptRecord,
  test,
  openOptionsPage,
  getPromptEditor,
  getOptionsToast,
  getPromptCard,
  expectVisiblePromptOrder,
  expectStoredPromptMetaOrder,
  expectPromptListToHideInternalOrderFields,
  expectSortOrderInputToBeRemoved,
  createPromptFromOptions,
  getTitleInput,
  getContentInput,
  expectNoChromeStoragePromptBody,
  getRequiredPromptRecord,
  expectRawRuntimeMessageNotAccepted,
  expect,
  createPromptRecord,
  PROMPT_BODY_MAX_BYTES,
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  UPDATE_PROMPT_RECORD_MESSAGE,
} from '../playwright/optionsPage';

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
