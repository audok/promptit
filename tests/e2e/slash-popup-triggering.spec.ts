import {
  type TriggerWindowState,
  test,
  basePrompts,
  setContenteditableComposerState,
  dispatchComposerInput,
  dispatchNestedChildComposerInput,
  installTriggerDetachmentWatcher,
  detachComposerAndTrackText,
  getDetachedComposerText,
  dispatchComposerCompositionEvent,
  dispatchComposerKeydown,
  setMultilineContenteditableComposerState,
  dispatchBlockBoundaryComposerInput,
  dispatchLineBoundaryComposerInput,
  dispatchInlineWrapperComposerInput,
  getComposerDomSnapshot,
  getPopupStateSnapshot,
  waitForPromptBodyReadPending,
  armPromptBodyReadPendingListener,
  getPopupPositionSnapshot,
  getPopupListScrollTop,
  expect,
  clearComposer,
  CONTENTEDITABLE_FIXTURE_URL,
  createPromptRecord,
  dispatchPromptitTestEvent,
  getActivePopupCellLabel,
  getComposerText,
  getPopupTitles,
  getToastText,
  openFixturePage,
  openPromptPopup,
  replaceComposerTextWithoutInputEvent,
  TEXTAREA_FIXTURE_URL,
  waitForPromptPopupToClose,
} from '../playwright/chatgptSlashPopup';

test('opens from a nested contenteditable child input event and inserts the active prompt', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await dispatchNestedChildComposerInput(page);

  await expect(page.locator('[data-testid="promptit-popup-host"]')).toBeVisible();
  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(await getPopupTitles(page)).toEqual(['번역', '회의록']);

  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe(
    '영문으로 자연스럽게 번역해줘.',
  );
});

test('cleans up the trigger text on escape and backspace', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('Escape');
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('');

  await clearComposer(page);
  await openPromptPopup(page);
  await page.keyboard.press('Backspace');
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('');
});

test('closes on outside click and preserves resumed typing', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.getByTestId('outside-target').click();
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('');

  await clearComposer(page);
  await openPromptPopup(page);
  await page.keyboard.type('a');
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('/ a');
});

test('closes on blur and clears the trigger text', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.getByRole('button', { name: 'Outside Click Target' }).focus();
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe('');
});

test('closes on resize and clears the trigger text', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('');
});

test('blocks contenteditable insertion when the live selection moved outside the composer', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.evaluate(() => {
    const outsideSelectionTarget = document.createElement('span');
    outsideSelectionTarget.textContent = 'outside';
    document.body.append(outsideSelectionTarget);

    const textNode = outsideSelectionTarget.firstChild;
    const selection = window.getSelection();

    if (!(textNode instanceof Text) || !selection) {
      throw new Error('Failed to prepare outside selection.');
    }

    const range = document.createRange();
    range.setStart(textNode, textNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not insert the prompt.');
  await expect(await getComposerText(page)).toBe('/ ');
});

test('blocks contenteditable insertion when the live selection is not collapsed', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    const textNode = composer.firstChild;
    const selection = window.getSelection();

    if (!(textNode instanceof Text) || !selection) {
      throw new Error('Failed to prepare non-collapsed selection.');
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.data.length);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not insert the prompt.');
  await expect(await getComposerText(page)).toBe('/ ');
});

test('keeps the trigger when same-root cleanup selection is not at the trigger endpoint', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    const textNode = composer.firstChild;
    const selection = window.getSelection();

    if (!(textNode instanceof Text) || !selection) {
      throw new Error('Failed to prepare same-root selection.');
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Escape');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not clean up the input field.');
  await expect(await getComposerText(page)).toBe('/ ');
});

test('preserves the multiline break when inserting and cleaning up a prompt from contenteditable', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await setMultilineContenteditableComposerState(page, {
    prefix: 'hello',
    trigger: '/\u00A0',
  });
  await dispatchComposerInput(page, 'insertText', '\u00A0');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  const insertionSnapshot = await getComposerDomSnapshot(page);
  expect(insertionSnapshot.childNodeNames).toContain('BR');
  expect(insertionSnapshot.innerHTML).toContain('hello<br>');
  expect(insertionSnapshot.innerHTML).toContain(
    '영문으로 자연스럽게 번역해줘.',
  );
  expect(insertionSnapshot.innerHTML).not.toContain('/&nbsp;');
  expect(insertionSnapshot.innerHTML).not.toContain('/ ');

  await setMultilineContenteditableComposerState(page, {
    prefix: 'hello',
    trigger: '/\u00A0',
  });
  await dispatchComposerInput(page, 'insertText', '\u00A0');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await waitForPromptPopupToClose(page);

  const cleanupSnapshot = await getComposerDomSnapshot(page);
  expect(cleanupSnapshot.childNodeNames).toContain('BR');
  expect(cleanupSnapshot.innerHTML).toContain('hello<br>');
  expect(cleanupSnapshot.innerHTML).not.toContain('/&nbsp;');
  expect(cleanupSnapshot.innerHTML).not.toContain('/ ');
});

test('keeps the popup closed if the composer detaches while trigger resolution is pending', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await installTriggerDetachmentWatcher(page);

  const composer = page.getByTestId('prompt-textarea');
  await composer.click();
  await page.keyboard.type('/ ');

  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-trigger-result',
    'contenteditable-match',
  );
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const state = window as TriggerWindowState;
      return state.__promptitComposerDetached ?? false;
    });
  }).toBe(true);

  // Give the async prompt read time to finish and surface the stale-open bug.
  await page.waitForTimeout(150);

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const state = window as TriggerWindowState;
      return state.__promptitPopupOpened ?? false;
    });
  }).toBe(false);
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const composer = document.querySelector('#prompt-textarea');
      return composer?.isConnected ?? false;
    });
  }).toBe(false);
});

test('closes an already-open popup when the composer is removed and does not reopen', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await expect(
    page.locator('[data-testid="promptit-popup-host"]'),
  ).toHaveCount(1);

  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    composer.remove();
  });

  await waitForPromptPopupToClose(page);
  await expect(
    page.locator('[data-testid="promptit-popup-host"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId('prompt-textarea')).toHaveCount(0);

  await page.evaluate(() => {
    window.scrollBy(0, 1);
    const marker = document.createElement('span');
    document.body.append(marker);
    marker.remove();
  });

  await expect(
    page.locator('[data-testid="promptit-popup-host"]'),
  ).toHaveCount(0);
});

test('does not open the popup when only a slash is typed', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  const composer = await page.getByTestId('prompt-textarea');
  await composer.click();
  await page.keyboard.type('/');

  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-trigger-result',
    'contenteditable-no-match',
  );
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('/');
});

test('shows an error toast when prompt storage cannot be read for the trigger', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    failPromptRead: true,
  });

  const composer = await page.getByTestId('prompt-textarea');
  await composer.click();
  await page.keyboard.type('/ ');

  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not read the prompt list.');
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('/ ');
});

test('shows an error toast when trigger cleanup fails', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await openPromptPopup(page);
  await replaceComposerTextWithoutInputEvent(page, 'x');
  await page.keyboard.press('Escape');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not clean up the input field.');
  await expect(await getComposerText(page)).toBe('x');
});

test('does not open the popup when the selection is not collapsed', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await setContenteditableComposerState(page, {
    text: '/ ',
    selectionStart: 0,
    selectionEnd: 2,
  });
  await dispatchComposerInput(page, 'insertText', ' ');

  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-trigger-result',
    'contenteditable-no-selection',
  );
  await waitForPromptPopupToClose(page);
});

test('does not open across a contenteditable br line boundary', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await dispatchLineBoundaryComposerInput(page);
  await page.waitForTimeout(150);

  await expect(
    page.locator('[data-testid="promptit-popup-host"]'),
  ).toHaveCount(0);
  await expect
    .poll(async () => await getComposerText(page))
    .toBe('/ ');
});

test('does not open across contenteditable block boundaries', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await dispatchBlockBoundaryComposerInput(page);
  await page.waitForTimeout(150);

  await expect(
    page.locator('[data-testid="promptit-popup-host"]'),
  ).toHaveCount(0);
  await expect
    .poll(async () => await getComposerText(page))
    .toBe('/ ');
});

test('opens across inline wrappers within one contenteditable line', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await dispatchInlineWrapperComposerInput(page);

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-trigger-result',
    'contenteditable-match',
  );

  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe(
    '영문으로 자연스럽게 번역해줘.',
  );
});

test('waits for compositionend before opening the popup', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    composer.dispatchEvent(
      new CompositionEvent('compositionstart', {
        bubbles: true,
        data: '/',
      }),
    );
  });
  await setContenteditableComposerState(page, {
    text: '/ ',
  });
  await dispatchComposerInput(page, 'insertCompositionText', ' ');

  await page.waitForTimeout(150);
  await waitForPromptPopupToClose(page);

  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    composer.dispatchEvent(
      new CompositionEvent('compositionend', {
        bubbles: true,
        data: ' ',
      }),
    );
  });

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
});

test('does not treat IME keydown events as popup commands while composing', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);
  await dispatchComposerCompositionEvent(page, 'compositionstart', 'あ');

  for (const key of ['Enter', 'Escape', 'Backspace']) {
    const keydown = await dispatchComposerKeydown(page, key);

    expect(keydown.defaultPrevented).toBe(false);
    await expect(await getPopupStateSnapshot(page)).toMatchObject({
      isBusy: false,
      isVisible: true,
    });
    await expect(await getComposerText(page)).toBe('/ ');
  }
});

test('keeps an already-open popup usable immediately after compositionend', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  const initialActiveCell = await getActivePopupCellLabel(page);

  await dispatchComposerCompositionEvent(page, 'compositionstart', '한');
  await dispatchComposerCompositionEvent(page, 'compositionend', '한');

  await expect(page.locator('[data-testid="promptit-popup-host"]')).toHaveCount(1);
  await expect(await getActivePopupCellLabel(page)).toBe(initialActiveCell);

  const keydown = await dispatchComposerKeydown(page, 'Enter');

  expect(keydown.defaultPrevented).toBe(true);
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe(
    '영문으로 자연스럽게 번역해줘.',
  );
});

test('ignores a stale prompt insertion after the composer is detached', async ({
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

  await detachComposerAndTrackText(page);
  await waitForPromptPopupToClose(page);

  await dispatchPromptitTestEvent(
    page,
    'promptit:test-release-prompt-body-read',
  );
  await page.waitForTimeout(50);

  await expect(
    page.locator('[data-testid="promptit-popup-host"]'),
  ).toHaveCount(0);
  await expect(await getDetachedComposerText(page)).toBe('/ ');
});

test('resets composing state after a popup closes during IME input', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await dispatchComposerCompositionEvent(page, 'compositionstart', 'あ');
  await dispatchComposerInput(page, 'insertCompositionText', 'あ');
  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
  });
  await waitForPromptPopupToClose(page);

  await clearComposer(page);
  await openPromptPopup(page);
});

test('recognizes a non-breaking-space trigger in the contenteditable composer', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await setContenteditableComposerState(page, {
    text: '/\u00A0',
  });
  await dispatchComposerInput(page, 'insertText', '\u00A0');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-trigger-result',
    'contenteditable-match',
  );
});

test('replaces the trigger text in the textarea fallback fixture', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe(
    '영문으로 자연스럽게 번역해줘.',
  );
});

test('ignores readonly and disabled textarea composers', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLTextAreaElement)) {
      throw new Error('Textarea composer not found.');
    }

    composer.readOnly = true;
    composer.value = '/ ';
    composer.selectionStart = composer.value.length;
    composer.selectionEnd = composer.value.length;
    composer.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
  });
  await page.waitForTimeout(150);
  await waitForPromptPopupToClose(page);

  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLTextAreaElement)) {
      throw new Error('Textarea composer not found.');
    }

    composer.readOnly = false;
    composer.disabled = true;
    composer.dispatchEvent(
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

test('scrolls the popup list to keep the active row visible', async ({
  extension,
}) => {
  await extension.setPromptRecords(
    Array.from({ length: 7 }, (_, index) =>
      createPromptRecord({
        id: `prompt-${index + 1}`,
        title: `프롬프트 ${index + 1}`,
        content: `내용 ${index + 1}`,
        normalOrder: index,
        createdAt: new Date(
          `2026-03-29T00:0${index}:00.000Z`,
        ).toISOString(),
        updatedAt: new Date(
          `2026-03-29T00:0${index}:00.000Z`,
        ).toISOString(),
      }),
    ),
  );

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('ArrowDown');
  }

  await expect(await getActivePopupCellLabel(page)).toBe(
    'Insert prompt: 프롬프트 7',
  );
  await expect
    .poll(async () => await getPopupListScrollTop(page))
    .toBeGreaterThan(0);
});

test('keeps keyboard navigation active while the hovered popup cell scrolls out from under a stationary pointer', async ({
  extension,
}) => {
  await extension.setPromptRecords(
    Array.from({ length: 7 }, (_, index) =>
      createPromptRecord({
        id: `prompt-${index + 1}`,
        title: `프롬프트 ${index + 1}`,
        content: `내용 ${index + 1}`,
        normalOrder: index,
        createdAt: new Date(
          `2026-03-29T00:0${index}:00.000Z`,
        ).toISOString(),
        updatedAt: new Date(
          `2026-03-29T00:0${index}:00.000Z`,
        ).toISOString(),
      }),
    ),
  );

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  const hoveredCopyButton = page.getByRole('button', {
    name: 'Copy prompt: 프롬프트 2',
  });

  await hoveredCopyButton.hover();
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Copy prompt: 프롬프트 2',
  );

  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press('ArrowDown');
  }

  await expect(await getActivePopupCellLabel(page)).toBe(
    'Copy prompt: 프롬프트 7',
  );
  await expect
    .poll(async () => await getPopupListScrollTop(page))
    .toBeGreaterThan(0);
});

test('repositions the open popup on window scroll instead of closing', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await page.evaluate(() => {
    const form = document.querySelector('.composer-form');

    if (!(form instanceof HTMLElement)) {
      throw new Error('Composer form not found.');
    }

    const topSpacer = document.createElement('div');
    topSpacer.style.height = '720px';
    const bottomSpacer = document.createElement('div');
    bottomSpacer.style.height = '720px';
    form.before(topSpacer);
    form.after(bottomSpacer);
    window.scrollTo(0, 500);
  });

  await openPromptPopup(page);
  const beforePosition = await getPopupPositionSnapshot(page);

  await page.evaluate(() => {
    window.scrollBy(0, 120);
  });

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => {
      const snapshot = await getPopupPositionSnapshot(page);
      return Math.abs(snapshot.popupTop - beforePosition.popupTop) > 20;
    })
    .toBe(true);

  const afterPosition = await getPopupPositionSnapshot(page);
  const isAnchoredBelow = afterPosition.popupTop >= afterPosition.anchorBottom;
  const isAnchoredAbove = afterPosition.popupBottom <= afterPosition.anchorTop;

  expect(isAnchoredBelow || isAnchoredAbove).toBe(true);
  expect(afterPosition.popupTop).toBeGreaterThanOrEqual(0);
  expect(afterPosition.popupBottom).toBeLessThanOrEqual(
    afterPosition.viewportHeight,
  );
});

test('positions the popup above or below based on available space', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const belowPage = await extension.context.newPage();
  await belowPage.setViewportSize({ width: 1280, height: 960 });
  await openFixturePage(belowPage, TEXTAREA_FIXTURE_URL);
  await openPromptPopup(belowPage);

  const belowPosition = await getPopupPositionSnapshot(belowPage);
  await expect(belowPosition.popupTop).toBeGreaterThanOrEqual(
    belowPosition.anchorBottom,
  );

  const abovePage = await extension.context.newPage();
  await abovePage.setViewportSize({ width: 1180, height: 540 });
  await openFixturePage(abovePage, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(abovePage);

  const abovePosition = await getPopupPositionSnapshot(abovePage);
  await expect(abovePosition.popupTop).toBeLessThan(abovePosition.anchorTop);
});
