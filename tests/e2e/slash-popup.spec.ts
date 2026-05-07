import { expect, test as base } from '@playwright/test';
import { STARTER_PROMPT_ID } from '../../src/prompt/schema';

import { launchExtension, type LoadedExtension } from '../playwright/extension';
import {
  clearComposer,
  CONTENTEDITABLE_FIXTURE_URL,
  createPromptItem,
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
} from '../playwright/promptit';

const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await use(extension);
    await extension.close();
  },
});

const basePrompts = [
  createPromptItem({
    id: 'prompt-translate',
    title: '번역',
    content: '영문으로 자연스럽게 번역해줘.',
    sortOrder: 10,
  }),
  createPromptItem({
    id: 'prompt-minutes',
    title: '회의록',
    content: '회의록으로 정리해줘.',
    sortOrder: 20,
    createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
  }),
];

async function setContenteditableComposerState(
  page: Parameters<typeof getComposerText>[0],
  options: {
    text: string;
    selectionStart?: number;
    selectionEnd?: number;
  },
): Promise<void> {
  const selectionStart = options.selectionStart ?? options.text.length;
  const selectionEnd = options.selectionEnd ?? selectionStart;

  await page.evaluate(
    ({ text, start, end }) => {
      const composer = document.querySelector('#prompt-textarea');

      if (!(composer instanceof HTMLElement)) {
        throw new Error('Composer not found.');
      }

      composer.textContent = text;
      composer.focus();

      const textNode = composer.firstChild;
      const selection = window.getSelection();

      if (!(textNode instanceof Text) || !selection) {
        throw new Error('Failed to prepare selection.');
      }

      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      selection.removeAllRanges();
      selection.addRange(range);
    },
    {
      text: options.text,
      start: selectionStart,
      end: selectionEnd,
    },
  );
}

async function dispatchComposerInput(
  page: Parameters<typeof getComposerText>[0],
  inputType: string,
  data: string | null,
): Promise<void> {
  await page.evaluate(
    ({ nextInputType, nextData }) => {
      const composer = document.querySelector('#prompt-textarea');

      if (!(composer instanceof HTMLElement)) {
        throw new Error('Composer not found.');
      }

      composer.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: nextInputType,
          data: nextData,
        }),
      );
    },
    {
      nextInputType: inputType,
      nextData: data,
    },
  );
}

type TriggerWindowState = Window & {
  __promptitPopupOpened?: boolean;
  __promptitComposerDetached?: boolean;
};

async function installTriggerDetachmentWatcher(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(() => {
    const state = window as TriggerWindowState;
    state.__promptitPopupOpened = false;
    state.__promptitComposerDetached = false;

    const popupObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }

          if (
            node.matches('[data-testid="promptit-popup-host"]') ||
            node.querySelector('[data-testid="promptit-popup-host"]')
          ) {
            state.__promptitPopupOpened = true;
          }
        }
      }
    });

    popupObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const watchTriggerResult = (): void => {
      if (state.__promptitComposerDetached) {
        return;
      }

      if (
        document.documentElement.getAttribute(
          'data-promptit-trigger-result',
        ) !== 'contenteditable-match'
      ) {
        window.setTimeout(watchTriggerResult, 0);
        return;
      }

      const composer = document.querySelector('#prompt-textarea');

      if (!(composer instanceof HTMLElement)) {
        return;
      }

      state.__promptitComposerDetached = true;
      composer.remove();
    };

    watchTriggerResult();
  });
}

async function dispatchComposerCompositionEvent(
  page: Parameters<typeof getComposerText>[0],
  type: 'compositionstart' | 'compositionend',
  data: string,
): Promise<void> {
  await page.evaluate(
    ({ nextType, nextData }) => {
      const composer = document.querySelector('#prompt-textarea');

      if (!(composer instanceof HTMLElement)) {
        throw new Error('Composer not found.');
      }

      composer.dispatchEvent(
        new CompositionEvent(nextType, {
          bubbles: true,
          data: nextData,
        }),
      );
    },
    {
      nextType: type,
      nextData: data,
    },
  );
}

async function setMultilineContenteditableComposerState(
  page: Parameters<typeof getComposerText>[0],
  options: {
    prefix: string;
    trigger: string;
  },
): Promise<void> {
  await page.evaluate(
    ({ nextPrefix, nextTrigger }) => {
      const composer = document.querySelector('#prompt-textarea');

      if (!(composer instanceof HTMLElement)) {
        throw new Error('Composer not found.');
      }

      const prefixNode = document.createTextNode(nextPrefix);
      const lineBreak = document.createElement('br');
      const triggerNode = document.createTextNode(nextTrigger);

      composer.replaceChildren(prefixNode, lineBreak, triggerNode);
      composer.focus();

      const selection = window.getSelection();

      if (!selection) {
        throw new Error('Selection not found.');
      }

      const range = document.createRange();
      range.setStart(triggerNode, triggerNode.data.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    },
    {
      nextPrefix: options.prefix,
      nextTrigger: options.trigger,
    },
  );
}

async function getComposerDomSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  childNodeNames: string[];
  innerHTML: string;
  textContent: string;
}> {
  return await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    return {
      childNodeNames: Array.from(composer.childNodes, (node) => node.nodeName),
      innerHTML: composer.innerHTML,
      textContent: composer.textContent ?? '',
    };
  });
}

async function getPopupPositionSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  popupTop: number;
  popupLeft: number;
  anchorTop: number;
  anchorBottom: number;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');
    const composer = document.querySelector('#prompt-textarea');
    const anchor = composer?.closest('form');

    if (!(host instanceof HTMLDivElement) || !(anchor instanceof HTMLElement)) {
      throw new Error('Popup host or anchor not found.');
    }

    const anchorRect = anchor.getBoundingClientRect();

    return {
      popupTop: Number.parseFloat(host.style.top),
      popupLeft: Number.parseFloat(host.style.left),
      anchorTop: anchorRect.top,
      anchorBottom: anchorRect.bottom,
    };
  });
}

async function getPopupWidthSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  popupWidth: number;
  formWidth: number;
  surfaceWidth: number;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');
    const composer = document.querySelector('#prompt-textarea');
    const form = composer?.closest('form');
    const surface = composer?.closest('.composer-surface');

    if (
      !(host instanceof HTMLDivElement) ||
      !(form instanceof HTMLElement) ||
      !(surface instanceof HTMLElement)
    ) {
      throw new Error('Popup host, form, or composer surface not found.');
    }

    return {
      popupWidth: host.getBoundingClientRect().width,
      formWidth: form.getBoundingClientRect().width,
      surfaceWidth: surface.getBoundingClientRect().width,
    };
  });
}

async function getPopupListScrollTop(
  page: Parameters<typeof getComposerText>[0],
): Promise<number> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');

    if (!(host instanceof HTMLDivElement)) {
      throw new Error('Popup host not found.');
    }

    const list = host.shadowRoot?.querySelector('[data-role="prompt-list"]');

    if (!(list instanceof HTMLElement)) {
      throw new Error('Popup list not found.');
    }

    return list.scrollTop;
  });
}

test('opens the slash popup from the contenteditable fixture', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect(page.locator('[data-testid="promptit-popup-host"]')).toBeVisible();
  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(await getPopupTitles(page)).toEqual(['번역', '회의록']);
});

test('matches the ChatGPT popup width to the composer form wrapper', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  const snapshot = await getPopupWidthSnapshot(page);

  expect(Math.abs(snapshot.popupWidth - snapshot.formWidth)).toBeLessThan(1);
  expect(snapshot.popupWidth).toBeGreaterThan(snapshot.surfaceWidth + 80);
});

test('inserts the active prompt into the contenteditable fixture', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe(
    '영문으로 자연스럽게 번역해줘.',
  );
});

test('copies the selected prompt and clears the trigger text', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);
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

test('cleans up the trigger text on escape and backspace', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

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
  await extension.setPrompts(basePrompts);

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
  await extension.setPrompts(basePrompts);

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
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('');
});

test('updates the open popup when prompt storage changes', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await extension.setPrompts([
    basePrompts[0],
    createPromptItem({
      id: basePrompts[1].id,
      title: '회의록 업데이트',
      content: basePrompts[1].content,
      sortOrder: basePrompts[1].sortOrder,
      createdAt: basePrompts[1].createdAt,
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
  ]);

  await expect
    .poll(async () => await getPopupTitles(page))
    .toEqual(['번역', '회의록 업데이트']);
});

test('normalizes invalid storage entries before rendering the popup', async ({
  extension,
}) => {
  await extension.setRawPrompts([
    {
      id: STARTER_PROMPT_ID,
      title: 'starter',
      content: 'starter content',
      sortOrder: 0,
      createdAt: new Date('2026-03-29T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:00:00.000Z').toISOString(),
    },
    { id: 'broken', title: '', content: '', sortOrder: 'bad' },
    createPromptItem({
      id: 'prompt-later',
      title: '나중 순서',
      content: '두 번째',
      sortOrder: 9,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
    createPromptItem({
      id: 'prompt-earlier',
      title: '먼저 순서',
      content: '첫 번째',
      sortOrder: 2,
      createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    }),
  ]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect(await getPopupTitles(page)).toEqual([
    '먼저 순서',
    '나중 순서',
  ]);
  await expect
    .poll(async () =>
      (await extension.getPrompts()).map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
      })),
    )
    .toEqual([
      { id: 'prompt-earlier', title: '먼저 순서' },
      { id: 'prompt-later', title: '나중 순서' },
    ]);
});

test('opens the options page from the popup empty state', async ({
  extension,
}) => {
  await extension.setPrompts([]);

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

  await expect(optionsPage).toHaveTitle(/Promptit Settings/i);
  await expect(await getComposerText(page)).toBe('');
});

test('opens options and closes the popup when trigger cleanup fails', async ({
  extension,
}) => {
  await extension.setPrompts([]);

  const page = await extension.context.newPage();
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await openPromptPopup(page);
  await replaceComposerTextWithoutInputEvent(page, 'x');

  const optionsPagePromise = extension.context.waitForEvent('page');
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  const optionsPage = await optionsPagePromise;
  await optionsPage.waitForLoadState('domcontentloaded');

  await expect(optionsPage).toHaveTitle(/Promptit Settings/i);
  await expect(await getComposerText(page)).toBe('x');
});

test('shows an error toast when the background fails to open options and keeps the popup open', async ({
  extension,
}) => {
  await extension.setPrompts([]);

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
    .toBe('설정 페이지를 열지 못했습니다.');
  await expect(optionsPagePromise).rejects.toThrow(/Timeout/);
  await expect.poll(async () => {
    return await page.evaluate(() => document.activeElement?.id ?? null);
  }).toBe('prompt-textarea');
});

test('updates the active cell on hover and inserts a prompt on title click', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

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
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await openPromptPopup(page);
  await replaceComposerTextWithoutInputEvent(page, 'x');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('[promptit] Adapter failed to insert prompt content.');
  await expect(await getComposerText(page)).toBe('x');
});

test('preserves the multiline break when inserting and cleaning up a prompt from contenteditable', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

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
  await extension.setPrompts(basePrompts);

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

test('copies a prompt through the mouse click path', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);
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

test('shows an error toast when copying fails and keeps the popup open', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

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
    .toBe('프롬프트 복사에 실패했습니다.');
  await expect.poll(async () => {
    return await page.evaluate(() => document.activeElement?.id ?? null);
  }).toBe('prompt-textarea');
});

test('does not open the popup when only a slash is typed', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  const composer = await page.getByTestId('prompt-textarea');
  await composer.click();
  await page.keyboard.type('/');
  await page.waitForTimeout(150);

  await waitForPromptPopupToClose(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-trigger-result',
    'contenteditable-no-match',
  );
  await expect(await getComposerText(page)).toBe('/');
});

test('shows an error toast when prompt storage cannot be read for the trigger', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    failPromptRead: true,
  });

  const composer = await page.getByTestId('prompt-textarea');
  await composer.click();
  await page.keyboard.type('/ ');
  await page.waitForTimeout(150);

  await waitForPromptPopupToClose(page);
  await expect
    .poll(async () => await getToastText(page))
    .toBe('프롬프트 목록을 읽지 못했습니다.');
  await expect(await getComposerText(page)).toBe('/ ');
});

test('shows an error toast when trigger cleanup fails', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, TEXTAREA_FIXTURE_URL);

  await openPromptPopup(page);
  await replaceComposerTextWithoutInputEvent(page, 'x');
  await page.keyboard.press('Escape');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('입력창 정리에 실패했습니다.');
  await expect(await getComposerText(page)).toBe('x');
});

test('does not open the popup when the selection is not collapsed', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await setContenteditableComposerState(page, {
    text: '/ ',
    selectionStart: 0,
    selectionEnd: 2,
  });
  await dispatchComposerInput(page, 'insertText', ' ');

  await page.waitForTimeout(150);

  await waitForPromptPopupToClose(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-trigger-result',
    'contenteditable-no-selection',
  );
});

test('waits for compositionend before opening the popup', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

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

test('resets composing state after a popup closes during IME input', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await dispatchComposerCompositionEvent(page, 'compositionstart', 'あ');
  await dispatchComposerInput(page, 'insertCompositionText', 'あ');
  await waitForPromptPopupToClose(page);

  await clearComposer(page);
  await openPromptPopup(page);
});

test('recognizes a non-breaking-space trigger in the contenteditable composer', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

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
  await extension.setPrompts(basePrompts);

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
  await extension.setPrompts(basePrompts);

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
  await extension.setPrompts(
    Array.from({ length: 7 }, (_, index) =>
      createPromptItem({
        id: `prompt-${index + 1}`,
        title: `프롬프트 ${index + 1}`,
        content: `내용 ${index + 1}`,
        sortOrder: index,
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
  await extension.setPrompts(
    Array.from({ length: 7 }, (_, index) =>
      createPromptItem({
        id: `prompt-${index + 1}`,
        title: `프롬프트 ${index + 1}`,
        content: `내용 ${index + 1}`,
        sortOrder: index,
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

test('positions the popup above or below based on available space', async ({
  extension,
}) => {
  await extension.setPrompts(basePrompts);

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
