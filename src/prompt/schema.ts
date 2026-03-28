export type PromptItem = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PromptDraft = {
  title: string;
  content: string;
  sortOrder: number;
};

export type PromptDraftErrors = Partial<
  Record<keyof PromptDraft, string>
>;

export const PROMPTS_STORAGE_KEY = 'prompts';
export const STARTER_PROMPT_ID = '__promptit_starter_prompt__';

export function normalizePromptDraft(draft: PromptDraft): PromptDraft {
  return {
    title: draft.title.trim(),
    content: draft.content,
    sortOrder: Math.trunc(draft.sortOrder),
  };
}

export function validatePromptDraft(
  draft: PromptDraft,
): PromptDraftErrors {
  const errors: PromptDraftErrors = {};

  if (draft.title.trim().length < 1 || draft.title.trim().length > 40) {
    errors.title = '제목은 1자 이상 40자 이하로 입력해주세요.';
  }

  if (draft.content.trim().length < 1) {
    errors.content = '본문은 비워둘 수 없습니다.';
  }

  if (!Number.isInteger(draft.sortOrder)) {
    errors.sortOrder = '정렬 순서는 정수여야 합니다.';
  }

  return errors;
}

export function hasPromptDraftErrors(
  errors: PromptDraftErrors,
): boolean {
  return Object.values(errors).some(Boolean);
}

export function isPromptItem(value: unknown): value is PromptItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prompt = value as Partial<PromptItem>;

  return (
    typeof prompt.id === 'string' &&
    prompt.id.length > 0 &&
    typeof prompt.title === 'string' &&
    prompt.title.length >= 1 &&
    prompt.title.length <= 40 &&
    typeof prompt.content === 'string' &&
    prompt.content.length >= 1 &&
    typeof prompt.sortOrder === 'number' &&
    Number.isInteger(prompt.sortOrder) &&
    typeof prompt.createdAt === 'string' &&
    prompt.createdAt.length > 0 &&
    typeof prompt.updatedAt === 'string' &&
    prompt.updatedAt.length > 0
  );
}

export function isStarterPrompt(prompt: PromptItem): boolean {
  return prompt.id === STARTER_PROMPT_ID;
}

export function sortPrompts(items: PromptItem[]): PromptItem[] {
  return [...items].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.id.localeCompare(right.id);
  });
}
