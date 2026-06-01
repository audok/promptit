import {
  ADAPTER_MUTATION_SUCCESS,
  createAdapterMutationFailure,
  dispatchInputEvent,
  type AdapterMutationResult,
  type ContenteditableBoundaryNodeKind,
  type ContenteditableBoundarySnapshot,
  type TriggerContext,
} from './base';

export type TriggerDebugWriter = (result: string, text: string) => void;

export function isContenteditable(input: HTMLElement): boolean {
  return input.isContentEditable;
}

function isInputFocused(input: HTMLElement): boolean {
  if (document.activeElement === input) {
    return true;
  }

  return (
    document.activeElement instanceof HTMLElement &&
    input.contains(document.activeElement)
  );
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

function getFocusedCollapsedSelectionRange(
  input: HTMLElement,
): Range | AdapterMutationResult {
  if (!input.isConnected || !isInputFocused(input)) {
    return createAdapterMutationFailure('stale-context');
  }

  const selection = window.getSelection();

  if (!selection || selection.rangeCount !== 1) {
    return createAdapterMutationFailure('invalid-context');
  }

  const range = selection.getRangeAt(0);

  if (
    !range.collapsed ||
    !input.contains(range.startContainer) ||
    !input.contains(range.endContainer)
  ) {
    return createAdapterMutationFailure('invalid-context');
  }

  return range.cloneRange();
}

function normalizeTriggerText(text: string): string {
  return text.replace(/\u00A0/g, ' ');
}

function getRangeText(range: Range): string {
  const fragment = range.cloneContents();
  return fragment.textContent ?? range.toString();
}

function areBoundaryPointsEqual(
  leftNode: Node,
  leftOffset: number,
  rightNode: Node,
  rightOffset: number,
): boolean {
  return leftNode === rightNode && leftOffset === rightOffset;
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

const HARD_BOUNDARY_TAG_NAMES = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'BR',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TD',
  'TH',
  'TR',
  'UL',
]);

function isHardBoundaryElement(element: Element): boolean {
  return HARD_BOUNDARY_TAG_NAMES.has(element.tagName);
}

function rangeContainsHardBoundary(range: Range): boolean {
  const fragment = range.cloneContents();
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT);

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (node instanceof Element && isHardBoundaryElement(node)) {
      return true;
    }
  }

  return false;
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

export function createContenteditableTriggerContext(
  input: HTMLElement,
  setTriggerDebug?: TriggerDebugWriter,
): TriggerContext | null {
  const selectionRange = getCollapsedSelectionRange(input);

  if (!selectionRange) {
    setTriggerDebug?.('contenteditable-no-selection', '');
    return null;
  }

  const triggerStart = moveBoundaryBackwardByText(
    input,
    selectionRange.endContainer,
    selectionRange.endOffset,
    2,
  );

  if (!triggerStart) {
    setTriggerDebug?.('contenteditable-no-match', '');
    return null;
  }

  const triggerRange = selectionRange.cloneRange();
  triggerRange.setStart(triggerStart.node, triggerStart.offset);
  const triggerText = getRangeText(triggerRange);
  const expectedText = normalizeTriggerText(triggerText);

  if (expectedText !== '/ ') {
    setTriggerDebug?.('contenteditable-no-match', triggerText);
    return null;
  }

  if (rangeContainsHardBoundary(triggerRange)) {
    setTriggerDebug?.('contenteditable-boundary-crossed', triggerText);
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
    setTriggerDebug?.('contenteditable-range-resolution-failed', triggerText);
    return null;
  }

  setTriggerDebug?.('contenteditable-match', triggerText);

  return {
    kind: 'contenteditable',
    start: startSnapshot,
    end: endSnapshot,
    expectedText,
  };
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

export function replaceContenteditableRange(
  input: HTMLElement,
  triggerContext: TriggerContext,
  text: string,
): AdapterMutationResult {
  const resolvedRange = resolveContenteditableRange(input, triggerContext);

  if (!(resolvedRange instanceof Range)) {
    return resolvedRange;
  }

  const range = resolvedRange.cloneRange();
  const liveSelectionRange = getFocusedCollapsedSelectionRange(input);

  if (!(liveSelectionRange instanceof Range)) {
    return liveSelectionRange;
  }

  if (
    !areBoundaryPointsEqual(
      liveSelectionRange.endContainer,
      liveSelectionRange.endOffset,
      range.endContainer,
      range.endOffset,
    )
  ) {
    return createAdapterMutationFailure('stale-context');
  }

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
