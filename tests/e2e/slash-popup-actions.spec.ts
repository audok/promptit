import {
  test,
  basePrompts,
  dispatchComposerInput,
  getPopupStateSnapshot,
  getPopupAccessibilitySnapshot,
  getActiveElementSnapshot,
  waitForPromptBodyReadPending,
  armPromptBodyReadPendingListener,
  getPopupPinButton,
  expectPopupPromptOrder,
  expectStoredPromptPinned,
  setPromptRecordsWithoutRevision,
  expect,
  CONTENTEDITABLE_FIXTURE_URL,
  createPromptRecord,
  dispatchPromptitTestEvent,
  getActivePopupCellLabel,
  getComposerText,
  getPopupTitles,
  getToastText,
  grantFixtureClipboardPermissions,
  openFixturePage,
  openPromptPopup,
  replaceComposerTextWithoutInputEvent,
  TEXTAREA_FIXTURE_URL,
  waitForPromptPopupToClose,
} from '../playwright/chatgptSlashPopup';

test('inserts the active prompt into the contenteditable fixture', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe(
    '영문으로 자연스럽게 번역해줘.',
  );
});

test('opens from metadata when body reads fail and keeps the popup open on select failure', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    failPromptBodyRead: true,
  });

  await openPromptPopup(page);

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(await getPopupTitles(page)).toEqual(['번역', '회의록']);

  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not read the prompt body.');
  await expect(await getComposerText(page)).toBe('/ ');
  await expect.poll(async () => {
    return await page.evaluate(() => document.activeElement?.id ?? null);
  }).toBe('prompt-textarea');
});

test('fetches the latest prompt body when selecting an already-open popup item', async ({
  extension,
}) => {
  const prompt = createPromptRecord({
    id: 'body-on-select',
    title: '본문 지연 읽기',
    content: '처음 열린 본문',
    normalOrder: 1,
  });

  await extension.setPromptRecords([prompt]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  await extension.setPromptRecords([
    createPromptRecord({
      ...prompt,
      content: '선택 시점에 읽은 본문',
      bodyUpdatedAt: '2026-03-29T00:10:00.000Z',
      updatedAt: '2026-03-29T00:10:00.000Z',
    }),
  ]);

  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe('선택 시점에 읽은 본문');
});

test('keeps the popup busy and open while prompt insertion is pending', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    deferPromptBodyRead: true,
  });

  await armPromptBodyReadPendingListener(page);
  await page.keyboard.press('Enter');
  await waitForPromptBodyReadPending(page);

  try {
    const busySnapshot = await getPopupStateSnapshot(page);
    expect(busySnapshot).toMatchObject({
      ariaBusy: 'true',
      isBusy: true,
      isVisible: true,
    });
    expect(busySnapshot.disabledActionButtonCount).toBe(
      busySnapshot.actionButtonCount,
    );

    await dispatchComposerInput(page, 'insertText', 'x');

    await expect(await getPopupStateSnapshot(page)).toMatchObject({
      ariaBusy: 'true',
      isBusy: true,
      isVisible: true,
    });
    await expect(await getComposerText(page)).toBe('/ ');

    await page.keyboard.press('Tab');

    await expect(await getPopupStateSnapshot(page)).toMatchObject({
      ariaBusy: 'true',
      isBusy: true,
      isVisible: true,
    });
    await expect(await getComposerText(page)).toBe('/ ');
    const activeElement = await getActiveElementSnapshot(page);
    expect(activeElement.id).not.toBe('prompt-textarea');
    expect(activeElement.testId).not.toBe('prompt-textarea');
  } finally {
    await dispatchPromptitTestEvent(
      page,
      'promptit:test-release-prompt-body-read',
    );
  }

  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe(
    '영문으로 자연스럽게 번역해줘.',
  );
});

test('keeps the popup busy and open while prompt copy is pending', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);
  await grantFixtureClipboardPermissions(extension.context);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    deferPromptBodyRead: true,
  });

  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe('Copy prompt: 번역');

  await armPromptBodyReadPendingListener(page);
  await page.keyboard.press('Enter');
  await waitForPromptBodyReadPending(page);

  try {
    await expect(await getPopupStateSnapshot(page)).toMatchObject({
      ariaBusy: 'true',
      isBusy: true,
      isVisible: true,
    });

    await dispatchComposerInput(page, 'insertText', 'x');

    await expect(await getPopupStateSnapshot(page)).toMatchObject({
      ariaBusy: 'true',
      isBusy: true,
      isVisible: true,
    });
    await expect(await getComposerText(page)).toBe('/ ');
  } finally {
    await dispatchPromptitTestEvent(
      page,
      'promptit:test-release-prompt-body-read',
    );
  }

  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('');
  await expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).toBe('영문으로 자연스럽게 번역해줘.');
});

test('copies the selected prompt and clears the trigger text', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);
  await grantFixtureClipboardPermissions(extension.context);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Copy prompt: 회의록',
  );

  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe('');
  await expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).toBe('회의록으로 정리해줘.');
});

test('fetches the latest prompt body when copying from an already-open popup', async ({
  extension,
}) => {
  const prompt = createPromptRecord({
    id: 'body-on-copy',
    title: '복사 지연 읽기',
    content: '처음 열린 복사 본문',
    normalOrder: 1,
  });

  await extension.setPromptRecords([prompt]);
  await grantFixtureClipboardPermissions(extension.context);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  await extension.setPromptRecords([
    createPromptRecord({
      ...prompt,
      content: '복사 시점에 읽은 본문',
      bodyUpdatedAt: '2026-03-29T00:11:00.000Z',
      updatedAt: '2026-03-29T00:11:00.000Z',
    }),
  ]);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe('');
  await expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).toBe('복사 시점에 읽은 본문');
});

test('clamps keyboard navigation at popup edges and moves between title and copy cells', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 번역',
  );

  await page.keyboard.press('ArrowUp');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 번역',
  );

  await page.keyboard.press('ArrowDown');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 회의록',
  );

  await page.keyboard.press('ArrowDown');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 회의록',
  );

  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Copy prompt: 회의록',
  );

  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 회의록',
  );
});

test('keyboard navigation includes the pin cell without changing title and copy behavior', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 번역',
  );

  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe('Pin prompt: 번역');

  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 번역',
  );

  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe('Copy prompt: 번역');

  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 번역',
  );
});

test('pins a prompt through keyboard activation and keeps the popup open', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe('Pin prompt: 회의록');

  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(getPopupPinButton(page, '회의록', { pinned: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectStoredPromptPinned(extension, 'prompt-minutes', true);
  await expectPopupPromptOrder(page, ['회의록', '번역']);
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Unpin prompt: 회의록',
  );
});

test('unpins a seeded pinned prompt through keyboard activation', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    basePrompts[0],
    createPromptRecord({
      ...basePrompts[1],
      pinned: true,
      pinnedOrder: 1,
    }),
  ]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await expectPopupPromptOrder(page, ['회의록', '번역']);
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 회의록',
  );

  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Unpin prompt: 회의록',
  );

  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(getPopupPinButton(page, '회의록')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expectStoredPromptPinned(extension, 'prompt-minutes', false);
  await expect
    .poll(async () => {
      return (await extension.getPromptRecords()).find(
        (prompt) => prompt.id === 'prompt-minutes',
      )?.pinnedOrder;
    })
    .toBeNull();
  await expectPopupPromptOrder(page, ['번역', '회의록']);
  await expect(await getActivePopupCellLabel(page)).toBe('Pin prompt: 회의록');
});

test('updates the open popup when prompt storage changes', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await extension.setPromptRecords([
    basePrompts[0],
    createPromptRecord({
      id: basePrompts[1].id,
      title: '회의록 업데이트',
      content: basePrompts[1].content,
      normalOrder: basePrompts[1].normalOrder,
      createdAt: basePrompts[1].createdAt,
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
  ]);

  await expect
    .poll(async () => await getPopupTitles(page))
    .toEqual(['번역', '회의록 업데이트']);
  await expect
    .poll(async () => (await getPopupAccessibilitySnapshot(page)).activeStatusText)
    .toBe('Insert prompt: 번역');
});

test('opens the options page from the popup empty state', async ({
  extension,
}) => {
  await extension.setLanguagePreference('ko');
  await extension.setPromptRecords([]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

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

test('opens options and closes the popup when trigger cleanup fails', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await extension.context.newPage();
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await openPromptPopup(page);
  await replaceComposerTextWithoutInputEvent(page, 'x');

  const optionsPagePromise = extension.context.waitForEvent('page');
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  const optionsPage = await optionsPagePromise;
  await optionsPage.waitForLoadState('domcontentloaded');

  await expect(optionsPage).toHaveTitle(/promptit Settings/i);
  await expect(await getComposerText(page)).toBe('x');
});

test('shows an error toast when the background fails to open options and keeps the popup open', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    failOpenOptions: true,
  });
  const optionsPagePromise = extension.context.waitForEvent('page', {
    timeout: 500,
  });
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not open the settings page.');
  await expect(optionsPagePromise).rejects.toThrow(/Timeout/);
  await expect.poll(async () => {
    return await page.evaluate(() => document.activeElement?.id ?? null);
  }).toBe('prompt-textarea');
});

test('updates the active cell on hover and inserts a prompt on title click', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  const copyButton = page.getByRole('button', { name: 'Copy prompt: 회의록' });
  await copyButton.hover();
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Copy prompt: 회의록',
  );

  await page
    .getByRole('button', { name: 'Insert prompt: 회의록' })
    .click();
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe('회의록으로 정리해줘.');
});

test('shows an error toast when prompt insertion fails', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await openPromptPopup(page);
  await replaceComposerTextWithoutInputEvent(page, 'x');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not insert the prompt.');
  await expect(await getComposerText(page)).toBe('x');
});

test('copies a prompt through the mouse click path', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);
  await grantFixtureClipboardPermissions(extension.context);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page
    .getByRole('button', { name: 'Copy prompt: 번역' })
    .click();
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe('');
  await expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).toBe('영문으로 자연스럽게 번역해줘.');
});

test('toggles pin through the mouse click path while keeping the popup visible', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await getPopupPinButton(page, '회의록').click();

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(getPopupPinButton(page, '회의록', { pinned: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectStoredPromptPinned(extension, 'prompt-minutes', true);
  await expectPopupPromptOrder(page, ['회의록', '번역']);
});

test('shows an error and preserves external pin state on stale popup activation', async ({
  extension,
}) => {
  const stalePrompt = createPromptRecord({
    id: 'stale-pin-prompt',
    title: '고정 충돌',
    content: '고정 충돌 본문',
    normalOrder: 1,
    createdAt: '2026-03-29T00:03:00.000Z',
    updatedAt: '2026-03-29T00:03:00.000Z',
  });
  const externalPrompt = createPromptRecord({
    ...stalePrompt,
    pinned: true,
    pinnedOrder: 1,
    updatedAt: '2026-03-29T00:04:00.000Z',
  });

  await extension.setPromptRecords([stalePrompt]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 고정 충돌',
  );

  await setPromptRecordsWithoutRevision(extension, [externalPrompt]);
  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Pin prompt: 고정 충돌',
  );

  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toContain('changed elsewhere');
  const conflictToastText = await getToastText(page);
  expect(conflictToastText).toContain('try again');
  expect(conflictToastText).not.toBe('Prompt pinned.');
  await expect
    .poll(async () => {
      const prompt = (await extension.getPromptRecords()).find(
        (record) => record.id === stalePrompt.id,
      );

      return prompt
        ? {
            pinned: prompt.pinned,
            updatedAt: prompt.updatedAt,
          }
        : null;
    })
    .toEqual({
      pinned: true,
      updatedAt: '2026-03-29T00:04:00.000Z',
    });
});

test('shows an error toast when copying fails and keeps the popup open', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    failClipboardWrite: true,
  });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not copy the prompt.');
  await expect.poll(async () => {
    return await page.evaluate(() => document.activeElement?.id ?? null);
  }).toBe('prompt-textarea');
});

test('keeps the popup open when body read fails before copying', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);
  await grantFixtureClipboardPermissions(extension.context);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    failPromptBodyRead: true,
  });

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not read the prompt body.');
  await expect(await getComposerText(page)).toBe('/ ');
  await expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).toBe('');
});
