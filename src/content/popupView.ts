import type { PromptMeta } from '../prompt/schema';
import {
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';
import type { ContentControllerContext } from './controllerContext';
import { reconcilePopupItems } from './popupRefresh';
import type { PopupSessionState } from './session';

export function refreshOpenPopupLocalization(
  context: ContentControllerContext,
): void {
  const { adapter, popup, session } = context;

  if (session.status !== 'open' || !session.activeInput?.isConnected) {
    return;
  }

  const nextUserPrompts = session.items.filter(isPromptLauncherItem);
  const { items, activeCell } = reconcilePopupItems(
    session.items,
    nextUserPrompts,
    session.activeCell,
    context.getLocale(),
  );

  session.items = items;
  session.activeCell = activeCell;

  popup.update(
    items,
    activeCell,
    adapter.getPopupAnchorRect(session.activeInput),
    context.getLocale(),
    context.getTheme(),
  );
}

export function refreshOpenPopupTheme(
  context: ContentControllerContext,
): void {
  const { adapter, popup, session } = context;

  if (session.status !== 'open' || !session.activeInput?.isConnected) {
    popup.setTheme(context.getTheme());
    return;
  }

  popup.setTheme(context.getTheme());
  popup.update(
    session.items,
    session.activeCell,
    adapter.getPopupAnchorRect(session.activeInput),
    context.getLocale(),
    context.getTheme(),
  );
}

export function updatePopupUserPrompts(
  context: ContentControllerContext,
  nextUserPrompts: PromptMeta[],
): void {
  const { adapter, popup, session } = context;

  if (session.status !== 'open' || !session.activeInput?.isConnected) {
    return;
  }

  const { items, activeCell } = reconcilePopupItems(
    session.items,
    nextUserPrompts,
    session.activeCell,
    context.getLocale(),
  );

  session.items = items;
  session.activeCell = activeCell;

  popup.update(
    items,
    activeCell,
    adapter.getPopupAnchorRect(session.activeInput),
    context.getLocale(),
    context.getTheme(),
  );
}

export function getSelectedPopupItem(
  session: PopupSessionState,
): LauncherItem | null {
  if (!session.activeCell) {
    return null;
  }

  return session.items[session.activeCell.rowIndex] ?? null;
}
