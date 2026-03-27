export type TextTriggerContext = {
  kind: 'text';
  start: number;
  end: number;
};

export type RangeTriggerContext = {
  kind: 'range';
  range: Range;
};

export type TriggerContext = TextTriggerContext | RangeTriggerContext;

export interface BaseAdapter {
  canHandle(url: string): boolean;
  findActiveInput(): HTMLElement | null;
  resolveTargetInput(element: EventTarget | null): HTMLElement | null;
  isTargetInput(element: EventTarget | null): element is HTMLElement;
  getPopupAnchorRect(input: HTMLElement): DOMRect;
  createTriggerContext(input: HTMLElement): TriggerContext | null;
  removeTriggerText(input: HTMLElement, triggerContext: TriggerContext): boolean;
  insertPrompt(
    input: HTMLElement,
    prompt: string,
    triggerContext: TriggerContext,
  ): boolean;
  focusInput(input: HTMLElement): void;
}

export function cloneTriggerContext(
  triggerContext: TriggerContext,
): TriggerContext {
  if (triggerContext.kind === 'text') {
    return { ...triggerContext };
  }

  return {
    kind: 'range',
    range: triggerContext.range.cloneRange(),
  };
}

export function dispatchInputEvent(
  target: HTMLElement,
  inputType: string,
  data: string | null,
): void {
  try {
    target.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType,
        data,
      }),
    );
  } catch {
    target.dispatchEvent(
      new Event('input', {
        bubbles: true,
        composed: true,
      }),
    );
  }
}
