import {
  ADAPTER_MUTATION_SUCCESS,
  createAdapterMutationFailure,
  dispatchInputEvent,
  type ContenteditableBoundaryNodeKind,
  type ContenteditableBoundarySnapshot,
  type AdapterMutationResult,
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

function getRangeText(range: Range): string {
  const fragment = range.cloneContents();
  return fragment.textContent ?? range.toString();
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

function getBoundaryNodeKind(node: Node): ContenteditableBoundaryNodeKind | null {
  if (node instanceof Text) {
    return 'text';
  }

  if (node instanceof Element) {
    return 'element';
  }

  return null;
}

function getBoundaryOffsetLimit(
  node: Node,
  expectedKind: ContenteditableBoundaryNodeKind,
): number | null {
  if (expectedKind === 'text') {
    return node instanceof Text ? node.data.length : null;
  }

  return node instanceof Element ? node.childNodes.length : null;
}

function createNodePath(root: HTMLElement, target: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = target;

  while (current && current !== root) {
    const parent: ParentNode | null = current.parentNode;

    if (!parent) {
      return null;
    }

    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;

    if (index < 0) {
      return null;
    }

    path.unshift(index);
    current = parent;
  }

  return current === root ? path : null;
}

function resolveNodePath(root: HTMLElement, nodePath: number[]): Node | null {
  let current: Node = root;

  for (const index of nodePath) {
    if (index < 0 || index >= current.childNodes.length) {
      return null;
    }

    const nextNode = current.childNodes.item(index);

    if (!nextNode) {
      return null;
    }

    current = nextNode;
  }

  return current;
}

function createBoundarySnapshot(
  root: HTMLElement,
  node: Node,
  offset: number,
): ContenteditableBoundarySnapshot | null {
  const nodeKind = getBoundaryNodeKind(node);

  if (!nodeKind) {
    return null;
  }

  const nodePath = createNodePath(root, node);

  if (!nodePath) {
    return null;
  }

  const offsetLimit = getBoundaryOffsetLimit(node, nodeKind);

  if (offset < 0 || offsetLimit === null || offset > offsetLimit) {
    return null;
  }

  return {
    nodePath,
    offset,
    nodeKind,
  };
}

function resolveBoundarySnapshot(
  root: HTMLElement,
  snapshot: ContenteditableBoundarySnapshot,
): { node: Node; offset: number } | AdapterMutationResult {
  const node = resolveNodePath(root, snapshot.nodePath);

  if (!node) {
    return createAdapterMutationFailure('stale-context');
  }

  if (getBoundaryNodeKind(node) !== snapshot.nodeKind) {
    return createAdapterMutationFailure('stale-context');
  }

  const offsetLimit = getBoundaryOffsetLimit(node, snapshot.nodeKind);

  if (offsetLimit === null) {
    return createAdapterMutationFailure('stale-context');
  }

  if (snapshot.offset < 0 || snapshot.offset > offsetLimit) {
    return createAdapterMutationFailure('invalid-context');
  }

  return {
    node,
    offset: snapshot.offset,
  };
}

function findDeepestLastTextNode(node: Node): Text | null {
  if (node instanceof Text && node.data.length > 0) {
    return node;
  }

  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const childNode = node.childNodes.item(index);

    if (!childNode) {
      continue;
    }

    const textNode = findDeepestLastTextNode(childNode);

    if (textNode) {
      return textNode;
    }
  }

  return null;
}

function getPreviousTextNode(root: HTMLElement, currentNode: Text): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let previousTextNode: Text | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (!(node instanceof Text) || node.data.length === 0) {
      continue;
    }

    if (node === currentNode) {
      return previousTextNode;
    }

    previousTextNode = node;
  }

  return null;
}

function resolveTextCursorAtBoundary(
  root: HTMLElement,
  container: Node,
  offset: number,
): { node: Text; offset: number } | null {
  if (!root.contains(container) && container !== root) {
    return null;
  }

  if (container instanceof Text) {
    if (offset < 0 || offset > container.data.length) {
      return null;
    }

    return {
      node: container,
      offset,
    };
  }

  if (!(container instanceof Element)) {
    return null;
  }

  if (offset < 0 || offset > container.childNodes.length) {
    return null;
  }

  for (let childIndex = offset - 1; childIndex >= 0; childIndex -= 1) {
    const siblingNode = container.childNodes.item(childIndex);

    if (!siblingNode) {
      continue;
    }

    const textNode = findDeepestLastTextNode(siblingNode);

    if (textNode) {
      return {
        node: textNode,
        offset: textNode.data.length,
      };
    }
  }

  let currentNode: Node = container;

  while (currentNode !== root) {
    let siblingNode = currentNode.previousSibling;

    while (siblingNode) {
      const textNode = findDeepestLastTextNode(siblingNode);

      if (textNode) {
        return {
          node: textNode,
          offset: textNode.data.length,
        };
      }

      siblingNode = siblingNode.previousSibling;
    }

    if (!(currentNode.parentNode instanceof Node)) {
      return null;
    }

    currentNode = currentNode.parentNode;
  }

  return null;
}

function moveBoundaryBackwardByText(
  root: HTMLElement,
  container: Node,
  offset: number,
  length: number,
): { node: Text; offset: number } | null {
  if (length < 0) {
    return null;
  }

  let cursor = resolveTextCursorAtBoundary(root, container, offset);

  if (!cursor) {
    return null;
  }

  let remaining = length;

  while (remaining > 0) {
    if (cursor.offset > 0) {
      const step = Math.min(remaining, cursor.offset);
      cursor = {
        node: cursor.node,
        offset: cursor.offset - step,
      };
      remaining -= step;
    }

    if (remaining === 0) {
      return cursor;
    }

    const previousTextNode = getPreviousTextNode(root, cursor.node);

    if (!previousTextNode) {
      return null;
    }

    cursor = {
      node: previousTextNode,
      offset: previousTextNode.data.length,
    };
  }

  return cursor;
}

function replaceTextareaRange(
  input: HTMLTextAreaElement,
  triggerContext: TriggerContext,
  text: string,
): AdapterMutationResult {
  if (triggerContext.kind !== 'text') {
    return createAdapterMutationFailure('unsupported-input');
  }

  const { start, end, expectedText } = triggerContext;

  if (!input.isConnected) {
    return createAdapterMutationFailure('stale-context');
  }

  if (start < 0 || end < start || end > input.value.length) {
    return createAdapterMutationFailure('invalid-context');
  }

  if (input.value.slice(start, end) !== expectedText) {
    return createAdapterMutationFailure('stale-context');
  }

  try {
    input.setRangeText(text, start, end, 'end');
    dispatchInputEvent(
      input,
      text.length > 0 ? 'insertText' : 'deleteContentBackward',
      text.length > 0 ? text : null,
    );
    return ADAPTER_MUTATION_SUCCESS;
  } catch {
    return createAdapterMutationFailure('mutation-failed');
  }
}

function resolveContenteditableRange(
  input: HTMLElement,
  triggerContext: TriggerContext,
): Range | AdapterMutationResult {
  if (triggerContext.kind !== 'contenteditable') {
    return createAdapterMutationFailure('unsupported-input');
  }

  const { start, end, expectedText } = triggerContext;

  if (!input.isConnected) {
    return createAdapterMutationFailure('stale-context');
  }

  const startPosition = resolveBoundarySnapshot(input, start);
  const endPosition = resolveBoundarySnapshot(input, end);

  if (!('node' in startPosition)) {
    return startPosition;
  }

  if (!('node' in endPosition)) {
    return endPosition;
  }

  const range = document.createRange();

  try {
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);
  } catch {
    return createAdapterMutationFailure('invalid-context');
  }

  if (normalizeTriggerText(getRangeText(range)) !== expectedText) {
    return createAdapterMutationFailure('stale-context');
  }

  return range;
}

function replaceContenteditableRange(
  input: HTMLElement,
  triggerContext: TriggerContext,
  text: string,
): AdapterMutationResult {
  const resolvedRange = resolveContenteditableRange(input, triggerContext);

  if (!(resolvedRange instanceof Range)) {
    return resolvedRange;
  }

  const range = resolvedRange.cloneRange();
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

    return ADAPTER_MUTATION_SUCCESS;
  } catch {
    return createAdapterMutationFailure('mutation-failed');
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
        expectedText: triggerSlice,
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

    const triggerStart = moveBoundaryBackwardByText(
      input,
      selectionRange.endContainer,
      selectionRange.endOffset,
      2,
    );

    if (!triggerStart) {
      setTestTriggerDebug('contenteditable-range-resolution-failed', textBeforeCaret);
      return null;
    }

    const triggerRange = selectionRange.cloneRange();
    triggerRange.setStart(triggerStart.node, triggerStart.offset);

    const expectedText = normalizeTriggerText(getRangeText(triggerRange));

    if (expectedText !== '/ ') {
      setTestTriggerDebug('contenteditable-range-resolution-failed', getRangeText(triggerRange));
      return null;
    }

    const startSnapshot = createBoundarySnapshot(
      input,
      triggerRange.startContainer,
      triggerRange.startOffset,
    );
    const endSnapshot = createBoundarySnapshot(
      input,
      triggerRange.endContainer,
      triggerRange.endOffset,
    );

    if (!startSnapshot || !endSnapshot) {
      setTestTriggerDebug('contenteditable-range-resolution-failed', getRangeText(triggerRange));
      return null;
    }

    setTestTriggerDebug('contenteditable-match', textBeforeCaret);

    return {
      kind: 'contenteditable',
      start: startSnapshot,
      end: endSnapshot,
      expectedText,
    };
  }

  removeTriggerText(
    input: HTMLElement,
    triggerContext: TriggerContext,
  ): AdapterMutationResult {
    if (triggerContext.kind === 'text' && isTextarea(input)) {
      return replaceTextareaRange(input, triggerContext, '');
    }

    if (triggerContext.kind === 'contenteditable' && isContenteditable(input)) {
      return replaceContenteditableRange(input, triggerContext, '');
    }

    return createAdapterMutationFailure('unsupported-input');
  }

  insertPrompt(
    input: HTMLElement,
    prompt: string,
    triggerContext: TriggerContext,
  ): AdapterMutationResult {
    if (triggerContext.kind === 'text' && isTextarea(input)) {
      return replaceTextareaRange(input, triggerContext, prompt);
    }

    if (triggerContext.kind === 'contenteditable' && isContenteditable(input)) {
      return replaceContenteditableRange(input, triggerContext, prompt);
    }

    return createAdapterMutationFailure('unsupported-input');
  }

  focusInput(input: HTMLElement): void {
    input.focus({ preventScroll: true });
  }
}
