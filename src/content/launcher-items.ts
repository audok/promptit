import type { PromptMeta } from '../prompt/schema';

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

const EMPTY_STATE_TITLE = '저장된 프롬프트가 없습니다.';
const EMPTY_STATE_DESCRIPTION = '설정에서 첫 프롬프트를 추가하세요.';

export function buildLauncherItems(userPrompts: PromptMeta[]): LauncherItem[] {
  if (userPrompts.length === 0) {
    return [
      {
        kind: 'empty-state',
        id: EMPTY_STATE_LAUNCHER_ITEM_ID,
        title: EMPTY_STATE_TITLE,
        description: EMPTY_STATE_DESCRIPTION,
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
