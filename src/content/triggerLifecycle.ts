import { cloneTriggerContext } from '../adapters/base';
import type { PromptMeta } from '../prompt/schema';
import { translate } from '../shared/i18n';
import { buildLauncherItems } from './launcher-items';
import type { ContentControllerContext } from './controllerContext';
import { closePopup } from './popupActions';
import {
  getInitialActiveCell,
  type PopupSessionState,
} from './session';
import { showToast } from './toast';
import { armTrigger, clearTriggerArm } from './trigger';
import { readPromptMetasForContentTrigger } from './runtimeClient';

export function scheduleTriggerCheck(
  context: ContentControllerContext,
  input: HTMLElement,
): void {
  const { session } = context;

  if (!canScheduleTriggerCheck(session, input)) {
    return;
  }

  session.activeInput = input;
  armTrigger(session, (requestId) => {
    void resolveTriggerCheck(context, input, requestId);
  });
}

export function canScheduleTriggerCheck(
  session: PopupSessionState,
  input: HTMLElement,
): boolean {
  return (
    input.isConnected &&
    !session.isBusy &&
    !session.isComposing &&
    (session.status === 'idle' || session.status === 'armed')
  );
}

export function isFocusedInput(input: HTMLElement): boolean {
  if (document.activeElement === input) {
    return true;
  }

  if (
    document.activeElement instanceof HTMLElement &&
    input.contains(document.activeElement)
  ) {
    return true;
  }

  const selection = window.getSelection();

  return Boolean(selection?.anchorNode && input.contains(selection.anchorNode));
}

async function resolveTriggerCheck(
  context: ContentControllerContext,
  input: HTMLElement,
  requestId: number,
): Promise<void> {
  const { adapter, popup, session } = context;

  if (shouldAbortTriggerCheck(input, requestId, session)) {
    return;
  }

  const triggerContext = adapter.createTriggerContext(input);

  if (!triggerContext) {
    clearTriggerForInput(input, session);
    return;
  }

  const userPrompts = await readPromptsForTrigger(context, input, requestId);

  if (!userPrompts) {
    return;
  }

  if (shouldAbortTriggerCheck(input, requestId, session)) {
    return;
  }

  const items = buildLauncherItems(userPrompts, context.getLocale());

  clearTriggerArm(session);
  session.status = 'open';
  session.activeInput = input;
  session.triggerContext = cloneTriggerContext(triggerContext);
  session.items = items;
  session.activeCell = getInitialActiveCell(items);

  popup.show(
    items,
    session.activeCell,
    adapter.getPopupAnchorRect(input),
    context.getLocale(),
    context.getTheme(),
  );

  const observer = new MutationObserver(() => {
    if (session.status === 'open' && session.activeInput && !session.activeInput.isConnected) {
      void closePopup(context, 'dom-removed', false);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  session.disconnectInputObserver?.();
  session.disconnectInputObserver = () => observer.disconnect();
}

async function readPromptsForTrigger(
  context: ContentControllerContext,
  input: HTMLElement,
  requestId: number,
): Promise<PromptMeta[] | null> {
  const { session } = context;

  try {
    return await readPromptMetasForContentTrigger();
  } catch (error) {
    console.error('[promptit] Failed to read prompts before opening popup.', error);

    if (!shouldAbortTriggerCheck(input, requestId, session)) {
      clearTriggerForInput(input, session);
      showToast(
        translate(context.getLocale(), 'content.toast.promptListReadFailed'),
        'error',
      );
    }

    return null;
  }
}

function shouldAbortTriggerCheck(
  input: HTMLElement,
  requestId: number,
  session: PopupSessionState,
): boolean {
  if (
    session.isComposing ||
    session.status !== 'armed' ||
    requestId !== session.triggerRequestId
  ) {
    return true;
  }

  if (!input.isConnected || !isFocusedInput(input)) {
    clearTriggerForInput(input, session);
    return true;
  }

  if (session.activeInput !== input) {
    return true;
  }

  return false;
}

function clearTriggerForInput(
  input: HTMLElement,
  session: PopupSessionState,
): void {
  clearTriggerArm(session);

  if (session.activeInput === input) {
    session.activeInput = null;
  }
}
