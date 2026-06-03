export type TextTriggerContext = {
  kind: 'text';
  start: number;
  end: number;
  expectedText: string;
};

export type ContenteditableBoundaryNodeKind = 'text' | 'element';

export type ContenteditableBoundarySnapshot = {
  nodePath: number[];
  offset: number;
  nodeKind: ContenteditableBoundaryNodeKind;
};

export type ContenteditableTriggerContext = {
  kind: 'contenteditable';
  start: ContenteditableBoundarySnapshot;
  end: ContenteditableBoundarySnapshot;
  expectedText: string;
};

export type TriggerContext = TextTriggerContext | ContenteditableTriggerContext;

export type AdapterMutationFailureReason =
  | 'unsupported-input'
  | 'invalid-context'
  | 'stale-context'
  | 'mutation-failed';

export type AdapterMutationSuccess = {
  ok: true;
};

export type AdapterMutationFailure = {
  ok: false;
  reason: AdapterMutationFailureReason;
};

export type AdapterMutationResult =
  | AdapterMutationSuccess
  | AdapterMutationFailure;

export const ADAPTER_MUTATION_SUCCESS: AdapterMutationSuccess = {
  ok: true,
};

export interface BaseAdapter {
  canHandle(url: string): boolean;
  findActiveInput(): HTMLElement | null;
  resolveTargetInput(element: EventTarget | null): HTMLElement | null;
  isTargetInput(element: EventTarget | null): element is HTMLElement;
  getPopupAnchorRect(input: HTMLElement): DOMRect;
  createTriggerContext(input: HTMLElement): TriggerContext | null;
  removeTriggerText(
    input: HTMLElement,
    triggerContext: TriggerContext,
  ): AdapterMutationResult;
  insertPrompt(
    input: HTMLElement,
    prompt: string,
    triggerContext: TriggerContext,
  ): AdapterMutationResult;
  focusInput(input: HTMLElement): void;
}

export function cloneTriggerContext(
  triggerContext: TriggerContext,
): TriggerContext {
  if (triggerContext.kind === 'text') {
    return { ...triggerContext };
  }

  return {
    ...triggerContext,
    start: {
      ...triggerContext.start,
      nodePath: [...triggerContext.start.nodePath],
    },
    end: {
      ...triggerContext.end,
      nodePath: [...triggerContext.end.nodePath],
    },
  };
}

export function createAdapterMutationFailure(
  reason: AdapterMutationFailureReason,
): AdapterMutationFailure {
  return {
    ok: false,
    reason,
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
