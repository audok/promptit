import { cloneTriggerContext } from '../adapters/base';
import { translate } from '../shared/i18n';
import { ensureAdapterMutation } from './adapterMutation';
import type { ContentControllerContext } from './controllerContext';
import {
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';
import {
  mergePromptMeta,
  removePromptMeta,
} from './popupRefresh';
import { updatePopupUserPrompts } from './popupView';
import {
  captureOpenPopupActionToken,
  invalidatePopupActionContinuations,
  isCurrentPopupActionToken,
  resetSessionState,
  type CloseReason,
} from './session';
import { showToast } from './toast';
import { clearTriggerArm } from './trigger';
import {
  isPromptBodyReadError,
  readPromptBodyContentForContentAction,
  requestOpenOptionsPageFromContent,
  setPromptPinnedFromContent,
} from './runtimeClient';
import {
  getContentRuntimeErrorToastMessage,
  getContentRuntimeResponseToastMessage,
} from './runtimeFeedback';
import { shouldFailClipboardWriteForTest } from './testControls';

export type ClosePopupOptions = {
  reopenOnCleanupFailure?: boolean;
  showCleanupFailureToast?: boolean;
};

export async function handleSelection(
  context: ContentControllerContext,
  item: LauncherItem,
): Promise<void> {
  const { adapter, popup, session } = context;

  if (session.isBusy) {
    return;
  }

  const activeInput = session.activeInput;
  const triggerContext = session.triggerContext
    ? cloneTriggerContext(session.triggerContext)
    : null;

  if (!activeInput || !triggerContext) {
    await closePopup(context, 'insert', false);
    return;
  }

  const actionToken = captureOpenPopupActionToken(session);

  if (!actionToken) {
    return;
  }

  session.isBusy = true;
  popup.setBusy(true);

  try {
    if (item.action === 'open-options') {
      await performOpenOptionsAction(context);
      return;
    }

    const content = await readPromptBodyContentForContentAction(item.id);

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    adapter.focusInput(activeInput);
    session.isInternalChange = true;
    ensureAdapterMutation(
      adapter.insertPrompt(activeInput, content, triggerContext),
      'insert prompt content',
    );

    await closePopup(context, 'insert', false);
  } catch (error) {
    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    console.error('[promptit] Failed to handle popup selection.', error);
    session.isBusy = false;
    popup.setBusy(false);
    if (activeInput.isConnected) {
      adapter.focusInput(activeInput);
    }
    showToast(getSelectionErrorToastMessage(context, error), 'error');
  } finally {
    queueMicrotask(() => {
      session.isInternalChange = false;
    });
  }
}

export async function handleCopy(
  context: ContentControllerContext,
  item: LauncherItem,
): Promise<void> {
  const { adapter, popup, session } = context;

  if (item.action === 'open-options' || session.isBusy) {
    return;
  }

  const actionToken = captureOpenPopupActionToken(session);

  if (!actionToken) {
    return;
  }

  session.isBusy = true;
  popup.setBusy(true);

  try {
    if (shouldFailClipboardWriteForTest()) {
      throw new Error('mock clipboard write failure');
    }

    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API is not available.');
    }

    const content = await readPromptBodyContentForContentAction(item.id);

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    await navigator.clipboard.writeText(content);

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    const didClose = await closePopup(context, 'copy', true, {
      reopenOnCleanupFailure: false,
      showCleanupFailureToast: false,
    });

    if (!didClose) {
      return;
    }

    showToast(translate(context.getLocale(), 'content.toast.copySuccess'));
  } catch (error) {
    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    console.error('[promptit] Failed to copy prompt content.', error);
    session.isBusy = false;
    popup.setBusy(false);
    if (session.activeInput?.isConnected) {
      adapter.focusInput(session.activeInput);
    }
    showToast(getCopyErrorToastMessage(context, error), 'error');
  }
}

export async function handleTogglePinned(
  context: ContentControllerContext,
  item: LauncherItem,
): Promise<void> {
  const { adapter, popup, session } = context;

  if (!isPromptLauncherItem(item) || session.isBusy) {
    return;
  }

  const activeInput = session.activeInput;
  const nextPinned = !item.pinned;
  const actionToken = captureOpenPopupActionToken(session);

  if (!actionToken) {
    return;
  }

  session.isBusy = true;
  popup.setBusy(true);

  try {
    const response = await setPromptPinnedFromContent(item.id, nextPinned, {
      expectedUpdatedAt: item.updatedAt,
    });

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    switch (response.status) {
      case 'success':
        updatePopupUserPrompts(
          context,
          mergePromptMeta(session.items, response.meta),
        );
        showToast(
          response.meta.pinned
            ? translate(context.getLocale(), 'content.toast.pinSuccess')
            : translate(context.getLocale(), 'content.toast.unpinSuccess'),
        );
        break;
      case 'conflict':
        updatePopupUserPrompts(
          context,
          mergePromptMeta(session.items, response.currentMeta),
        );
        showToast(
          getContentRuntimeResponseToastMessage(
            context.getLocale(),
            response.messageDescriptor,
            response.message,
            'content.toast.pinConflict',
          ),
          'error',
        );
        break;
      case 'not-found':
        updatePopupUserPrompts(
          context,
          removePromptMeta(session.items, response.id),
        );
        showToast(
          getContentRuntimeResponseToastMessage(
            context.getLocale(),
            response.messageDescriptor,
            response.message,
            'content.toast.pinNotFound',
          ),
          'error',
        );
        break;
      case 'error':
        showToast(
          getContentRuntimeResponseToastMessage(
            context.getLocale(),
            response.messageDescriptor,
            response.message,
            'content.toast.pinFailed',
          ),
          'error',
        );
        break;
    }
  } catch (error) {
    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    console.error('[promptit] Failed to toggle prompt pinned state.', error);
    showToast(
      getContentRuntimeErrorToastMessage(
        error,
        context.getLocale(),
        'content.toast.pinFailed',
      ),
      'error',
    );
  } finally {
    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    session.isBusy = false;
    popup.setBusy(false);

    if (activeInput?.isConnected) {
      adapter.focusInput(activeInput);
    }
  }
}

export async function openOptionsFromPopup(
  context: ContentControllerContext,
): Promise<void> {
  if (context.session.isBusy) {
    return;
  }

  await performOpenOptionsAction(context);
}

export async function closePopup(
  context: ContentControllerContext,
  reason: CloseReason,
  cleanupTrigger: boolean,
  options: ClosePopupOptions = {},
): Promise<boolean> {
  const { adapter, popup, session } = context;

  if (session.status === 'idle') {
    return false;
  }

  clearTriggerArm(session);
  invalidatePopupActionContinuations(session);
  session.status = 'closing';
  session.closeReason = reason;

  const activeInput = session.activeInput;
  const triggerContext = session.triggerContext
    ? cloneTriggerContext(session.triggerContext)
    : null;

  if (cleanupTrigger && activeInput && triggerContext) {
    session.isBusy = true;
    popup.setBusy(true);
    session.isInternalChange = true;

    try {
      if (activeInput.isConnected) {
        adapter.focusInput(activeInput);
      }

      ensureAdapterMutation(
        adapter.removeTriggerText(activeInput, triggerContext),
        `clean up trigger text after ${reason}`,
      );
    } catch (error) {
      console.error('[promptit] Failed to clean up trigger text.', error);
      if (options.showCleanupFailureToast !== false) {
        showToast(
          translate(context.getLocale(), 'content.toast.cleanupFailed'),
          'error',
        );
      }
      if (options.reopenOnCleanupFailure !== false) {
        if (activeInput.isConnected) {
          adapter.focusInput(activeInput);
        }
        session.isBusy = false;
        popup.setBusy(false);
        session.status = 'open';
        session.closeReason = null;
        return false;
      }
    } finally {
      queueMicrotask(() => {
        session.isInternalChange = false;
      });
    }
  }

  popup.destroy();
  session.disconnectInputObserver?.();
  resetSessionState(session);
  return true;
}

async function performOpenOptionsAction(
  context: ContentControllerContext,
): Promise<boolean> {
  const { adapter, popup, session } = context;
  const activeInput = session.activeInput;
  const triggerContext = session.triggerContext
    ? cloneTriggerContext(session.triggerContext)
    : null;
  const actionToken = captureOpenPopupActionToken(session);

  if (!actionToken) {
    return false;
  }

  session.isBusy = true;
  popup.setBusy(true);

  try {
    await requestOpenOptionsPageFromContent();

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return false;
    }

    return await closePopup(
      context,
      'open-options',
      Boolean(activeInput && triggerContext),
      {
        reopenOnCleanupFailure: false,
      },
    );
  } catch (error) {
    if (!isCurrentPopupActionToken(session, actionToken)) {
      return false;
    }

    console.error('[promptit] Failed to open options page.', error);
    session.isBusy = false;
    popup.setBusy(false);
    if (activeInput?.isConnected) {
      adapter.focusInput(activeInput);
    }
    showToast(
      getContentRuntimeErrorToastMessage(
        error,
        context.getLocale(),
        'content.toast.openOptionsFailed',
      ),
      'error',
    );
    return false;
  }
}

function getSelectionErrorToastMessage(
  context: ContentControllerContext,
  error: unknown,
): string {
  if (isPromptBodyReadError(error)) {
    return translate(context.getLocale(), 'content.toast.promptBodyReadFailed');
  }

  return getContentRuntimeErrorToastMessage(
    error,
    context.getLocale(),
    'content.toast.insertFailed',
  );
}

function getCopyErrorToastMessage(
  context: ContentControllerContext,
  error: unknown,
): string {
  if (isPromptBodyReadError(error)) {
    return translate(context.getLocale(), 'content.toast.promptBodyReadFailed');
  }

  return getContentRuntimeErrorToastMessage(
    error,
    context.getLocale(),
    'content.toast.copyFailed',
  );
}
