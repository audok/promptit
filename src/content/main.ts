import { ChatGPTAdapter } from '../adapters/chatgpt';
import { cloneTriggerContext } from '../adapters/base';
import { isStarterPrompt, type PromptItem } from '../prompt/schema';
import { getPrompts, subscribeToPrompts } from '../prompt/storage';
import { OPEN_OPTIONS_PAGE_MESSAGE } from '../runtime/messages';
import { getPopupKeyAction } from './keyboard';
import { PromptPopup, type PopupRenderItem } from './popup';
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
import { showCopyToast } from './toast';
import { armTrigger, clearTriggerArm } from './trigger';

declare global {
  interface Window {
    __promptitContentInitialized__?: boolean;
  }
}

const adapter = new ChatGPTAdapter();

if (adapter.canHandle(window.location.href) && !window.__promptitContentInitialized__) {
  window.__promptitContentInitialized__ = true;
  bootstrapPromptit();
}

async function requestOpenOptionsPage(): Promise<void> {
  await chrome.runtime.sendMessage({ type: OPEN_OPTIONS_PAGE_MESSAGE });
}

function bootstrapPromptit(): void {
  const session = createSessionState();
  const popup = new PromptPopup({
    onSelect: (item) => {
      void handleSelection(item, session, popup);
    },
    onCopy: (item) => {
      void handleCopy(item, session, popup);
    },
    onExit: () => {
      void closePopup(session, popup, 'escape', true);
    },
    onOpenOptions: () => {
      void openOptionsFromPopup(session, popup);
    },
    onActiveCellChange: (nextActiveCell) => {
      setActiveCell(session, nextActiveCell);
    },
  });

  subscribeToPrompts((nextItems) => {
    handlePromptStorageChange(nextItems, session, popup);
  });

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
      scheduleTriggerCheck(input, session, popup);
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
        void closePopup(session, popup, 'typing', false);
        return;
      }

      if (session.isComposing) {
        return;
      }

      scheduleTriggerCheck(input, session, popup);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (session.status !== 'open') {
        return;
      }

      if (session.isBusy) {
        event.preventDefault();
        return;
      }

      const action = getPopupKeyAction(event);

      if (action.preventDefault) {
        event.preventDefault();
      }

      if (action.type === 'close') {
        void closePopup(session, popup, action.reason, action.cleanupTrigger);
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

        const popupItem = toPopupRenderItem(selectedItem);

        if (session.activeCell?.column === 'copy') {
          void handleCopy(popupItem, session, popup);
          return;
        }

        void handleSelection(popupItem, session, popup);
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

      void closePopup(session, popup, 'outside-click', true);
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

      void closePopup(session, popup, 'blur', true);
    },
    true,
  );

  window.addEventListener(
    'scroll',
    () => {
      if (session.status !== 'open' || session.isBusy) {
        return;
      }

      if (!session.activeInput || !session.activeInput.isConnected) {
        void closePopup(session, popup, 'dom-removed', true);
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
        void closePopup(session, popup, 'resize', true);
      }
    },
    true,
  );
}

function scheduleTriggerCheck(
  input: HTMLElement,
  session: PopupSessionState,
  popup: PromptPopup,
): void {
  session.activeInput = input;
  armTrigger(session, (requestId) => {
    void resolveTriggerCheck(input, requestId, session, popup);
  });
}

async function resolveTriggerCheck(
  input: HTMLElement,
  requestId: number,
  session: PopupSessionState,
  popup: PromptPopup,
): Promise<void> {
  if (
    session.isComposing ||
    session.status === 'closing' ||
    requestId !== session.triggerRequestId
  ) {
    return;
  }

  if (!input.isConnected || !isFocusedInput(input)) {
    clearTriggerArm(session);
    if (session.activeInput === input) {
      session.activeInput = null;
    }
    return;
  }

  const triggerContext = adapter.createTriggerContext(input);

  if (!triggerContext) {
    clearTriggerArm(session);
    if (session.activeInput === input) {
      session.activeInput = null;
    }
    return;
  }

  const items = await getPrompts();

  if (requestId !== session.triggerRequestId || isSessionClosing(session)) {
    return;
  }

  clearTriggerArm(session);
  session.status = 'open';
  session.activeInput = input;
  session.triggerContext = cloneTriggerContext(triggerContext);
  session.items = items;
  session.activeCell = getInitialActiveCell(items);

  popup.show(items, session.activeCell, adapter.getPopupAnchorRect(input));

  const observer = new MutationObserver(() => {
    if (session.status === 'open' && session.activeInput && !session.activeInput.isConnected) {
      void closePopup(session, popup, 'dom-removed', true);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  session.disconnectInputObserver?.();
  session.disconnectInputObserver = () => observer.disconnect();
}

async function handleSelection(
  item: PopupRenderItem,
  session: PopupSessionState,
  popup: PromptPopup,
): Promise<void> {
  if (session.isBusy) {
    return;
  }

  const activeInput = session.activeInput;
  const triggerContext = session.triggerContext
    ? cloneTriggerContext(session.triggerContext)
    : null;

  if (!activeInput || !triggerContext) {
    await closePopup(session, popup, 'insert', false);
    return;
  }

  session.status = 'closing';
  session.isInternalChange = true;
  popup.destroy();
  session.disconnectInputObserver?.();

  try {
    if (item.action === 'open-options') {
      ensureAdapterMutation(
        adapter.removeTriggerText(activeInput, triggerContext),
        'remove trigger before opening options',
      );
      await requestOpenOptionsPage();
    } else {
      adapter.focusInput(activeInput);
      ensureAdapterMutation(
        adapter.insertPrompt(activeInput, item.content, triggerContext),
        'insert prompt content',
      );
    }
  } catch (error) {
    console.error('[promptit] Failed to handle popup selection.', error);
  } finally {
    queueMicrotask(() => {
      session.isInternalChange = false;
    });
    resetSessionState(session);
  }
}

async function handleCopy(
  item: PopupRenderItem,
  session: PopupSessionState,
  popup: PromptPopup,
): Promise<void> {
  if (item.action === 'open-options' || session.isBusy) {
    return;
  }

  session.isBusy = true;
  popup.setBusy(true);

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API is not available.');
    }

    await navigator.clipboard.writeText(item.content);
    showCopyToast('프롬프트를 복사했습니다.');
    await closePopup(session, popup, 'copy', true);
  } catch (error) {
    console.error('[promptit] Failed to copy prompt content.', error);
    session.isBusy = false;
    popup.setBusy(false);
    showCopyToast('프롬프트 복사에 실패했습니다.', 'error');
  }
}

async function openOptionsFromPopup(
  session: PopupSessionState,
  popup: PromptPopup,
): Promise<void> {
  if (session.isBusy) {
    return;
  }

  await closePopup(session, popup, 'open-options', true);
  await requestOpenOptionsPage();
}

async function closePopup(
  session: PopupSessionState,
  popup: PromptPopup,
  reason: CloseReason,
  cleanupTrigger: boolean,
): Promise<void> {
  if (session.status === 'idle') {
    return;
  }

  clearTriggerArm(session);
  session.status = 'closing';
  session.closeReason = reason;

  const activeInput = session.activeInput;
  const triggerContext = session.triggerContext
    ? cloneTriggerContext(session.triggerContext)
    : null;

  popup.destroy();
  session.disconnectInputObserver?.();

  if (cleanupTrigger && activeInput && triggerContext) {
    session.isInternalChange = true;

    try {
      ensureAdapterMutation(
        adapter.removeTriggerText(activeInput, triggerContext),
        `clean up trigger text after ${reason}`,
      );
    } catch (error) {
      console.error('[promptit] Failed to clean up trigger text.', error);
    } finally {
      queueMicrotask(() => {
        session.isInternalChange = false;
      });
    }
  }

  resetSessionState(session);
}

function toPopupRenderItem(item: PromptItem): PopupRenderItem {
  return {
    ...item,
    action: isStarterPrompt(item) ? 'open-options' : 'insert',
  };
}

function getSelectedPopupItem(session: PopupSessionState): PromptItem | null {
  if (!session.activeCell) {
    return null;
  }

  return session.items[session.activeCell.rowIndex] ?? null;
}

function resolveNextActiveCell(
  previousItems: PromptItem[],
  nextItems: PromptItem[],
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
  nextItems: PromptItem[],
  session: PopupSessionState,
  popup: PromptPopup,
): void {
  if (session.status !== 'open' || !session.activeInput || !session.activeInput.isConnected) {
    return;
  }

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

function isSessionClosing(session: PopupSessionState): boolean {
  return session.status === 'closing';
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

function ensureAdapterMutation(result: boolean, action: string): void {
  if (!result) {
    throw new Error(`[promptit] Adapter failed to ${action}.`);
  }
}
