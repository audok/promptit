import type { TriggerContext } from '../adapters/base';
import {
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';

export type SessionStatus = 'idle' | 'armed' | 'open' | 'closing';
export type ActiveCellColumn = 'title' | 'copy';
export type ActiveCellDirection = 'up' | 'down' | 'left' | 'right';
export type PopupActiveCell = {
  rowIndex: number;
  column: ActiveCellColumn;
};

export type CloseReason =
  | 'escape'
  | 'backspace'
  | 'blur'
  | 'outside-click'
  | 'scroll'
  | 'resize'
  | 'dom-removed'
  | 'typing'
  | 'copy'
  | 'insert'
  | 'open-options';

export type PopupSessionState = {
  status: SessionStatus;
  activeInput: HTMLElement | null;
  triggerContext: TriggerContext | null;
  items: LauncherItem[];
  activeCell: PopupActiveCell | null;
  closeReason: CloseReason | null;
  armedTimer: number | null;
  triggerRequestId: number;
  isComposing: boolean;
  isInternalChange: boolean;
  isBusy: boolean;
  disconnectInputObserver: (() => void) | null;
};

export function createSessionState(): PopupSessionState {
  return {
    status: 'idle',
    activeInput: null,
    triggerContext: null,
    items: [],
    activeCell: null,
    closeReason: null,
    armedTimer: null,
    triggerRequestId: 0,
    isComposing: false,
    isInternalChange: false,
    isBusy: false,
    disconnectInputObserver: null,
  };
}

export function setActiveCell(
  session: PopupSessionState,
  nextCell: PopupActiveCell | null,
): void {
  session.activeCell = nextCell;
}

function canUseColumn(
  item: LauncherItem | undefined,
  column: ActiveCellColumn,
): boolean {
  if (!item) {
    return false;
  }

  return column === 'title' || isPromptLauncherItem(item);
}

export function getInitialActiveCell(
  items: LauncherItem[],
): PopupActiveCell | null {
  return items.length > 0
    ? {
        rowIndex: 0,
        column: 'title',
      }
    : null;
}

export function clampActiveCell(
  items: LauncherItem[],
  preferred: PopupActiveCell | null,
): PopupActiveCell | null {
  if (items.length === 0) {
    return null;
  }

  const fallbackCell = getInitialActiveCell(items);

  if (!preferred) {
    return fallbackCell;
  }

  const rowIndex = Math.min(Math.max(preferred.rowIndex, 0), items.length - 1);
  const item = items[rowIndex];

  if (!item) {
    return fallbackCell;
  }

  const column = canUseColumn(item, preferred.column) ? preferred.column : 'title';

  return {
    rowIndex,
    column,
  };
}

export function moveActiveCell(
  items: LauncherItem[],
  current: PopupActiveCell | null,
  direction: ActiveCellDirection,
): PopupActiveCell | null {
  const baseCell = clampActiveCell(items, current);

  if (!baseCell) {
    return null;
  }

  if (direction === 'left') {
    return {
      ...baseCell,
      column: 'title',
    };
  }

  if (direction === 'right') {
    return clampActiveCell(items, {
      ...baseCell,
      column: 'copy',
    });
  }

  const rowDelta = direction === 'up' ? -1 : 1;

  return clampActiveCell(items, {
    rowIndex: baseCell.rowIndex + rowDelta,
    column: baseCell.column,
  });
}

export function isSameActiveCell(
  left: PopupActiveCell | null,
  right: PopupActiveCell | null,
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.rowIndex === right.rowIndex && left.column === right.column;
}

export function resetSessionState(session: PopupSessionState): void {
  if (session.armedTimer !== null) {
    window.clearTimeout(session.armedTimer);
  }

  session.disconnectInputObserver?.();
  session.status = 'idle';
  session.activeInput = null;
  session.triggerContext = null;
  session.items = [];
  session.activeCell = null;
  session.closeReason = null;
  session.armedTimer = null;
  session.isBusy = false;
  session.disconnectInputObserver = null;
}
