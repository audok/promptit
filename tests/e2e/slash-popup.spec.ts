import { expect, test as base, type Page } from '@playwright/test';
import { STARTER_PROMPT_ID, type PromptRecord } from '../../src/prompt/schema';

import { launchExtension, type LoadedExtension } from '../playwright/extension';
import {
  clearComposer,
  CONTENTEDITABLE_FIXTURE_URL,
  createLegacyPromptItem,
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
  createPromptRecord({
    id: 'prompt-translate',
    title: '번역',
    content: '영문으로 자연스럽게 번역해줘.',
    sortOrder: 10,
  }),
  createPromptRecord({
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

async function dispatchNestedChildComposerInput(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    const child = document.createElement('span');
    child.textContent = '/ ';
    composer.replaceChildren(child);
    composer.focus();

    const textNode = child.firstChild;
    const selection = window.getSelection();

    if (!(textNode instanceof Text) || !selection) {
      throw new Error('Failed to prepare child selection.');
    }

    const range = document.createRange();
    range.setStart(textNode, textNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    child.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
  });
}

type TriggerWindowState = Window & {
  __promptitDetachedComposer?: HTMLElement;
  __promptitDetachedComposerText?: string | null;
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

async function detachComposerAndTrackText(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    (window as TriggerWindowState).__promptitDetachedComposerText =
      composer.textContent ?? '';
    (window as TriggerWindowState).__promptitDetachedComposer = composer;
    composer.remove();
  });
}

async function getDetachedComposerText(
  page: Parameters<typeof getComposerText>[0],
): Promise<string | null> {
  return await page.evaluate(() => {
    const state = window as TriggerWindowState;

    return (
      state.__promptitDetachedComposer?.textContent ??
      state.__promptitDetachedComposerText ??
      null
    );
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

async function dispatchComposerKeydown(
  page: Parameters<typeof getComposerText>[0],
  key: string,
): Promise<{ defaultPrevented: boolean }> {
  return await page.evaluate((nextKey) => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: nextKey,
    });

    composer.dispatchEvent(event);

    return {
      defaultPrevented: event.defaultPrevented,
    };
  }, key);
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

async function dispatchBlockBoundaryComposerInput(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    document.documentElement.setAttribute(
      'data-promptit-trigger-result',
      'pending',
    );

    const slashBlock = document.createElement('p');
    slashBlock.textContent = '/';

    const spaceBlock = document.createElement('p');
    spaceBlock.textContent = ' ';

    composer.replaceChildren(slashBlock, spaceBlock);
    composer.focus();

    const textNode = spaceBlock.firstChild;
    const selection = window.getSelection();

    if (!(textNode instanceof Text) || !selection) {
      throw new Error('Failed to prepare block-boundary selection.');
    }

    const range = document.createRange();
    range.setStart(textNode, textNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    composer.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
  });
}

async function dispatchLineBoundaryComposerInput(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    document.documentElement.setAttribute(
      'data-promptit-trigger-result',
      'pending',
    );

    const slashNode = document.createTextNode('/');
    const lineBreak = document.createElement('br');
    const spaceNode = document.createTextNode(' ');

    composer.replaceChildren(slashNode, lineBreak, spaceNode);
    composer.focus();

    const selection = window.getSelection();

    if (!selection) {
      throw new Error('Selection not found.');
    }

    const range = document.createRange();
    range.setStart(spaceNode, spaceNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    composer.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
  });
}

async function dispatchInlineWrapperComposerInput(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');

    if (!(composer instanceof HTMLElement)) {
      throw new Error('Composer not found.');
    }

    const slashWrapper = document.createElement('span');
    slashWrapper.textContent = '/';

    const spaceWrapper = document.createElement('strong');
    spaceWrapper.textContent = ' ';

    composer.replaceChildren(slashWrapper, spaceWrapper);
    composer.focus();

    const spaceNode = spaceWrapper.firstChild;
    const selection = window.getSelection();

    if (!(spaceNode instanceof Text) || !selection) {
      throw new Error('Failed to prepare inline-wrapper selection.');
    }

    const range = document.createRange();
    range.setStart(spaceNode, spaceNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    composer.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
  });
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

async function getPopupStateSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  actionButtonCount: number;
  ariaBusy: string | null;
  disabledActionButtonCount: number;
  isBusy: boolean;
  isVisible: boolean;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');
    const card = host?.shadowRoot?.querySelector('[data-testid="promptit-popup"]');

    if (!(host instanceof HTMLElement) || !(card instanceof HTMLElement)) {
      return {
        actionButtonCount: 0,
        ariaBusy: null,
        disabledActionButtonCount: 0,
        isBusy: false,
        isVisible: false,
      };
    }

    const actionButtons = Array.from(
      host.shadowRoot?.querySelectorAll<HTMLButtonElement>('button[data-action]') ?? [],
    );

    return {
      actionButtonCount: actionButtons.length,
      ariaBusy: card.getAttribute('aria-busy'),
      disabledActionButtonCount: actionButtons.filter((button) => button.disabled)
        .length,
      isBusy: card.classList.contains('is-busy'),
      isVisible: true,
    };
  });
}

async function getPopupAccessibilitySnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  activeCellAriaCurrent: string | null;
  activeCellLabel: string | null;
  activeStatusAtomic: string | null;
  activeStatusLive: string | null;
  activeStatusText: string | null;
  cardAriaModal: string | null;
  cardLabel: string | null;
  cardRole: string | null;
  listLabel: string | null;
  listRole: string | null;
  rowRoles: Array<string | null>;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');
    const root = host?.shadowRoot;
    const card = root?.querySelector('[data-testid="promptit-popup"]');
    const list = root?.querySelector('[data-role="prompt-list"]');
    const activeCell = root?.querySelector(
      '[data-role="prompt-cell"][aria-current="true"]',
    );
    const activeStatus = root?.querySelector('[data-role="active-cell-status"]');
    const rows = Array.from(
      root?.querySelectorAll('[data-role="prompt-row"]') ?? [],
    );

    if (
      !(host instanceof HTMLElement) ||
      !root ||
      !(card instanceof HTMLElement)
    ) {
      throw new Error('Popup accessibility snapshot could not find the popup.');
    }

    return {
      activeCellAriaCurrent:
        activeCell instanceof HTMLElement
          ? activeCell.getAttribute('aria-current')
          : null,
      activeCellLabel:
        activeCell instanceof HTMLElement
          ? activeCell.getAttribute('aria-label')
          : null,
      activeStatusAtomic:
        activeStatus instanceof HTMLElement
          ? activeStatus.getAttribute('aria-atomic')
          : null,
      activeStatusLive:
        activeStatus instanceof HTMLElement
          ? activeStatus.getAttribute('aria-live')
          : null,
      activeStatusText:
        activeStatus instanceof HTMLElement ? activeStatus.textContent : null,
      cardAriaModal: card.getAttribute('aria-modal'),
      cardLabel: card.getAttribute('aria-label'),
      cardRole: card.getAttribute('role'),
      listLabel:
        list instanceof HTMLElement
          ? list.getAttribute('aria-label') ??
            list.getAttribute('aria-labelledby')
          : null,
      listRole: list instanceof HTMLElement ? list.getAttribute('role') : null,
      rowRoles: rows.map((row) =>
        row instanceof HTMLElement ? row.getAttribute('role') : null,
      ),
    };
  });
}

async function getToastAccessibilitySnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  atomic: string | null;
  live: string | null;
  role: string | null;
  text: string | null;
  variant: string | null;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-promptit-toast-host]');
    const content = host?.shadowRoot?.querySelector('[data-role="toast-content"]');

    if (!(host instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      throw new Error('Toast accessibility snapshot could not find the toast.');
    }

    return {
      atomic: content.getAttribute('aria-atomic'),
      live: content.getAttribute('aria-live'),
      role: content.getAttribute('role'),
      text: content.textContent,
      variant: content.dataset.variant ?? null,
    };
  });
}

async function getActiveElementSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  id: string;
  testId: string | null;
  text: string;
}> {
  return await page.evaluate(() => {
    const element = document.activeElement;

    if (!(element instanceof HTMLElement)) {
      return {
        id: '',
        testId: null,
        text: '',
      };
    }

    return {
      id: element.id,
      testId: element.dataset.testid ?? null,
      text: element.textContent?.trim() ?? '',
    };
  });
}

async function waitForPromptBodyReadPending(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(async () => {
    const pendingRead = (
      window as Window & {
        __promptitPromptBodyReadPending?: Promise<void>;
      }
    ).__promptitPromptBodyReadPending;

    if (!pendingRead) {
      throw new Error('Prompt body read pending listener was not armed.');
    }

    await pendingRead;
  });
}

async function armPromptBodyReadPendingListener(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(() => {
    (
      window as Window & {
        __promptitPromptBodyReadPending?: Promise<void>;
      }
    ).__promptitPromptBodyReadPending = new Promise<void>((resolve) => {
      document.addEventListener(
        'promptit:test-prompt-body-read-pending',
        () => resolve(),
        { once: true },
      );
    });
  });
}

async function getPopupPositionSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  popupTop: number;
  popupLeft: number;
  popupBottom: number;
  anchorTop: number;
  anchorBottom: number;
  viewportHeight: number;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');
    const composer = document.querySelector('#prompt-textarea');
    const anchor = composer?.closest('form');
    const card = host?.shadowRoot?.querySelector(
      '[data-testid="promptit-popup"]',
    );

    if (
      !(host instanceof HTMLDivElement) ||
      !(anchor instanceof HTMLElement) ||
      !(card instanceof HTMLElement)
    ) {
      throw new Error('Popup host, popup card, or anchor not found.');
    }

    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = card.getBoundingClientRect();

    return {
      popupTop: Number.parseFloat(host.style.top),
      popupLeft: Number.parseFloat(host.style.left),
      popupBottom: popupRect.bottom,
      anchorTop: anchorRect.top,
      anchorBottom: anchorRect.bottom,
      viewportHeight: window.innerHeight,
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

async function installTinyPopupAnchorRect(
  page: Parameters<typeof getComposerText>[0],
): Promise<void> {
  await page.evaluate(() => {
    const composer = document.querySelector('#prompt-textarea');
    const form = composer?.closest('form');

    if (!(composer instanceof HTMLElement) || !(form instanceof HTMLElement)) {
      throw new Error('Composer or form not found.');
    }

    const anchorRect = new DOMRect(96, 420, 1, 132);

    for (const element of [composer, form]) {
      Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => anchorRect,
      });
    }
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

function getPopupPinButton(
  page: Page,
  title: string,
  options: { pinned?: boolean } = {},
) {
  return page.getByRole('button', {
    name: `${options.pinned ? 'Unpin' : 'Pin'} prompt: ${title}`,
  });
}

async function expectPopupPromptOrder(
  page: Page,
  titles: string[],
): Promise<void> {
  await expect.poll(async () => await getPopupTitles(page)).toEqual(titles);
}

async function expectStoredPromptPinned(
  extension: LoadedExtension,
  id: string,
  pinned: boolean,
): Promise<void> {
  await expect
    .poll(async () => {
      return (await extension.getPromptRecords()).find(
        (prompt) => prompt.id === id,
      )?.pinned ?? null;
    })
    .toBe(pinned);
}

async function setPromptRecordsWithoutRevision(
  extension: LoadedExtension,
  records: PromptRecord[],
): Promise<void> {
  const serviceWorker =
    extension.context.serviceWorkers()[0] ??
    (await extension.context.waitForEvent('serviceworker'));

  await serviceWorker.evaluate(async (nextRecords) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('promptit', 1);

      request.onupgradeneeded = () => {
        const nextDatabase = request.result;

        if (!nextDatabase.objectStoreNames.contains('promptMetas')) {
          nextDatabase.createObjectStore('promptMetas', { keyPath: 'id' });
        }

        if (!nextDatabase.objectStoreNames.contains('promptBodies')) {
          nextDatabase.createObjectStore('promptBodies', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('Failed to open prompt IndexedDB.'));
      };
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        ['promptMetas', 'promptBodies'],
        'readwrite',
      );
      const metaStore = transaction.objectStore('promptMetas');
      const bodyStore = transaction.objectStore('promptBodies');

      metaStore.clear();
      bodyStore.clear();

      for (const record of nextRecords) {
        const { content, ...meta } = record;
        metaStore.put(meta);
        bodyStore.put({
          id: record.id,
          content,
          updatedAt: record.bodyUpdatedAt,
        });
      }

      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('Failed to write prompt records.'));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error('Prompt write was aborted.'));
      };
    });
  }, records);
}

async function getPopupActionVisualSnapshot(
  page: Page,
  action: 'pin' | 'copy',
  title: string,
): Promise<{
  ariaPressed: string | null;
  badgeBackgroundColor: string;
  badgeBorderStyle: string;
  badgeBorderWidth: string;
  iconColor: string;
  iconFillColor: string;
  iconPathData: string;
}> {
  return await page.evaluate(({ nextAction, nextTitle }) => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');

    if (!(host instanceof HTMLDivElement) || !host.shadowRoot) {
      throw new Error('Popup host not found.');
    }

    const testId =
      nextAction === 'pin' ? 'promptit-pin-cell' : 'promptit-copy-cell';
    const buttons = Array.from(
      host.shadowRoot.querySelectorAll<HTMLButtonElement>(
        `[data-testid="${testId}"], button[data-column="${nextAction}"]`,
      ),
    );
    const button = buttons.find((candidate) => {
      const label = candidate.getAttribute('aria-label');
      return nextAction === 'pin'
        ? label === `Pin prompt: ${nextTitle}` ||
            label === `Unpin prompt: ${nextTitle}`
        : label === `Copy prompt: ${nextTitle}`;
    });

    if (!button) {
      throw new Error(`${nextAction} button for ${nextTitle} not found.`);
    }

    const badge = button.querySelector<HTMLElement>(
      '.promptit-row-action-badge',
    );
    const icon = button.querySelector<SVGElement>('.promptit-icon');
    const iconPath = button.querySelector<SVGPathElement>('.promptit-icon path');

    if (!badge || !icon || !iconPath) {
      throw new Error(`${nextAction} visual elements for ${nextTitle} not found.`);
    }

    const badgeStyle = getComputedStyle(badge);
    const iconStyle = getComputedStyle(icon);
    const iconPathStyle = getComputedStyle(iconPath);

    return {
      ariaPressed: button.getAttribute('aria-pressed'),
      badgeBackgroundColor: badgeStyle.backgroundColor,
      badgeBorderStyle: badgeStyle.borderTopStyle,
      badgeBorderWidth: badgeStyle.borderTopWidth,
      iconColor: iconStyle.color,
      iconFillColor: iconPathStyle.fill,
      iconPathData: iconPath.getAttribute('d') ?? '',
    };
  }, { nextAction: action, nextTitle: title });
}

test('opens the slash popup from the contenteditable fixture', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect(page.locator('[data-testid="promptit-popup-host"]')).toBeVisible();
  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(await getPopupTitles(page)).toEqual(['번역', '회의록']);
});

test('accessibility: exposes non-modal popup semantics and active cell live status', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect
    .poll(async () => await getPopupAccessibilitySnapshot(page))
    .toMatchObject({
      activeCellAriaCurrent: 'true',
      activeCellLabel: 'Insert prompt: 번역',
      activeStatusAtomic: 'true',
      activeStatusLive: 'polite',
      activeStatusText: 'Insert prompt: 번역',
      cardAriaModal: null,
      cardLabel: 'Promptit prompt picker',
      cardRole: 'region',
      listRole: 'list',
      rowRoles: ['listitem', 'listitem'],
    });
  expect((await getPopupAccessibilitySnapshot(page)).listLabel).toBeTruthy();

  await page.keyboard.press('ArrowDown');
  await expect
    .poll(async () => await getPopupAccessibilitySnapshot(page))
    .toMatchObject({
      activeCellAriaCurrent: 'true',
      activeCellLabel: 'Insert prompt: 회의록',
      activeStatusText: 'Insert prompt: 회의록',
    });

  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => await getPopupAccessibilitySnapshot(page))
    .toMatchObject({
      activeCellAriaCurrent: 'true',
      activeCellLabel: 'Copy prompt: 회의록',
      activeStatusText: 'Copy prompt: 회의록',
    });
});

test('toast live region attributes mark success announcements as polite status', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');

  await expect
    .poll(async () => await getToastAccessibilitySnapshot(page))
    .toMatchObject({
      atomic: 'true',
      live: 'polite',
      role: 'status',
      text: '프롬프트를 고정했습니다.',
      variant: 'success',
    });
});

test('toast live region attributes mark error announcements as assertive alerts', async ({
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

  await expect
    .poll(async () => await getToastAccessibilitySnapshot(page))
    .toMatchObject({
      atomic: 'true',
      live: 'assertive',
      role: 'alert',
      text: '프롬프트 복사에 실패했습니다.',
      variant: 'error',
    });
});

test('Tab closes the popup and leaves composer focus without trapping the trigger', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('Tab');

  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('');
  const activeElement = await getActiveElementSnapshot(page);

  expect(activeElement.id).not.toBe('prompt-textarea');
  expect(activeElement.testId).not.toBe('prompt-textarea');
});

test('matches the ChatGPT popup width to the composer form wrapper', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  const snapshot = await getPopupWidthSnapshot(page);

  expect(Math.abs(snapshot.popupWidth - snapshot.formWidth)).toBeLessThan(1);
  expect(snapshot.popupWidth).toBeGreaterThan(snapshot.surfaceWidth + 80);
});

test('keeps the ChatGPT popup width usable for a tiny anchor rect', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await setContenteditableComposerState(page, { text: '/ ' });
  await installTinyPopupAnchorRect(page);
  await dispatchComposerInput(page, 'insertText', ' ');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();

  const snapshot = await getPopupWidthSnapshot(page);

  expect(snapshot.formWidth).toBe(1);
  expect(snapshot.popupWidth).toBeGreaterThanOrEqual(300);
});

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
    .toBe('프롬프트 본문을 읽지 못했습니다.');
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
    sortOrder: 1,
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
    sortOrder: 1,
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
      sortOrder: basePrompts[1].normalOrder,
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

test('migrates valid legacy storage entries before rendering the popup', async ({
  extension,
}) => {
  await extension.setLegacyRawPrompts([
    {
      id: STARTER_PROMPT_ID,
      title: 'starter',
      content: 'starter content',
      sortOrder: 0,
      createdAt: new Date('2026-03-29T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:00:00.000Z').toISOString(),
    },
    { id: 'broken', title: '', content: '', sortOrder: 'bad' },
    createLegacyPromptItem({
      id: 'prompt-later',
      title: '나중 순서',
      content: '두 번째',
      sortOrder: 9,
      createdAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-29T00:02:00.000Z').toISOString(),
    }),
    createLegacyPromptItem({
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
      (await extension.getPromptRecords()).map((prompt) => ({
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

  await expect(optionsPage).toHaveTitle(/Promptit Settings/i);
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

  await expect(optionsPage).toHaveTitle(/Promptit Settings/i);
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
    .toBe('설정 페이지를 열지 못했습니다.');
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
    .toBe('[promptit] Adapter failed to insert prompt content.');
  await expect(await getComposerText(page)).toBe('x');
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
    .toBe('[promptit] Adapter failed to insert prompt content.');
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
    .toBe('[promptit] Adapter failed to insert prompt content.');
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
    .toBe('입력창 정리에 실패했습니다.');
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

test('renders pin focus like copy focus and uses a filled pinned icon', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  const initialSnapshot = await getPopupActionVisualSnapshot(
    page,
    'pin',
    '번역',
  );

  expect(initialSnapshot.ariaPressed).toBe('false');
  expect(initialSnapshot.iconFillColor).not.toBe('rgb(0, 0, 0)');
  expect(initialSnapshot.iconPathData).toContain('v7.85');

  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe('Pin prompt: 번역');
  await expect
    .poll(async () => await getPopupActionVisualSnapshot(page, 'pin', '번역'))
    .toMatchObject({
      badgeBackgroundColor: 'rgba(0, 0, 0, 0.06)',
      badgeBorderStyle: 'none',
      badgeBorderWidth: '0px',
      iconFillColor: 'rgb(0, 0, 0)',
    });
  const focusedPinSnapshot = await getPopupActionVisualSnapshot(
    page,
    'pin',
    '번역',
  );
  expect(focusedPinSnapshot.iconPathData).toBe(initialSnapshot.iconPathData);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe('Copy prompt: 번역');
  await expect
    .poll(async () => await getPopupActionVisualSnapshot(page, 'copy', '번역'))
    .toMatchObject({
      badgeBackgroundColor: 'rgba(0, 0, 0, 0.06)',
      badgeBorderStyle: 'none',
      badgeBorderWidth: '0px',
      iconFillColor: 'rgb(0, 0, 0)',
    });

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe('Pin prompt: 번역');
  await page.keyboard.press('Enter');
  await expectStoredPromptPinned(extension, 'prompt-translate', true);
  await expect(getPopupPinButton(page, '번역', { pinned: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const pinnedSnapshot = await getPopupActionVisualSnapshot(
    page,
    'pin',
    '번역',
  );
  expect(pinnedSnapshot.iconFillColor).toBe('rgb(0, 0, 0)');
  expect(pinnedSnapshot.iconPathData).not.toBe(initialSnapshot.iconPathData);
  expect(pinnedSnapshot.iconPathData).not.toContain('v7.85');
});

test('shows an error and preserves external pin state on stale popup activation', async ({
  extension,
}) => {
  const stalePrompt = createPromptRecord({
    id: 'stale-pin-prompt',
    title: '고정 충돌',
    content: '고정 충돌 본문',
    sortOrder: 1,
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
    .toContain('다른 곳에서 변경되었습니다');
  const conflictToastText = await getToastText(page);
  expect(conflictToastText).toContain('다시 시도');
  expect(conflictToastText).not.toBe('프롬프트를 고정했습니다.');
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
    .toBe('프롬프트 복사에 실패했습니다.');
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
    .toBe('프롬프트 본문을 읽지 못했습니다.');
  await expect(await getComposerText(page)).toBe('/ ');
  await expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).toBe('');
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
    .toBe('프롬프트 목록을 읽지 못했습니다.');
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
    .toBe('입력창 정리에 실패했습니다.');
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
  await extension.setPromptRecords(
    Array.from({ length: 7 }, (_, index) =>
      createPromptRecord({
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
