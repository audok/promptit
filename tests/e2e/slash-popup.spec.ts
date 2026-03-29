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

test('shows an error toast when opening options fails and keeps the popup open', async ({
  extension,
}) => {
  await extension.setPrompts([]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    failOpenOptions: true,
  });
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('설정 페이지를 열지 못했습니다.');
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
    .poll(async () => {
      return await page.evaluate(() => {
        const host = document.querySelector('[data-testid="promptit-popup-host"]');

        if (!(host instanceof HTMLDivElement)) {
          return 0;
        }

        const list = host.shadowRoot?.querySelector('[data-role="prompt-list"]');

        return list instanceof HTMLElement ? list.scrollTop : 0;
      });
    })
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
