import type { AdapterMutationResult } from '../adapters/base';

type AdapterMutationRecord = {
  error?: unknown;
  kind?: unknown;
  message?: unknown;
  ok?: unknown;
  reason?: unknown;
  status?: unknown;
  success?: unknown;
  type?: unknown;
};

export function ensureAdapterMutation(
  result: AdapterMutationResult,
  action: string,
): void {
  const failureDetail = getAdapterMutationFailureDetail(result);

  if (failureDetail === null) {
    return;
  }

  if (failureDetail.length > 0) {
    console.error(`[promptit] Adapter mutation detail for ${action}: ${failureDetail}`);
  }

  throw new Error(`[promptit] Adapter failed to ${action}.`);
}

export function getAdapterMutationFailureDetail(
  result: AdapterMutationResult,
): string | null {
  if (result.ok) {
    return null;
  }

  const record = result as AdapterMutationRecord;
  const outcome = resolveAdapterMutationOutcome(record);

  if (outcome === 'success') {
    return null;
  }

  if (outcome === 'failure') {
    return firstNonEmptyString(
      record.message,
      record.reason,
      record.error,
    ) ?? '';
  }

  return '';
}

function resolveAdapterMutationOutcome(
  record: AdapterMutationRecord,
): 'success' | 'failure' | 'unknown' {
  if (record.ok === true || record.success === true) {
    return 'success';
  }

  if (record.ok === false || record.success === false) {
    return 'failure';
  }

  const discriminator = firstNonEmptyString(
    record.status,
    record.type,
    record.kind,
  )?.toLowerCase();

  if (
    discriminator === 'success' ||
    discriminator === 'ok'
  ) {
    return 'success';
  }

  if (
    discriminator === 'error' ||
    discriminator === 'failure' ||
    discriminator === 'failed'
  ) {
    return 'failure';
  }

  return 'unknown';
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}
