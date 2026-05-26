import {
  sortPromptMetas,
  type PromptMeta,
} from '../prompt/schema';
import type { Locale } from '../shared/i18n';
import {
  buildLauncherItems,
  isPromptLauncherItem,
  type LauncherItem,
} from './launcher-items';
import {
  clampActiveCell,
  type PopupActiveCell,
} from './session';

export type PopupItemsRefresh = {
  items: LauncherItem[];
  activeCell: PopupActiveCell | null;
};

export function resolveNextActiveCell(
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

export function mergePromptMeta(
  items: LauncherItem[],
  nextMeta: PromptMeta,
): PromptMeta[] {
  const promptMetas = items.filter(isPromptLauncherItem);
  const didReplace = promptMetas.some((item) => item.id === nextMeta.id);
  const nextMetas = promptMetas.map((item) =>
    item.id === nextMeta.id ? nextMeta : item,
  );

  if (!didReplace) {
    nextMetas.push(nextMeta);
  }

  return sortPromptMetas(nextMetas);
}

export function removePromptMeta(
  items: LauncherItem[],
  id: string,
): PromptMeta[] {
  return sortPromptMetas(
    items.filter(isPromptLauncherItem).filter((item) => item.id !== id),
  );
}

export function reconcilePopupItems(
  previousItems: LauncherItem[],
  nextUserPrompts: PromptMeta[],
  currentActiveCell: PopupActiveCell | null,
  locale?: Locale,
): PopupItemsRefresh {
  const items = buildLauncherItems(nextUserPrompts, locale);

  return {
    items,
    activeCell: resolveNextActiveCell(
      previousItems,
      items,
      currentActiveCell,
    ),
  };
}
