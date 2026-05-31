import { expect, test as base, type Page } from '@playwright/test';
import { type PromptRecord } from '../../src/prompt/schema';

import { launchExtension, type LoadedExtension } from './extension';
import {
  clearComposer,
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
} from './promptit';

export const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await extension.setLanguagePreference('en');
    await use(extension);
    await extension.close();
  },
});

export const basePrompts = [
  createPromptRecord({
    id: 'prompt-translate',
    title: '번역',
    content: '영문으로 자연스럽게 번역해줘.',
    normalOrder: 10,
  }),
  createPromptRecord({
    id: 'prompt-minutes',
    title: '회의록',
    content: '회의록으로 정리해줘.',
    normalOrder: 20,
    createdAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
    updatedAt: new Date('2026-03-29T00:01:00.000Z').toISOString(),
  }),
];

export async function setContenteditableComposerState(
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

export async function dispatchComposerInput(
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

export async function dispatchNestedChildComposerInput(
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

export type TriggerWindowState = Window & {
  __promptitDetachedComposer?: HTMLElement;
  __promptitDetachedComposerText?: string | null;
  __promptitPopupOpened?: boolean;
  __promptitComposerDetached?: boolean;
};

export async function installTriggerDetachmentWatcher(
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

export async function detachComposerAndTrackText(
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

export async function getDetachedComposerText(
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

export async function dispatchComposerCompositionEvent(
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

export async function dispatchComposerKeydown(
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

export async function setMultilineContenteditableComposerState(
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

export async function dispatchBlockBoundaryComposerInput(
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

export async function dispatchLineBoundaryComposerInput(
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

export async function dispatchInlineWrapperComposerInput(
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

export async function getComposerDomSnapshot(
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

export async function getPopupStateSnapshot(
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

export async function getPopupAccessibilitySnapshot(
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

export async function getPopupChromeSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  activeCellLabel: string | null;
  cardLabel: string | null;
  emptyDescription: string | null;
  exitText: string | null;
  footerText: string | null;
  headerSlash: string | null;
  headerText: string | null;
  listLabel: string | null;
  settingsLabel: string | null;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');
    const root = host?.shadowRoot;
    const card = root?.querySelector('[data-testid="promptit-popup"]');
    const list = root?.querySelector('[data-role="prompt-list"]');
    const activeCell = root?.querySelector(
      '[data-role="prompt-cell"][aria-current="true"]',
    );
    const settingsButton = root?.querySelector('[class~="promptit-footer-button"]');

    if (
      !(host instanceof HTMLElement) ||
      !root ||
      !(card instanceof HTMLElement)
    ) {
      throw new Error('Popup chrome snapshot could not find the popup.');
    }

    return {
      activeCellLabel:
        activeCell instanceof HTMLElement
          ? activeCell.getAttribute('aria-label')
          : null,
      cardLabel: card.getAttribute('aria-label'),
      emptyDescription:
        root.querySelector('[class~="promptit-row-description"]')?.textContent ??
        null,
      exitText:
        root.querySelector('[data-action="exit"]')?.textContent?.trim() ?? null,
      footerText:
        root.querySelector('[class~="promptit-footer-label"]')?.textContent ??
        null,
      headerSlash:
        root.querySelector('[class~="promptit-header-slash"]')?.textContent ??
        null,
      headerText:
        root.querySelector('[class~="promptit-header-text"]')?.textContent ??
        null,
      listLabel:
        list instanceof HTMLElement
          ? list.getAttribute('aria-label') ??
            list.getAttribute('aria-labelledby')
          : null,
      settingsLabel:
        settingsButton instanceof HTMLElement
          ? settingsButton.getAttribute('aria-label')
          : null,
    };
  });
}

export async function getToastAccessibilitySnapshot(
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

export async function getPopupThemeSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  activeCellBackgroundColor: string | null;
  activeCellLabel: string | null;
  activeIconBadgeBackgroundColor: string | null;
  activeIconBadgeColor: string | null;
  cardBackgroundColor: string;
  cardBorderColor: string;
  descriptionColor: string | null;
  rootColorScheme: string;
  rootTheme: string | null;
  rowActiveBackgroundColor: string;
  rowActiveIndicatorColor: string;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-testid="promptit-popup-host"]');
    const root = host?.shadowRoot?.querySelector('.promptit-root');
    const card = host?.shadowRoot?.querySelector('[data-testid="promptit-popup"]');
    const activeRow = host?.shadowRoot?.querySelector('[data-role="prompt-row"].is-active-row');
    const activeCell = host?.shadowRoot?.querySelector('[data-role="prompt-cell"].is-active-cell');

    if (
      !(host instanceof HTMLElement) ||
      !(root instanceof HTMLElement) ||
      !(card instanceof HTMLElement) ||
      !(activeRow instanceof HTMLElement) ||
      !(activeCell instanceof HTMLElement)
    ) {
      throw new Error('Popup theme snapshot could not find the popup.');
    }

    const rootStyle = getComputedStyle(root);
    const cardStyle = getComputedStyle(card);
    const activeRowStyle = getComputedStyle(activeRow);
    const activeRowIndicatorStyle = getComputedStyle(activeRow, '::before');
    const activeCellStyle = getComputedStyle(activeCell);
    const description = activeRow.querySelector('[class~="promptit-row-description"]');
    const descriptionStyle =
      description instanceof HTMLElement ? getComputedStyle(description) : null;
    const activeIconBadge = activeCell.querySelector('[class~="promptit-row-action-badge"]');
    const activeIconBadgeStyle =
      activeIconBadge instanceof HTMLElement ? getComputedStyle(activeIconBadge) : null;

    return {
      activeCellBackgroundColor: activeCellStyle.backgroundColor,
      activeCellLabel: activeCell.getAttribute('aria-label'),
      activeIconBadgeBackgroundColor: activeIconBadgeStyle?.backgroundColor ?? null,
      activeIconBadgeColor: activeIconBadgeStyle?.color ?? null,
      cardBackgroundColor: cardStyle.backgroundColor,
      cardBorderColor: cardStyle.borderTopColor,
      descriptionColor: descriptionStyle?.color ?? null,
      rootColorScheme: rootStyle.colorScheme,
      rootTheme: root.dataset.promptitTheme ?? null,
      rowActiveBackgroundColor: activeRowStyle.backgroundColor,
      rowActiveIndicatorColor: activeRowIndicatorStyle.backgroundColor,
    };
  });
}

export async function waitForPopupThemeSnapshot(
  page: Parameters<typeof getComposerText>[0],
  theme: 'light' | 'dark',
): Promise<Awaited<ReturnType<typeof getPopupThemeSnapshot>>> {
  await expect.poll(async () => (await getPopupThemeSnapshot(page)).rootTheme)
    .toBe(theme);

  return await getPopupThemeSnapshot(page);
}

export async function getToastVisualSnapshot(
  page: Parameters<typeof getComposerText>[0],
): Promise<{
  backgroundColor: string;
  borderTopLeftRadius: string;
  childElementCount: number;
  color: string;
  display: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  minHeight: string;
  paddingBottom: string;
  paddingLeft: string;
  paddingRight: string;
  paddingTop: string;
  text: string | null;
  textOverflow: string;
  whiteSpace: string;
  theme: string | null;
}> {
  return await page.evaluate(() => {
    const host = document.querySelector('[data-promptit-toast-host]');
    const content = host?.shadowRoot?.querySelector('[data-role="toast-content"]');

    if (!(host instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      throw new Error('Toast visual snapshot could not find the toast.');
    }

    const style = getComputedStyle(content);

    return {
      backgroundColor: style.backgroundColor,
      borderTopLeftRadius: style.borderTopLeftRadius,
      childElementCount: content.childElementCount,
      color: style.color,
      display: style.display,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      minHeight: style.minHeight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      paddingTop: style.paddingTop,
      text: content.textContent,
      textOverflow: style.textOverflow,
      theme: content.dataset.promptitTheme ?? null,
      whiteSpace: style.whiteSpace,
    };
  });
}

export function parseRgbColor(value: string): {
  alpha: number;
  channels: number[];
} {
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value);

  expect(match).not.toBeNull();

  return {
    alpha: match?.[4] === undefined ? 1 : Number(match[4]),
    channels: match?.slice(1, 4).map(Number) ?? [],
  };
}

export function expectRgbChannelsBetween(
  value: string,
  minimum: number,
  maximum: number,
): void {
  const { channels } = parseRgbColor(value);

  for (const channel of channels) {
    expect(channel).toBeGreaterThanOrEqual(minimum);
    expect(channel).toBeLessThanOrEqual(maximum);
  }
}

function getRelativeLuminance(value: string): number {
  const { alpha, channels } = parseRgbColor(value);
  expect(alpha).toBe(1);

  const [red, green, blue] = channels.map((channel) => {
    const normalizedChannel = channel / 255;

    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getContrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

export async function getActiveElementSnapshot(
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

export async function waitForPromptBodyReadPending(
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

export async function armPromptBodyReadPendingListener(
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

export async function getPopupPositionSnapshot(
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

export async function getPopupWidthSnapshot(
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

export async function installTinyPopupAnchorRect(
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

export async function getPopupListScrollTop(
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

export function getPopupPinButton(
  page: Page,
  title: string,
  options: { pinned?: boolean } = {},
) {
  return page.getByRole('button', {
    name: `${options.pinned ? 'Unpin' : 'Pin'} prompt: ${title}`,
  });
}

export async function expectPopupPromptOrder(
  page: Page,
  titles: string[],
): Promise<void> {
  await expect.poll(async () => await getPopupTitles(page)).toEqual(titles);
}

export async function expectStoredPromptPinned(
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

export async function setPromptRecordsWithoutRevision(
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

export async function getPopupActionVisualSnapshot(
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


export {
  expect,
  clearComposer,
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
};

export type {
  LoadedExtension,
  Page,
  PromptRecord,
};
