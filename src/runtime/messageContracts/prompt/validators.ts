import {
  isValidPromptTimestamp,
  type PromptMetaDraft,
  type PromptOrderGroup,
} from '../../../prompt/schema';
import { isObjectRecord } from '../shared';

export function parsePromptMetaDraft(value: unknown): PromptMetaDraft | null {
  if (!isObjectRecord(value) || typeof value.title !== 'string') {
    return null;
  }

  if (
    typeof value.normalOrder !== 'undefined' &&
    (typeof value.normalOrder !== 'number' ||
      !Number.isFinite(value.normalOrder) ||
      !Number.isInteger(value.normalOrder) ||
      value.normalOrder < 0)
  ) {
    return null;
  }

  if (
    value.pinnedOrder !== null &&
    typeof value.pinnedOrder !== 'undefined' &&
    (typeof value.pinnedOrder !== 'number' ||
      !Number.isFinite(value.pinnedOrder) ||
      !Number.isInteger(value.pinnedOrder) ||
      value.pinnedOrder < 0)
  ) {
    return null;
  }

  return {
    title: value.title,
    normalOrder: value.normalOrder,
    pinnedOrder: value.pinnedOrder,
  };
}

export function parsePromptId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1) {
    return null;
  }

  return value;
}

export function parsePromptMoveBoundaryId(
  value: unknown,
): string | null | false {
  if (value === null) {
    return null;
  }

  return parsePromptId(value) ?? false;
}

export function parseOptionalTimestamp(
  value: unknown,
): string | undefined | null {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return isValidPromptTimestamp(value) ? value : null;
}

export function parseRequiredTimestamp(value: unknown): string | null {
  return isValidPromptTimestamp(value) ? value : null;
}

export function parseOptionalPromptOrderGroup(
  value: unknown,
): PromptOrderGroup | undefined | null {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value === 'pinned' || value === 'normal') {
    return value;
  }

  return null;
}
