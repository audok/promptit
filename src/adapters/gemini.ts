import {
  createAdapterMutationFailure,
  type AdapterMutationResult,
  type BaseAdapter,
  type TriggerContext,
} from './base';
import {
  createContenteditableTriggerContext,
  isContenteditable,
  replaceContenteditableRange,
} from './editable';

const GEMINI_URL_PATTERN = /^https:\/\/gemini\.google\.com(?:\/|$)/;
const TEST_FIXTURE_URL_PATTERN =
  /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/gemini-contenteditable\.html(?:[?#].*)?$/;
const IS_TEST_MODE = import.meta.env.VITE_PROMPTIT_TEST_MODE === '1';

const GEMINI_INPUT_SELECTORS = [
  'rich-textarea div.ql-editor[contenteditable="true"][role="textbox"]',
  'div.ql-editor.textarea[contenteditable="true"][role="textbox"]',
];
const GEMINI_INPUT_SELECTOR = GEMINI_INPUT_SELECTORS.join(', ');

function asElement(node: EventTarget | null): HTMLElement | null {
  return node instanceof HTMLElement ? node : null;
}

function isGeminiComposer(input: HTMLElement | null): boolean {
  if (!input || input.matches('.ql-clipboard, .ql-clipboard *')) {
    return false;
  }

  return input.matches(GEMINI_INPUT_SELECTOR) && isContenteditable(input);
}

function getRectForPopupAnchor(input: HTMLElement): DOMRect {
  const inputRect = input.getBoundingClientRect();
  const candidates = [
    input.closest<HTMLElement>('.text-input-field'),
    input.closest<HTMLElement>('.text-input-field_textarea-wrapper'),
    input.closest<HTMLElement>('rich-textarea'),
    input.parentElement,
    input.parentElement?.parentElement,
  ].filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement);

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.width < inputRect.width ||
      rect.height < inputRect.height ||
      rect.left > inputRect.left + 2 ||
      rect.top > inputRect.top + 2 ||
      rect.right < inputRect.right - 2 ||
      rect.bottom < inputRect.bottom - 2
    ) {
      continue;
    }

    return rect;
  }

  return inputRect;
}

export class GeminiAdapter implements BaseAdapter {
  canHandle(url: string): boolean {
    return GEMINI_URL_PATTERN.test(url) || (IS_TEST_MODE && TEST_FIXTURE_URL_PATTERN.test(url));
  }

  findActiveInput(): HTMLElement | null {
    const activeElement = this.resolveTargetInput(document.activeElement);

    if (activeElement) {
      return activeElement;
    }

    for (const selector of GEMINI_INPUT_SELECTORS) {
      const candidate = document.querySelector<HTMLElement>(selector);

      if (isGeminiComposer(candidate)) {
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

    if (isGeminiComposer(node)) {
      return node;
    }

    const candidate = node.closest<HTMLElement>(GEMINI_INPUT_SELECTOR);
    return isGeminiComposer(candidate) ? candidate : null;
  }

  isTargetInput(element: EventTarget | null): element is HTMLElement {
    return this.resolveTargetInput(element) !== null;
  }

  getPopupAnchorRect(input: HTMLElement): DOMRect {
    return getRectForPopupAnchor(input);
  }

  createTriggerContext(input: HTMLElement): TriggerContext | null {
    if (!isGeminiComposer(input)) {
      return null;
    }

    return createContenteditableTriggerContext(input);
  }

  removeTriggerText(
    input: HTMLElement,
    triggerContext: TriggerContext,
  ): AdapterMutationResult {
    if (triggerContext.kind === 'contenteditable' && isGeminiComposer(input)) {
      return replaceContenteditableRange(input, triggerContext, '');
    }

    return createAdapterMutationFailure('unsupported-input');
  }

  insertPrompt(
    input: HTMLElement,
    prompt: string,
    triggerContext: TriggerContext,
  ): AdapterMutationResult {
    if (triggerContext.kind === 'contenteditable' && isGeminiComposer(input)) {
      return replaceContenteditableRange(input, triggerContext, prompt);
    }

    return createAdapterMutationFailure('unsupported-input');
  }

  focusInput(input: HTMLElement): void {
    input.focus({ preventScroll: true });
  }
}
