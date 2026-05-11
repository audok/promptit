export type PromptItem = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PromptMeta = {
  id: string;
  title: string;
  pinned: boolean;
  normalOrder: number;
  pinnedOrder: number | null;
  createdAt: string;
  updatedAt: string;
  bodyUpdatedAt: string;
  charCount: number;
};

export type PromptBody = {
  id: string;
  content: string;
  updatedAt: string;
};

export type PromptRecord = PromptMeta & {
  content: string;
};

export type PromptDraft = {
  title: string;
  content: string;
  sortOrder?: number;
  pinned?: boolean;
  normalOrder?: number;
  pinnedOrder?: number | null;
};

export type PromptMetaDraft = {
  title: string;
  normalOrder?: number;
  pinnedOrder?: number | null;
};

export type PromptBodyDraft = {
  content: string;
};

export type PromptDraftErrors = Partial<
  Record<
    | 'title'
    | 'content'
    | 'sortOrder'
    | 'normalOrder'
    | 'pinnedOrder',
    string
  >
>;

export type PromptOrderGroup = 'pinned' | 'normal';

export type DecodedStoredPrompts =
  | {
      prompts: PromptItem[];
      needsRepair: false;
    }
  | {
      prompts: PromptItem[];
      needsRepair: true;
    };

export const PROMPT_BODY_MAX_BYTES = 500 * 1024;
export const PROMPT_ORDER_GAP = 1_000_000;
export const PROMPT_REVISION_STORAGE_KEY = 'promptit:promptsRevision';
export const LEGACY_PROMPTS_STORAGE_KEY = 'prompts';
export const PROMPTS_STORAGE_KEY = LEGACY_PROMPTS_STORAGE_KEY;
export const STARTER_PROMPT_ID = '__promptit_starter_prompt__';

export function normalizePromptDraft(draft: PromptDraft): PromptDraft {
  return {
    title: draft.title.trim(),
    content: draft.content,
    sortOrder:
      typeof draft.sortOrder === 'number'
        ? Math.trunc(draft.sortOrder)
        : undefined,
    pinned: draft.pinned,
    normalOrder:
      typeof draft.normalOrder === 'number'
        ? Math.trunc(draft.normalOrder)
        : undefined,
    pinnedOrder:
      typeof draft.pinnedOrder === 'number'
        ? Math.trunc(draft.pinnedOrder)
        : draft.pinnedOrder,
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

  if (getUtf8ByteLength(draft.content) > PROMPT_BODY_MAX_BYTES) {
    errors.content = '본문은 500KB 이하로 입력해주세요.';
  }

  if (
    typeof draft.sortOrder !== 'undefined' &&
    !isValidPromptOrderValue(draft.sortOrder)
  ) {
    errors.sortOrder = '정렬 순서는 정수여야 합니다.';
  }

  if (
    typeof draft.normalOrder !== 'undefined' &&
    !isValidPromptOrderValue(draft.normalOrder)
  ) {
    errors.normalOrder = '정렬 순서는 0 이상의 정수여야 합니다.';
  }

  if (
    draft.pinnedOrder !== null &&
    typeof draft.pinnedOrder !== 'undefined' &&
    !isValidPromptOrderValue(draft.pinnedOrder)
  ) {
    errors.pinnedOrder = '고정 정렬 순서는 0 이상의 정수여야 합니다.';
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

export function isValidPromptOrderValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function getPromptCharCount(value: string): number {
  return Array.from(value).length;
}

export function parsePromptDraft(value: unknown): PromptDraft | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    typeof value.title !== 'string' ||
    typeof value.content !== 'string'
  ) {
    return null;
  }

  if (
    typeof value.sortOrder !== 'undefined' &&
    !isValidPromptOrderValue(value.sortOrder)
  ) {
    return null;
  }

  if (
    typeof value.pinned !== 'undefined' &&
    typeof value.pinned !== 'boolean'
  ) {
    return null;
  }

  if (
    typeof value.normalOrder !== 'undefined' &&
    !isValidPromptOrderValue(value.normalOrder)
  ) {
    return null;
  }

  if (
    value.pinnedOrder !== null &&
    typeof value.pinnedOrder !== 'undefined' &&
    !isValidPromptOrderValue(value.pinnedOrder)
  ) {
    return null;
  }

  return {
    title: value.title,
    content: value.content,
    sortOrder: value.sortOrder,
    pinned: value.pinned,
    normalOrder: value.normalOrder,
    pinnedOrder: value.pinnedOrder,
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

export function isPromptMeta(value: unknown): value is PromptMeta {
  return parsePromptMeta(value) !== null;
}

export function isPromptBody(value: unknown): value is PromptBody {
  return parsePromptBody(value) !== null;
}

export function isStarterPrompt(prompt: PromptItem): boolean {
  return prompt.id === STARTER_PROMPT_ID;
}

export function sortPromptMetas(items: PromptMeta[]): PromptMeta[] {
  return [...items].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    const leftOrder = left.pinned ? left.pinnedOrder : left.normalOrder;
    const rightOrder = right.pinned ? right.pinnedOrder : right.normalOrder;

    if (leftOrder !== rightOrder) {
      if (leftOrder === null) {
        return 1;
      }

      if (rightOrder === null) {
        return -1;
      }

      return leftOrder - rightOrder;
    }

    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.id.localeCompare(right.id);
  });
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

export function parsePromptMeta(value: unknown): PromptMeta | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    value.id.length < 1 ||
    typeof value.title !== 'string' ||
    typeof value.pinned !== 'boolean' ||
    !isValidPromptOrderValue(value.normalOrder) ||
    (value.pinnedOrder !== null &&
      !isValidPromptOrderValue(value.pinnedOrder)) ||
    !isValidPromptTimestamp(value.createdAt) ||
    !isValidPromptTimestamp(value.updatedAt) ||
    !isValidPromptTimestamp(value.bodyUpdatedAt) ||
    !isValidPromptOrderValue(value.charCount)
  ) {
    return null;
  }

  const title = value.title.trim();

  if (title.length < 1 || title.length > 40) {
    return null;
  }

  return {
    id: value.id,
    title,
    pinned: value.pinned,
    normalOrder: value.normalOrder,
    pinnedOrder: value.pinnedOrder,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    bodyUpdatedAt: value.bodyUpdatedAt,
    charCount: value.charCount,
  };
}

export function parsePromptBody(value: unknown): PromptBody | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    value.id.length < 1 ||
    typeof value.content !== 'string' ||
    !isValidPromptTimestamp(value.updatedAt)
  ) {
    return null;
  }

  if (
    value.content.trim().length < 1 ||
    getUtf8ByteLength(value.content) > PROMPT_BODY_MAX_BYTES
  ) {
    return null;
  }

  return {
    id: value.id,
    content: value.content,
    updatedAt: value.updatedAt,
  };
}

export function parsePromptRecord(value: unknown): PromptRecord | null {
  const meta = parsePromptMeta(value);

  if (!meta || !isObjectRecord(value) || typeof value.content !== 'string') {
    return null;
  }

  const body = parsePromptBody({
    id: meta.id,
    content: value.content,
    updatedAt: meta.bodyUpdatedAt,
  });

  if (!body) {
    return null;
  }

  return toPromptRecord(meta, body);
}

export function toPromptRecord(
  meta: PromptMeta,
  body: PromptBody,
): PromptRecord {
  return {
    ...meta,
    content: body.content,
  };
}

export function toLegacyPromptItem(record: PromptRecord): PromptItem {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    sortOrder: record.normalOrder,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
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
    !isValidPromptOrderValue(value.sortOrder) ||
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
