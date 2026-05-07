import {
  type BaseAdapter,
  type AdapterMutationResult,
  cloneTriggerContext,
} from '../adapters/base';
import { resolveAdapterForUrl } from '../adapters/registry';
import { type PromptItem } from '../prompt/schema';
import { getPrompts, subscribeToPrompts } from '../prompt/storage';
import {
  OPEN_OPTIONS_PAGE_MESSAGE,
  buildOpenOptionsPageRequest,
  parsePromptitRuntimeResponse,
} from '../runtime/messages';
import {
  buildLauncherItems,
  type LauncherItem,
} from './launcher-items';
import { getPopupKeyAction } from './keyboard';
import { PromptPopup } from './popup';
import {
  clampActiveCell,
  createSessionState,
  getInitialActiveCell,
  isSameActiveCell,
  moveActiveCell,
  resetSessionState,
  setActiveCell,
  type CloseReason,
  type PopupActiveCell,
  type PopupSessionState,
} from './session';
import { showToast } from './toast';
import { armTrigger, clearTriggerArm } from './trigger';

declare global {
  interface Window {
    __promptitContentInitialized__?: boolean;
  }
}

const IS_TEST_MODE = import.meta.env.VITE_PROMPTIT_TEST_MODE === '1';
const TEST_READY_ATTRIBUTE = 'data-promptit-ready';
const TEST_OPEN_OPTIONS_EVENT = 'promptit:test-open-options-page';
const TEST_SET_CONTROLS_EVENT = 'promptit:test-set-controls';
const TEST_FAIL_OPEN_OPTIONS_STORAGE_KEY = 'promptit:test-fail-open-options';

type TestControlState = {
  failClipboardWrite: boolean;
  failOpenOptions: boolean;
  failPromptRead: boolean;
};

type AdapterMutationRecord = {
  error?: unknown;
  kind?: unknown;
  message?: unknown;
  ok?: unknown;
  reason?: unknown;
  status?: unknown;
  success?: unknown;
  type?: unknown;
};

const testControlState: TestControlState = {
  failClipboardWrite: false,
  failOpenOptions: false,
  failPromptRead: false,
};

type ClosePopupOptions = {
  reopenOnCleanupFailure?: boolean;
};

export function bootstrapContentScript(): void {
  const adapter = resolveAdapterForUrl(window.location.href);

  if (!adapter || window.__promptitContentInitialized__) {
    return;
  }

  window.__promptitContentInitialized__ = true;

  const session = createSessionState();
  const popup = new PromptPopup({
    onSelect: (item) => {
      void handleSelection(item, session, popup, adapter);
    },
    onCopy: (item) => {
      void handleCopy(item, session, popup, adapter);
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

  subscribeToPrompts((nextItems) => {
    handlePromptStorageChange(nextItems, session, popup, adapter);
  });

  registerDocumentListeners(session, popup, adapter);
  registerWindowListeners(session, popup, adapter);
  registerTestListeners();
  markTestReady();
}

function markTestReady(): void {
  if (!IS_TEST_MODE) {
    return;
  }

  document.documentElement.setAttribute(TEST_READY_ATTRIBUTE, 'true');
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
      scheduleTriggerCheck(input, session, popup, adapter);
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

      if (session.status === 'open') {
        void closePopup(session, popup, adapter, 'typing', false);
        return;
      }

      if (session.isComposing) {
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

      const action = getPopupKeyAction(event);
      const isHandledPopupKey = action.type !== 'none' || action.preventDefault;

      if (!isHandledPopupKey) {
        return;
      }

      consumePopupKeyEvent(event, action.preventDefault || session.isBusy);

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
        void closePopup(session, popup, adapter, 'dom-removed', true);
        return;
      }

      popup.update(
        session.items,
        session.activeCell,
        adapter.getPopupAnchorRect(session.activeInput),
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

function registerTestListeners(): void {
  if (!IS_TEST_MODE) {
    return;
  }

  document.addEventListener(TEST_OPEN_OPTIONS_EVENT, () => {
    void requestOpenOptionsPage();
  });

  document.addEventListener(TEST_SET_CONTROLS_EVENT, (event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const detail = event.detail;

    if (!detail || typeof detail !== 'object') {
      return;
    }

    if ('failClipboardWrite' in detail) {
      testControlState.failClipboardWrite = Boolean(detail.failClipboardWrite);
    }

    if ('failOpenOptions' in detail) {
      testControlState.failOpenOptions = Boolean(detail.failOpenOptions);
    }

    if ('failPromptRead' in detail) {
      testControlState.failPromptRead = Boolean(detail.failPromptRead);
    }
  });
}

async function requestOpenOptionsPage(): Promise<void> {
  if (IS_TEST_MODE) {
    await chrome.storage.local.set({
      [TEST_FAIL_OPEN_OPTIONS_STORAGE_KEY]: testControlState.failOpenOptions,
    });
  }

  const response = parsePromptitRuntimeResponse(
    await chrome.runtime.sendMessage(buildOpenOptionsPageRequest()) as unknown,
  );

  if (!response) {
    throw new Error('Invalid open options response.');
  }

  switch (response.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      if (!response.ok) {
        throw new Error(response.message);
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
  session.activeInput = input;
  armTrigger(session, (requestId) => {
    void resolveTriggerCheck(input, requestId, session, popup, adapter);
  });
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

  const items = buildLauncherItems(userPrompts);

  clearTriggerArm(session);
  session.status = 'open';
  session.activeInput = input;
  session.triggerContext = cloneTriggerContext(triggerContext);
  session.items = items;
  session.activeCell = getInitialActiveCell(items);

  popup.show(items, session.activeCell, adapter.getPopupAnchorRect(input));

  const observer = new MutationObserver(() => {
    if (session.status === 'open' && session.activeInput && !session.activeInput.isConnected) {
      void closePopup(session, popup, adapter, 'dom-removed', true);
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
): Promise<PromptItem[] | null> {
  try {
    if (IS_TEST_MODE && testControlState.failPromptRead) {
      throw new Error('mock prompt read failure');
    }

    return await getPrompts();
  } catch (error) {
    console.error('[promptit] Failed to read prompts before opening popup.', error);

    if (!shouldAbortTriggerCheck(input, requestId, session)) {
      clearTriggerForInput(input, session);
      showToast('프롬프트 목록을 읽지 못했습니다.', 'error');
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

  session.isBusy = true;
  popup.setBusy(true);

  try {
    if (item.action === 'open-options') {
      await performOpenOptionsAction(session, popup, adapter);
      return;
    }

    adapter.focusInput(activeInput);
    session.isInternalChange = true;
    ensureAdapterMutation(
      adapter.insertPrompt(activeInput, item.content, triggerContext),
      'insert prompt content',
    );

    await closePopup(session, popup, adapter, 'insert', false);
  } catch (error) {
    console.error('[promptit] Failed to handle popup selection.', error);
    session.isBusy = false;
    popup.setBusy(false);
    if (activeInput.isConnected) {
      adapter.focusInput(activeInput);
    }
    showToast(
      error instanceof Error
        ? error.message
        : '프롬프트 처리 중 오류가 발생했습니다.',
      'error',
    );
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

  session.isBusy = true;
  popup.setBusy(true);

  try {
    if (IS_TEST_MODE && testControlState.failClipboardWrite) {
      throw new Error('mock clipboard write failure');
    }

    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API is not available.');
    }

    await navigator.clipboard.writeText(item.content);
    const didClose = await closePopup(session, popup, adapter, 'copy', true);

    if (!didClose) {
      return;
    }

    showToast('프롬프트를 복사했습니다.');
  } catch (error) {
    console.error('[promptit] Failed to copy prompt content.', error);
    session.isBusy = false;
    popup.setBusy(false);
    if (session.activeInput?.isConnected) {
      adapter.focusInput(session.activeInput);
    }
    showToast('프롬프트 복사에 실패했습니다.', 'error');
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
      ensureAdapterMutation(
        adapter.removeTriggerText(activeInput, triggerContext),
        `clean up trigger text after ${reason}`,
      );
    } catch (error) {
      console.error('[promptit] Failed to clean up trigger text.', error);
      showToast('입력창 정리에 실패했습니다.', 'error');
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

  session.isBusy = true;
  popup.setBusy(true);

  try {
    await requestOpenOptionsPage();
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
    console.error('[promptit] Failed to open options page.', error);
    session.isBusy = false;
    popup.setBusy(false);
    if (activeInput?.isConnected) {
      adapter.focusInput(activeInput);
    }
    showToast('설정 페이지를 열지 못했습니다.', 'error');
    return false;
  }
}

function getSelectedPopupItem(session: PopupSessionState): LauncherItem | null {
  if (!session.activeCell) {
    return null;
  }

  return session.items[session.activeCell.rowIndex] ?? null;
}

function resolveNextActiveCell(
  previousItems: LauncherItem[],
  nextItems: LauncherItem[],
  currentActiveCell: PopupActiveCell | null,
): PopupActiveCell | null {
  if (currentActiveCell) {
    const currentItem = previousItems[currentActiveCell.rowIndex];

    if (currentItem) {
      const nextIndex = nextItems.findIndex((item) => item.id === currentItem.id);

      if (nextIndex >= 0) {
        return clampActiveCell(nextItems, {
          rowIndex: nextIndex,
          column: currentActiveCell.column,
        });
      }
    }
  }

  return clampActiveCell(nextItems, currentActiveCell);
}

function handlePromptStorageChange(
  nextUserPrompts: PromptItem[],
  session: PopupSessionState,
  popup: PromptPopup,
  adapter: BaseAdapter,
): void {
  if (session.status !== 'open' || !session.activeInput || !session.activeInput.isConnected) {
    return;
  }

  const nextItems = buildLauncherItems(nextUserPrompts);
  const nextActiveCell = resolveNextActiveCell(
    session.items,
    nextItems,
    session.activeCell,
  );

  session.items = nextItems;
  session.activeCell = nextActiveCell;

  popup.update(
    nextItems,
    nextActiveCell,
    adapter.getPopupAnchorRect(session.activeInput),
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

function ensureAdapterMutation(
  result: AdapterMutationResult,
  action: string,
): void {
  const failureDetail = getAdapterMutationFailureDetail(result);

  if (failureDetail === null) {
    return;
  }

  if (failureDetail.length > 0) {
    console.error(`[promptit] Adapter mutation detail for ${action}: ${failureDetail}`);
  }

  throw new Error(`[promptit] Adapter failed to ${action}.`);
}

function getAdapterMutationFailureDetail(
  result: AdapterMutationResult,
): string | null {
  if (result.ok) {
    return null;
  }

  const record = result as AdapterMutationRecord;
  const outcome = resolveAdapterMutationOutcome(record);

  if (outcome === 'success') {
    return null;
  }

  if (outcome === 'failure') {
    return firstNonEmptyString(
      record.message,
      record.reason,
      record.error,
    ) ?? '';
  }

  return '';
}

function resolveAdapterMutationOutcome(
  record: AdapterMutationRecord,
): 'success' | 'failure' | 'unknown' {
  if (record.ok === true || record.success === true) {
    return 'success';
  }

  if (record.ok === false || record.success === false) {
    return 'failure';
  }

  const discriminator = firstNonEmptyString(
    record.status,
    record.type,
    record.kind,
  )?.toLowerCase();

  if (
    discriminator === 'success' ||
    discriminator === 'ok'
  ) {
    return 'success';
  }

  if (
    discriminator === 'error' ||
    discriminator === 'failure' ||
    discriminator === 'failed'
  ) {
    return 'failure';
  }

  return 'unknown';
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}
