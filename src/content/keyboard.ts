import type { ActiveCellDirection, CloseReason } from './session';

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
    }
  | {
      type: 'move-active';
      direction: ActiveCellDirection;
      preventDefault: boolean;
    };

const PASSIVE_MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const PASSIVE_CONTROL_KEYS = new Set(['Delete']);

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

  if (PASSIVE_CONTROL_KEYS.has(event.key)) {
    return {
      type: 'none',
      preventDefault: true,
    };
  }

  if (event.key === 'ArrowUp') {
    return {
      type: 'move-active',
      direction: 'up',
      preventDefault: true,
    };
  }

  if (event.key === 'ArrowDown') {
    return {
      type: 'move-active',
      direction: 'down',
      preventDefault: true,
    };
  }

  if (event.key === 'ArrowLeft') {
    return {
      type: 'move-active',
      direction: 'left',
      preventDefault: true,
    };
  }

  if (event.key === 'ArrowRight') {
    return {
      type: 'move-active',
      direction: 'right',
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

  if (event.key === 'Tab') {
    return {
      type: 'close',
      preventDefault: false,
      cleanupTrigger: true,
      reason: 'blur',
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
