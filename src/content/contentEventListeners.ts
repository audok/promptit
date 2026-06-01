import type { ContentControllerContext } from './controllerContext';
import { getPopupKeyAction } from './keyboard';
import {
  closePopup,
  handleCopy,
  handleSelection,
  handleTogglePinned,
} from './popupActions';
import { getSelectedPopupItem } from './popupView';
import {
  isSameActiveCell,
  moveActiveCell,
  setActiveCell,
} from './session';
import {
  canScheduleTriggerCheck,
  scheduleTriggerCheck,
} from './triggerLifecycle';

const IME_PROCESS_KEY = 'Process';

export function registerDocumentListeners(
  context: ContentControllerContext,
): void {
  const { adapter, popup, session } = context;

  document.addEventListener(
    'compositionstart',
    (event) => {
      if (!event.isTrusted) {
        return;
      }

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
      if (!event.isTrusted) {
        return;
      }

      const input = adapter.resolveTargetInput(event.target);

      if (!input) {
        return;
      }

      session.isComposing = false;

      if (canScheduleTriggerCheck(session, input)) {
        scheduleTriggerCheck(context, input);
      }
    },
    true,
  );

  document.addEventListener(
    'input',
    (event) => {
      if (!event.isTrusted) {
        return;
      }

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
        void closePopup(context, 'typing', false);
        return;
      }

      scheduleTriggerCheck(context, input);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (!event.isTrusted) {
        return;
      }

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
        void closePopup(context, action.reason, action.cleanupTrigger);
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
          void handleTogglePinned(context, selectedItem);
          return;
        }

        if (session.activeCell?.column === 'copy') {
          void handleCopy(context, selectedItem);
          return;
        }

        void handleSelection(context, selectedItem);
      }
    },
    true,
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isTrusted) {
        return;
      }

      if (session.status !== 'open' || session.isBusy) {
        return;
      }

      if (popup.containsEvent(event)) {
        return;
      }

      void closePopup(context, 'outside-click', true);
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

      void closePopup(context, 'blur', true);
    },
    true,
  );
}

export function registerWindowListeners(
  context: ContentControllerContext,
): void {
  const { adapter, popup, session } = context;

  window.addEventListener(
    'scroll',
    () => {
      if (session.status !== 'open' || session.isBusy) {
        return;
      }

      if (!session.activeInput || !session.activeInput.isConnected) {
        void closePopup(context, 'dom-removed', false);
        return;
      }

      popup.reposition(adapter.getPopupAnchorRect(session.activeInput));
    },
    true,
  );

  window.addEventListener(
    'resize',
    () => {
      if (session.status === 'open' && !session.isBusy) {
        void closePopup(context, 'resize', true);
      }
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
