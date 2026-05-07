import {
  ADAPTER_MUTATION_SUCCESS,
  createAdapterMutationFailure,
  dispatchInputEvent,
  type AdapterMutationResult,
  type BaseAdapter,
  type TriggerContext,
} from './base';
import {
  createContenteditableTriggerContext,
  isContenteditable,
  replaceContenteditableRange,
} from './editable';

const CHATGPT_URL_PATTERN =
  /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/;
const TEST_FIXTURE_URL_PATTERN =
  /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?:chatgpt-contenteditable|chatgpt-textarea)\.html(?:[?#].*)?$/;
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
const INPUT_SELECTORS = CHATGPT_INPUT_SELECTORS;
const CHATGPT_INPUT_SELECTOR = INPUT_SELECTORS.join(', ');

function asElement(node: EventTarget | null): HTMLElement | null {
  return node instanceof HTMLElement ? node : null;
}

function isTextarea(input: HTMLElement): input is HTMLTextAreaElement {
  return input instanceof HTMLTextAreaElement;
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

    return createContenteditableTriggerContext(input, setTestTriggerDebug);
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
