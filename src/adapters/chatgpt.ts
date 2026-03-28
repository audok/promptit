import {
  dispatchInputEvent,
  type BaseAdapter,
  type TriggerContext,
} from './base';

const CHATGPT_URL_PATTERN =
  /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/;
const TEST_FIXTURE_URL_PATTERN =
  /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/;
const IS_TEST_MODE = import.meta.env.VITE_PROMPTIT_TEST_MODE === '1';
const TEST_TRIGGER_RESULT_ATTRIBUTE = 'data-promptit-trigger-result';
const TEST_TRIGGER_TEXT_ATTRIBUTE = 'data-promptit-trigger-text';

const CHATGPT_INPUT_SELECTORS = [
  'textarea#prompt-textarea',
  'textarea[data-testid="prompt-textarea"]',
  'div#prompt-textarea[contenteditable="true"][role="textbox"]',
  'div[data-testid="prompt-textarea"][contenteditable="true"][role="textbox"]',
  'div#prompt-textarea[contenteditable="true"][data-lexical-editor="true"]',
  'div[data-testid="prompt-textarea"][contenteditable="true"][data-lexical-editor="true"]',
  'div#prompt-textarea.ProseMirror[contenteditable="true"]',
  'div[data-testid="prompt-textarea"].ProseMirror[contenteditable="true"]',
];
const TEST_FIXTURE_INPUT_SELECTORS = ['#editor[contenteditable="true"]'];
const INPUT_SELECTORS = IS_TEST_MODE
  ? [...CHATGPT_INPUT_SELECTORS, ...TEST_FIXTURE_INPUT_SELECTORS]
  : CHATGPT_INPUT_SELECTORS;
const CHATGPT_INPUT_SELECTOR = INPUT_SELECTORS.join(', ');

function asElement(node: EventTarget | null): HTMLElement | null {
  return node instanceof HTMLElement ? node : null;
}

function isTextarea(input: HTMLElement): input is HTMLTextAreaElement {
  return input instanceof HTMLTextAreaElement;
}

function isContenteditable(input: HTMLElement): boolean {
  return input.isContentEditable;
}

function isComposerInput(input: HTMLElement | null): boolean {
  if (!input || !input.matches(CHATGPT_INPUT_SELECTOR)) {
    return false;
  }

  if (isTextarea(input)) {
    return !input.readOnly && !input.disabled;
  }

  return isContenteditable(input);
}

function getRectForPopupAnchor(input: HTMLElement): DOMRect {
  const inputRect = input.getBoundingClientRect();
  const candidates = [
    input.closest('form'),
    input.parentElement,
    input.parentElement?.parentElement,
  ].filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement);

  let bestRect = inputRect;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();

    if (
      rect.width < inputRect.width ||
      rect.height < inputRect.height ||
      rect.left > inputRect.left + 2 ||
      rect.right < inputRect.right - 2
    ) {
      continue;
    }

    const area = rect.width * rect.height;

    if (area < bestArea) {
      bestArea = area;
      bestRect = rect;
    }
  }

  return bestRect;
}

function getCollapsedSelectionRange(input: HTMLElement): Range | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (
    !range.collapsed ||
    !input.contains(range.startContainer) ||
    !input.contains(range.endContainer)
  ) {
    return null;
  }

  return range.cloneRange();
}

function getTextBeforeCaret(input: HTMLElement, range: Range): string {
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(input);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  const fragment = preCaretRange.cloneContents();
  return fragment.textContent ?? preCaretRange.toString();
}

function normalizeTriggerText(text: string): string {
  return text.replace(/\u00A0/g, ' ');
}

function setTestTriggerDebug(result: string, text: string): void {
  if (!IS_TEST_MODE) {
    return;
  }

  document.documentElement.setAttribute(TEST_TRIGGER_RESULT_ATTRIBUTE, result);
  document.documentElement.setAttribute(
    TEST_TRIGGER_TEXT_ATTRIBUTE,
    encodeURIComponent(text),
  );
}

function resolveTextPosition(
  root: HTMLElement,
  targetOffset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  let lastTextNode: Text | null = null;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;

    if (textNode.data.length === 0) {
      continue;
    }

    lastTextNode = textNode;
    const nextOffset = traversed + textNode.data.length;

    if (targetOffset <= nextOffset) {
      return {
        node: textNode,
        offset: targetOffset - traversed,
      };
    }

    traversed = nextOffset;
  }

  if (!lastTextNode) {
    return null;
  }

  return {
    node: lastTextNode,
    offset: lastTextNode.data.length,
  };
}

function replaceTextareaRange(
  input: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
): boolean {
  if (!input.isConnected || start < 0 || end < start || end > input.value.length) {
    return false;
  }

  try {
    input.setRangeText(text, start, end, 'end');
    dispatchInputEvent(
      input,
      text.length > 0 ? 'insertText' : 'deleteContentBackward',
      text.length > 0 ? text : null,
    );
    return true;
  } catch {
    return false;
  }
}

function replaceContenteditableRange(
  input: HTMLElement,
  sourceRange: Range,
  text: string,
): boolean {
  if (
    !input.isConnected ||
    !input.contains(sourceRange.startContainer) ||
    !input.contains(sourceRange.endContainer)
  ) {
    return false;
  }

  const range = sourceRange.cloneRange();
  const selection = window.getSelection();

  let usedExecCommand = false;

  try {
    if (document.activeElement === input && selection) {
      selection.removeAllRanges();
      selection.addRange(range);

      try {
        usedExecCommand = document.execCommand('insertText', false, text);
      } catch {
        usedExecCommand = false;
      }
    }

    if (!usedExecCommand) {
      range.deleteContents();

      if (text.length > 0) {
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);

        if (selection && document.activeElement === input) {
          const caretRange = document.createRange();
          caretRange.setStartAfter(textNode);
          caretRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(caretRange);
        }
      } else if (selection && document.activeElement === input) {
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      dispatchInputEvent(
        input,
        text.length > 0 ? 'insertText' : 'deleteContentBackward',
        text.length > 0 ? text : null,
      );
    }

    return true;
  } catch {
    return false;
  }
}

export class ChatGPTAdapter implements BaseAdapter {
  canHandle(url: string): boolean {
    return CHATGPT_URL_PATTERN.test(url) || (IS_TEST_MODE && TEST_FIXTURE_URL_PATTERN.test(url));
  }

  findActiveInput(): HTMLElement | null {
    const activeElement = this.resolveTargetInput(document.activeElement);

    if (activeElement) {
      return activeElement;
    }

    for (const selector of INPUT_SELECTORS) {
      const candidate = document.querySelector<HTMLElement>(selector);

      if (isComposerInput(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  resolveTargetInput(element: EventTarget | null): HTMLElement | null {
    const node = asElement(element);

    if (!node) {
      return null;
    }

    if (isComposerInput(node)) {
      return node;
    }

    const candidate = node.closest<HTMLElement>(CHATGPT_INPUT_SELECTOR);
    return isComposerInput(candidate) ? candidate : null;
  }

  isTargetInput(element: EventTarget | null): element is HTMLElement {
    return this.resolveTargetInput(element) !== null;
  }

  getPopupAnchorRect(input: HTMLElement): DOMRect {
    return getRectForPopupAnchor(input);
  }

  createTriggerContext(input: HTMLElement): TriggerContext | null {
    if (isTextarea(input)) {
      if (
        input.selectionStart === null ||
        input.selectionEnd === null ||
        input.selectionStart !== input.selectionEnd ||
        input.selectionStart < 2
      ) {
        setTestTriggerDebug('textarea-invalid-selection', input.value);
        return null;
      }

      const caretOffset = input.selectionStart;
      const triggerSlice = input.value.slice(caretOffset - 2, caretOffset);

      if (triggerSlice !== '/ ') {
        setTestTriggerDebug('textarea-no-match', triggerSlice);
        return null;
      }

       setTestTriggerDebug('textarea-match', triggerSlice);

      return {
        kind: 'text',
        start: caretOffset - 2,
        end: caretOffset,
      };
    }

    if (!isContenteditable(input)) {
      return null;
    }

    const selectionRange = getCollapsedSelectionRange(input);

    if (!selectionRange) {
      setTestTriggerDebug('contenteditable-no-selection', '');
      return null;
    }

    const textBeforeCaret = getTextBeforeCaret(input, selectionRange);
    const normalizedTextBeforeCaret = normalizeTriggerText(textBeforeCaret);

    if (!normalizedTextBeforeCaret.endsWith('/ ')) {
      setTestTriggerDebug('contenteditable-no-match', textBeforeCaret);
      return null;
    }

    const caretOffset = textBeforeCaret.length;
    const startPosition = resolveTextPosition(input, caretOffset - 2);
    const endPosition = resolveTextPosition(input, caretOffset);

    if (!startPosition || !endPosition) {
      setTestTriggerDebug('contenteditable-range-resolution-failed', textBeforeCaret);
      return null;
    }

    setTestTriggerDebug('contenteditable-match', textBeforeCaret);

    const range = document.createRange();
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);

    return {
      kind: 'range',
      range,
    };
  }

  removeTriggerText(input: HTMLElement, triggerContext: TriggerContext): boolean {
    if (triggerContext.kind === 'text' && isTextarea(input)) {
      return replaceTextareaRange(
        input,
        triggerContext.start,
        triggerContext.end,
        '',
      );
    }

    if (triggerContext.kind === 'range' && isContenteditable(input)) {
      return replaceContenteditableRange(input, triggerContext.range, '');
    }

    return false;
  }

  insertPrompt(
    input: HTMLElement,
    prompt: string,
    triggerContext: TriggerContext,
  ): boolean {
    if (triggerContext.kind === 'text' && isTextarea(input)) {
      return replaceTextareaRange(
        input,
        triggerContext.start,
        triggerContext.end,
        prompt,
      );
    }

    if (triggerContext.kind === 'range' && isContenteditable(input)) {
      return replaceContenteditableRange(input, triggerContext.range, prompt);
    }

    return false;
  }

  focusInput(input: HTMLElement): void {
    input.focus({ preventScroll: true });
  }
}
