import {
  type BaseAdapter,
  cloneTriggerContext,
} from '../adapters/base';
import { resolveAdapterForUrl } from '../adapters/registry';
import type { PromptMeta } from '../prompt/schema';
import {
  PromptitRuntimeError,
  getPromptBody,
  getPromptMetas,
  setPromptPinned,
  subscribeToPromptMetas,
} from '../prompt/storage';
import {
  OPEN_OPTIONS_PAGE_MESSAGE,
  buildOpenOptionsPageRequest,
  parsePromptitRuntimeResponse,
} from '../runtime/messages';
import {
  FALLBACK_LOCALE,
  getBrowserUiLanguage,
  readLanguagePreference,
  resolveLocale,
  subscribeToLanguagePreference,
  translate,
  translateRuntimeMessage,
  type I18nKey,
  type LanguagePreference,
  type Locale,
  type RuntimeMessageDescriptor,
} from '../shared/i18n';
import {
  buildLauncherItems,
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';
import { ensureAdapterMutation } from './adapterMutation';
import { getPopupKeyAction } from './keyboard';
import { PromptPopup } from './popup';
import {
  mergePromptMeta,
  reconcilePopupItems,
  removePromptMeta,
} from './popupRefresh';
import {
  captureOpenPopupActionToken,
  createSessionState,
  getInitialActiveCell,
  invalidatePopupActionContinuations,
  isCurrentPopupActionToken,
  isSameActiveCell,
  moveActiveCell,
  resetSessionState,
  setActiveCell,
  type CloseReason,
  type PopupSessionState,
} from './session';
import { showToast } from './toast';
import {
  markTestReady,
  prepareOpenOptionsFailureForTest,
  registerTestListeners,
  shouldFailClipboardWriteForTest,
  shouldFailPromptBodyReadForTest,
  shouldFailPromptReadForTest,
  waitForDeferredPromptBodyRead,
} from './testControls';
import { armTrigger, clearTriggerArm } from './trigger';

declare global {
  interface Window {
    __promptitContentInitialized__?: boolean;
  }
}

const IME_PROCESS_KEY = 'Process';

let currentLocale: Locale = FALLBACK_LOCALE;
let contentUiLanguage: string | undefined;

type ClosePopupOptions = {
  reopenOnCleanupFailure?: boolean;
};

class PromptBodyReadError extends Error {
  constructor() {
    super('Prompt body read failed.');
    this.name = 'PromptBodyReadError';
    Object.setPrototypeOf(this, PromptBodyReadError.prototype);
  }
}

export function bootstrapContentScript(): void {
  const adapter = resolveAdapterForUrl(window.location.href);

  if (!adapter || window.__promptitContentInitialized__) {
    return;
  }

  window.__promptitContentInitialized__ = true;
  initializeContentLanguageState();

  const session = createSessionState();
  const popup = new PromptPopup({
    onSelect: (item) => {
      void handleSelection(item, session, popup, adapter);
    },
    onCopy: (item) => {
      void handleCopy(item, session, popup, adapter);
    },
    onTogglePinned: (item) => {
      void handleTogglePinned(item, session, popup, adapter);
    },
    onExit: () => {
      void closePopup(session, popup, adapter, 'escape', true);
    },
    onOpenOptions: () => {
      void openOptionsFromPopup(session, popup, adapter);
    },
    onActiveCellChange: (nextActiveCell) => {
      setActiveCell(session, nextActiveCell);
    },
  });

  subscribeToPromptMetas((nextItems) => {
    handlePromptStorageChange(nextItems, session, popup, adapter);
  });
  void readLanguagePreference()
    .then((preference) => {
      applyContentLanguagePreference(preference, session, popup, adapter);
    })
    .catch((error) => {
      console.error('[promptit] Failed to read language preference.', error);
    });
  subscribeToLanguagePreference((preference) => {
    applyContentLanguagePreference(preference, session, popup, adapter);
  });

  registerDocumentListeners(session, popup, adapter);
  registerWindowListeners(session, popup, adapter);
  registerTestListeners(requestOpenOptionsPage);
  markTestReady();
}

function initializeContentLanguageState(): void {
  contentUiLanguage = getBrowserUiLanguage();
  currentLocale = resolveLocale({
    preference: 'system',
    uiLanguage: contentUiLanguage,
  });
}

function applyContentLanguagePreference(
  preference: LanguagePreference,
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): void {
  const nextLocale = resolveLocale({
    preference,
    uiLanguage: contentUiLanguage,
  });

  if (nextLocale === currentLocale) {
    return;
  }

  currentLocale = nextLocale;
  refreshOpenPopupLocalization(session, popup, adapter);
}

function refreshOpenPopupLocalization(
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): void {
  if (session.status !== 'open' || !session.activeInput?.isConnected) {
    return;
  }

  const nextUserPrompts = session.items.filter(isPromptLauncherItem);
  const { items, activeCell } = reconcilePopupItems(
    session.items,
    nextUserPrompts,
    session.activeCell,
    currentLocale,
  );

  session.items = items;
  session.activeCell = activeCell;

  popup.update(
    items,
    activeCell,
    adapter.getPopupAnchorRect(session.activeInput),
    currentLocale,
  );
}

function registerDocumentListeners(
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): void {
  document.addEventListener(
    'compositionstart',
    (event) => {
      const input = adapter.resolveTargetInput(event.target);

      if (!input) {
        return;
      }

      session.activeInput = input;
      session.isComposing = true;
    },
    true,
  );

  document.addEventListener(
    'compositionend',
    (event) => {
      const input = adapter.resolveTargetInput(event.target);

      if (!input) {
        return;
      }

      session.isComposing = false;

      if (canScheduleTriggerCheck(input, session)) {
        scheduleTriggerCheck(input, session, popup, adapter);
      }
    },
    true,
  );

  document.addEventListener(
    'input',
    (event) => {
      const input = adapter.resolveTargetInput(event.target);

      if (!input) {
        return;
      }

      if (session.isInternalChange || session.status === 'closing') {
        return;
      }

      if (
        session.isBusy ||
        session.isComposing ||
        event instanceof InputEvent && event.isComposing
      ) {
        return;
      }

      if (session.status === 'open') {
        void closePopup(session, popup, adapter, 'typing', false);
        return;
      }

      scheduleTriggerCheck(input, session, popup, adapter);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (session.status !== 'open') {
        return;
      }

      if (
        session.isComposing ||
        event.isComposing ||
        event.key === IME_PROCESS_KEY
      ) {
        return;
      }

      const action = getPopupKeyAction(event);
      const isHandledPopupKey = action.type !== 'none' || action.preventDefault;

      if (!isHandledPopupKey) {
        return;
      }

      consumePopupKeyEvent(
        event,
        action.preventDefault || (session.isBusy && event.key !== 'Tab'),
      );

      if (session.isBusy) {
        return;
      }

      if (action.type === 'close') {
        void closePopup(session, popup, adapter, action.reason, action.cleanupTrigger);
        return;
      }

      if (action.type === 'move-active') {
        const nextActiveCell = moveActiveCell(
          session.items,
          session.activeCell,
          action.direction,
        );

        if (isSameActiveCell(nextActiveCell, session.activeCell)) {
          return;
        }

        setActiveCell(session, nextActiveCell);
        popup.setActiveCell(nextActiveCell);
        return;
      }

      if (action.type === 'select-active') {
        const selectedItem = getSelectedPopupItem(session);

        if (!selectedItem) {
          return;
        }

        if (session.activeCell?.column === 'pin') {
          void handleTogglePinned(selectedItem, session, popup, adapter);
          return;
        }

        if (session.activeCell?.column === 'copy') {
          void handleCopy(selectedItem, session, popup, adapter);
          return;
        }

        void handleSelection(selectedItem, session, popup, adapter);
      }
    },
    true,
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (session.status !== 'open' || session.isBusy) {
        return;
      }

      if (popup.containsEvent(event)) {
        return;
      }

      void closePopup(session, popup, adapter, 'outside-click', true);
    },
    true,
  );

  document.addEventListener(
    'focusin',
    (event) => {
      if (session.status !== 'open' || session.isBusy) {
        return;
      }

      if (popup.containsEvent(event)) {
        return;
      }

      if (event.target === session.activeInput) {
        return;
      }

      void closePopup(session, popup, adapter, 'blur', true);
    },
    true,
  );
}

function consumePopupKeyEvent(
  event: KeyboardEvent,
  preventDefault: boolean,
): void {
  if (preventDefault) {
    event.preventDefault();
  }

  event.stopImmediatePropagation();
}

function registerWindowListeners(
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): void {
  window.addEventListener(
    'scroll',
    () => {
      if (session.status !== 'open' || session.isBusy) {
        return;
      }

      if (!session.activeInput || !session.activeInput.isConnected) {
        void closePopup(session, popup, adapter, 'dom-removed', false);
        return;
      }

      popup.update(
        session.items,
        session.activeCell,
        adapter.getPopupAnchorRect(session.activeInput),
        currentLocale,
      );
    },
    true,
  );

  window.addEventListener(
    'resize',
    () => {
      if (session.status === 'open' && !session.isBusy) {
        void closePopup(session, popup, adapter, 'resize', true);
      }
    },
    true,
  );
}

async function requestOpenOptionsPage(): Promise<void> {
  await prepareOpenOptionsFailureForTest();

  const response = parsePromptitRuntimeResponse(
    await chrome.runtime.sendMessage(buildOpenOptionsPageRequest()) as unknown,
  );

  if (!response) {
    throw new Error('Invalid open options response.');
  }

  switch (response.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      if (!response.ok) {
        throw new PromptitRuntimeError(
          response.message,
          response.messageDescriptor,
        );
      }
      return;
  }
}

function scheduleTriggerCheck(
  input: HTMLElement,
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): void {
  if (!canScheduleTriggerCheck(input, session)) {
    return;
  }

  session.activeInput = input;
  armTrigger(session, (requestId) => {
    void resolveTriggerCheck(input, requestId, session, popup, adapter);
  });
}

function canScheduleTriggerCheck(
  input: HTMLElement,
  session: PopupSessionState,
): boolean {
  return (
    input.isConnected &&
    !session.isBusy &&
    !session.isComposing &&
    (session.status === 'idle' || session.status === 'armed')
  );
}

async function resolveTriggerCheck(
  input: HTMLElement,
  requestId: number,
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): Promise<void> {
  if (shouldAbortTriggerCheck(input, requestId, session)) {
    return;
  }

  const triggerContext = adapter.createTriggerContext(input);

  if (!triggerContext) {
    clearTriggerForInput(input, session);
    return;
  }

  const userPrompts = await readPromptsForTrigger(input, requestId, session);

  if (!userPrompts) {
    return;
  }

  if (shouldAbortTriggerCheck(input, requestId, session)) {
    return;
  }

  const items = buildLauncherItems(userPrompts, currentLocale);

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
    currentLocale,
  );

  const observer = new MutationObserver(() => {
    if (session.status === 'open' && session.activeInput && !session.activeInput.isConnected) {
      void closePopup(session, popup, adapter, 'dom-removed', false);
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
  input: HTMLElement,
  requestId: number,
  session: PopupSessionState,
): Promise<PromptMeta[] | null> {
  try {
    if (shouldFailPromptReadForTest()) {
      throw new Error('mock prompt read failure');
    }

    return await getPromptMetas();
  } catch (error) {
    console.error('[promptit] Failed to read prompts before opening popup.', error);

    if (!shouldAbortTriggerCheck(input, requestId, session)) {
      clearTriggerForInput(input, session);
      showToast(
        translate(currentLocale, 'content.toast.promptListReadFailed'),
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

async function handleSelection(
  item: LauncherItem,
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): Promise<void> {
  if (session.isBusy) {
    return;
  }

  const activeInput = session.activeInput;
  const triggerContext = session.triggerContext
    ? cloneTriggerContext(session.triggerContext)
    : null;

  if (!activeInput || !triggerContext) {
    await closePopup(session, popup, adapter, 'insert', false);
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
      await performOpenOptionsAction(session, popup, adapter);
      return;
    }

    const content = await readPromptBodyForAction(item.id);

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    adapter.focusInput(activeInput);
    session.isInternalChange = true;
    ensureAdapterMutation(
      adapter.insertPrompt(activeInput, content, triggerContext),
      'insert prompt content',
    );

    await closePopup(session, popup, adapter, 'insert', false);
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
    showToast(getSelectionErrorToastMessage(error), 'error');
  } finally {
    queueMicrotask(() => {
      session.isInternalChange = false;
    });
  }
}

async function handleCopy(
  item: LauncherItem,
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): Promise<void> {
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

    const content = await readPromptBodyForAction(item.id);

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    await navigator.clipboard.writeText(content);

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    const didClose = await closePopup(session, popup, adapter, 'copy', true);

    if (!didClose) {
      return;
    }

    showToast(translate(currentLocale, 'content.toast.copySuccess'));
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
    showToast(getCopyErrorToastMessage(error), 'error');
  }
}

function getSelectionErrorToastMessage(error: unknown): string {
  if (error instanceof PromptBodyReadError) {
    return translate(currentLocale, 'content.toast.promptBodyReadFailed');
  }

  return getRuntimeErrorToastMessage(error, 'content.toast.insertFailed');
}

function getCopyErrorToastMessage(error: unknown): string {
  if (error instanceof PromptBodyReadError) {
    return translate(currentLocale, 'content.toast.promptBodyReadFailed');
  }

  return getRuntimeErrorToastMessage(error, 'content.toast.copyFailed');
}

function getRuntimeErrorToastMessage(
  error: unknown,
  fallbackKey: I18nKey,
): string {
  if (error instanceof PromptitRuntimeError) {
    return getRuntimeResponseToastMessage(
      error.messageDescriptor,
      error.message,
      fallbackKey,
    );
  }

  return translate(currentLocale, fallbackKey);
}

function getRuntimeResponseToastMessage(
  descriptor: RuntimeMessageDescriptor | undefined,
  fallback: string,
  fallbackKey: I18nKey,
): string {
  return translateRuntimeMessage(
    currentLocale,
    descriptor,
    fallback.trim().length > 0
      ? fallback
      : translate(currentLocale, fallbackKey),
  );
}

async function handleTogglePinned(
  item: LauncherItem,
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): Promise<void> {
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
    const response = await setPromptPinned(item.id, nextPinned, {
      expectedUpdatedAt: item.updatedAt,
    });

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return;
    }

    switch (response.status) {
      case 'success':
        applyPromptMetaUpdatesToPopup(
          session,
          popup,
          adapter,
          mergePromptMeta(session.items, response.meta),
        );
        showToast(
          response.meta.pinned
            ? translate(currentLocale, 'content.toast.pinSuccess')
            : translate(currentLocale, 'content.toast.unpinSuccess'),
        );
        break;
      case 'conflict':
        applyPromptMetaUpdatesToPopup(
          session,
          popup,
          adapter,
          mergePromptMeta(session.items, response.currentMeta),
        );
        showToast(
          getRuntimeResponseToastMessage(
            response.messageDescriptor,
            response.message,
            'content.toast.pinConflict',
          ),
          'error',
        );
        break;
      case 'not-found':
        applyPromptMetaUpdatesToPopup(
          session,
          popup,
          adapter,
          removePromptMeta(session.items, response.id),
        );
        showToast(
          getRuntimeResponseToastMessage(
            response.messageDescriptor,
            response.message,
            'content.toast.pinNotFound',
          ),
          'error',
        );
        break;
      case 'error':
        showToast(
          getRuntimeResponseToastMessage(
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
      getRuntimeErrorToastMessage(error, 'content.toast.pinFailed'),
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

async function readPromptBodyForAction(id: string): Promise<string> {
  try {
    if (shouldFailPromptBodyReadForTest()) {
      throw new Error('mock prompt body read failure');
    }

    await waitForDeferredPromptBodyRead();

    const body = await getPromptBody(id);
    return body.content;
  } catch (error) {
    console.error('[promptit] Failed to read prompt body for popup action.', error);
    throw new PromptBodyReadError();
  }
}

async function openOptionsFromPopup(
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): Promise<void> {
  if (session.isBusy) {
    return;
  }

  await performOpenOptionsAction(session, popup, adapter);
}

async function closePopup(
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
  reason: CloseReason,
  cleanupTrigger: boolean,
  options: ClosePopupOptions = {},
): Promise<boolean> {
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
      showToast(
        translate(currentLocale, 'content.toast.cleanupFailed'),
        'error',
      );
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
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): Promise<boolean> {
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
    await requestOpenOptionsPage();

    if (!isCurrentPopupActionToken(session, actionToken)) {
      return false;
    }

    return await closePopup(
      session,
      popup,
      adapter,
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
      getRuntimeErrorToastMessage(error, 'content.toast.openOptionsFailed'),
      'error',
    );
    return false;
  }
}

function getSelectedPopupItem(session: PopupSessionState): LauncherItem | null {
  if (!session.activeCell) {
    return null;
  }

  return session.items[session.activeCell.rowIndex] ?? null;
}

function applyPromptMetaUpdatesToPopup(
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
  nextUserPrompts: PromptMeta[],
): void {
  if (session.status !== 'open' || !session.activeInput?.isConnected) {
    return;
  }

  const { items, activeCell } = reconcilePopupItems(
    session.items,
    nextUserPrompts,
    session.activeCell,
    currentLocale,
  );

  session.items = items;
  session.activeCell = activeCell;

  popup.update(
    items,
    activeCell,
    adapter.getPopupAnchorRect(session.activeInput),
    currentLocale,
  );
}

function handlePromptStorageChange(
  nextUserPrompts: PromptMeta[],
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): void {
  if (session.status !== 'open' || !session.activeInput || !session.activeInput.isConnected) {
    return;
  }

  const { items, activeCell } = reconcilePopupItems(
    session.items,
    nextUserPrompts,
    session.activeCell,
    currentLocale,
  );

  session.items = items;
  session.activeCell = activeCell;

  popup.update(
    items,
    activeCell,
    adapter.getPopupAnchorRect(session.activeInput),
    currentLocale,
  );
}

function isFocusedInput(input: HTMLElement): boolean {
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
