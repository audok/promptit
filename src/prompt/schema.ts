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

export type DecodedStoredPrompts =
  | {
      prompts: PromptItem[];
      needsRepair: false;
    }
  | {
      prompts: PromptItem[];
      needsRepair: true;
    };

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

export function isValidPromptTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

export function parsePromptDraft(value: unknown): PromptDraft | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    typeof value.title !== 'string' ||
    typeof value.content !== 'string' ||
    typeof value.sortOrder !== 'number' ||
    !Number.isInteger(value.sortOrder)
  ) {
    return null;
  }

  return {
    title: value.title,
    content: value.content,
    sortOrder: value.sortOrder,
  };
}

export function decodeStoredPrompts(raw: unknown): DecodedStoredPrompts {
  if (typeof raw === 'undefined') {
    return {
      prompts: [],
      needsRepair: false,
    };
  }

  if (!Array.isArray(raw)) {
    return {
      prompts: [],
      needsRepair: true,
    };
  }

  const prompts = sortPrompts(
    raw
      .map((value) => parsePromptItem(value))
      .filter((prompt): prompt is PromptItem => prompt !== null)
      .filter((prompt) => !isStarterPrompt(prompt)),
  );

  if (matchesStoredPromptArray(raw, prompts)) {
    return {
      prompts,
      needsRepair: false,
    };
  }

  return {
    prompts,
    needsRepair: true,
  };
}

export function isPromptItem(value: unknown): value is PromptItem {
  return parsePromptItem(value) !== null;
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

export function parsePromptItem(value: unknown): PromptItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    value.id.length < 1 ||
    typeof value.title !== 'string' ||
    typeof value.content !== 'string' ||
    typeof value.sortOrder !== 'number' ||
    !Number.isInteger(value.sortOrder) ||
    !isValidPromptTimestamp(value.createdAt) ||
    !isValidPromptTimestamp(value.updatedAt)
  ) {
    return null;
  }

  const title = value.title.trim();

  if (
    title.length < 1 ||
    title.length > 40 ||
    value.content.trim().length < 1
  ) {
    return null;
  }

  return {
    id: value.id,
    title,
    content: value.content,
    sortOrder: value.sortOrder,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function matchesStoredPromptArray(
  raw: readonly unknown[],
  prompts: readonly PromptItem[],
): boolean {
  if (raw.length !== prompts.length) {
    return false;
  }

  return prompts.every((prompt, index) => isExactPromptItem(raw[index], prompt));
}

function isExactPromptItem(
  value: unknown,
  prompt: PromptItem,
): boolean {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    value.id === prompt.id &&
    value.title === prompt.title &&
    value.content === prompt.content &&
    value.sortOrder === prompt.sortOrder &&
    value.createdAt === prompt.createdAt &&
    value.updatedAt === prompt.updatedAt
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
