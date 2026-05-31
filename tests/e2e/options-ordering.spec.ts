import {
  PROMPT_GROUP_CROSS_REORDER_MESSAGE,
  test,
  openOptionsPage,
  patchRuntimeMessageResponse,
  getPromptList,
  getPromptEditor,
  getOptionsToast,
  getPromptCard,
  getPromptDragHandle,
  getPromptPinToggle,
  expectPinnedEditorCheckboxRemoved,
  expectVisiblePromptOrder,
  expectStoredPromptMetaOrder,
  expectPromptListToHideInternalOrderFields,
  pressPromptHandleKey,
  dragPromptHandleToPrompt,
  setPromptPinnedThroughRuntime,
  expect,
  createPromptRecord,
  MOVE_PROMPT_MESSAGE,
} from '../playwright/optionsPage';

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
