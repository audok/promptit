import type { PromptMeta } from '../prompt/schema';
import {
  FALLBACK_LOCALE,
  translate,
  type Locale,
} from '../shared/i18n';

export type PromptLauncherItem = PromptMeta & {
  kind: 'prompt';
  action: 'insert';
};

export type EmptyStateLauncherItem = {
  kind: 'empty-state';
  id: '__promptit_empty_state__';
  title: string;
  description: string;
  action: 'open-options';
};

export type LauncherItem = PromptLauncherItem | EmptyStateLauncherItem;

export const EMPTY_STATE_LAUNCHER_ITEM_ID = '__promptit_empty_state__';

export function buildLauncherItems(
  userPrompts: PromptMeta[],
  locale: Locale = FALLBACK_LOCALE,
): LauncherItem[] {
  if (userPrompts.length === 0) {
    return [
      {
        kind: 'empty-state',
        id: EMPTY_STATE_LAUNCHER_ITEM_ID,
        title: translate(locale, 'content.popup.emptyTitle'),
        description: translate(locale, 'content.popup.emptyDescription'),
        action: 'open-options',
      },
    ];
  }

  return userPrompts.map((prompt) => ({
    ...prompt,
    kind: 'prompt' as const,
    action: 'insert' as const,
  }));
}

export function isPromptLauncherItem(
  item: LauncherItem,
): item is PromptLauncherItem {
  return item.kind === 'prompt';
}
