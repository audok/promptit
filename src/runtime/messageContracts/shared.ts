import {
  isI18nKey,
  type I18nValues,
  type RuntimeMessageDescriptor,
} from '../../shared/i18n';

export function assertNever(value: never): never {
  throw new Error(`Unhandled promptit runtime contract: ${String(value)}`);
}

export function parseRuntimeMessageDescriptor(
  value: unknown,
): RuntimeMessageDescriptor | undefined {
  if (!isObjectRecord(value) || !isI18nKey(value.key)) {
    return undefined;
  }

  const values = parseRuntimeMessageValues(value.values);

  if (values === null) {
    return undefined;
  }

  return typeof values === 'undefined'
    ? { key: value.key }
    : { key: value.key, values };
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRuntimeMessageValues(
  value: unknown,
): I18nValues | undefined | null {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (!isObjectRecord(value)) {
    return null;
  }

  const parsedValues: I18nValues = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'string' && typeof entryValue !== 'number') {
      return null;
    }

    parsedValues[key] = entryValue;
  }

  return parsedValues;
}
