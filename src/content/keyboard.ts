import type { CloseReason } from './session';

export type PopupKeyAction =
  | {
      type: 'none';
      preventDefault: boolean;
    }
  | {
      type: 'close';
      preventDefault: boolean;
      cleanupTrigger: boolean;
      reason: CloseReason;
    }
  | {
      type: 'select-active';
      preventDefault: boolean;
    };

const PASSIVE_MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const BLOCKED_NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Delete',
  'Tab',
]);

function isPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey;
}

export function getPopupKeyAction(event: KeyboardEvent): PopupKeyAction {
  if (PASSIVE_MODIFIER_KEYS.has(event.key)) {
    return {
      type: 'none',
      preventDefault: false,
    };
  }

  if (BLOCKED_NAVIGATION_KEYS.has(event.key)) {
    return {
      type: 'none',
      preventDefault: true,
    };
  }

  if (event.key === 'Escape') {
    return {
      type: 'close',
      preventDefault: true,
      cleanupTrigger: true,
      reason: 'escape',
    };
  }

  if (event.key === 'Backspace') {
    return {
      type: 'close',
      preventDefault: true,
      cleanupTrigger: true,
      reason: 'backspace',
    };
  }

  if (event.key === 'Enter') {
    return {
      type: 'select-active',
      preventDefault: true,
    };
  }

  if (isPrintableKey(event)) {
    return {
      type: 'close',
      preventDefault: false,
      cleanupTrigger: false,
      reason: 'typing',
    };
  }

  return {
    type: 'none',
    preventDefault: false,
  };
}
