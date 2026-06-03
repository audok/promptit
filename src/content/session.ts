import type { TriggerContext } from '../adapters/base';
import {
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';

export type SessionStatus = 'idle' | 'armed' | 'open' | 'closing';
export type ActiveCellColumn = 'pin' | 'title' | 'copy';
export type ActiveCellDirection = 'up' | 'down' | 'left' | 'right';
export type PopupActiveCell = {
  rowIndex: number;
  column: ActiveCellColumn;
};

export type PopupActionToken = {
  actionRequestId: number;
  activeInput: HTMLElement;
  triggerContext: TriggerContext;
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
  actionRequestId: number;
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
    actionRequestId: 0,
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

export function invalidateTriggerRequestId(
  session: PopupSessionState,
): number {
  session.triggerRequestId += 1;
  return session.triggerRequestId;
}

export function invalidatePopupActionContinuations(
  session: PopupSessionState,
): number {
  session.actionRequestId += 1;
  return session.actionRequestId;
}

export function captureOpenPopupActionToken(
  session: PopupSessionState,
): PopupActionToken | null {
  if (
    session.status !== 'open' ||
    !session.activeInput?.isConnected ||
    !session.triggerContext
  ) {
    return null;
  }

  return {
    actionRequestId: session.actionRequestId,
    activeInput: session.activeInput,
    triggerContext: session.triggerContext,
  };
}

export function isCurrentPopupActionToken(
  session: PopupSessionState,
  token: PopupActionToken,
): boolean {
  return (
    session.actionRequestId === token.actionRequestId &&
    session.status === 'open' &&
    session.activeInput === token.activeInput &&
    session.activeInput.isConnected &&
    session.triggerContext === token.triggerContext
  );
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
    const nextColumn: ActiveCellColumn =
      baseCell.column === 'copy' ? 'title' : 'pin';

    return clampActiveCell(items, {
      ...baseCell,
      column: nextColumn,
    });
  }

  if (direction === 'right') {
    const nextColumn: ActiveCellColumn =
      baseCell.column === 'pin' ? 'title' : 'copy';

    return clampActiveCell(items, {
      ...baseCell,
      column: nextColumn,
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
  invalidateTriggerRequestId(session);
  invalidatePopupActionContinuations(session);
  session.status = 'idle';
  session.activeInput = null;
  session.triggerContext = null;
  session.items = [];
  session.activeCell = null;
  session.closeReason = null;
  session.armedTimer = null;
  session.isComposing = false;
  session.isInternalChange = false;
  session.isBusy = false;
  session.disconnectInputObserver = null;
}
