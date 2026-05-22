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
  Record<'title' | 'content' | 'normalOrder' | 'pinnedOrder', string>
>;

export type PromptOrderGroup = 'pinned' | 'normal';

export const PROMPT_BODY_MAX_BYTES = 500 * 1024;
export const PROMPT_ORDER_GAP = 1_000_000;
export const PROMPT_REVISION_STORAGE_KEY = 'promptit:promptsRevision';

export function normalizePromptDraft(draft: PromptDraft): PromptDraft {
  return {
    title: draft.title.trim(),
    content: draft.content,
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
    pinned: value.pinned,
    normalOrder: value.normalOrder,
    pinnedOrder: value.pinnedOrder,
  };
}

export function isPromptMeta(value: unknown): value is PromptMeta {
  return parsePromptMeta(value) !== null;
}

export function isPromptBody(value: unknown): value is PromptBody {
  return parsePromptBody(value) !== null;
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
