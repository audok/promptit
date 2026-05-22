import { expect, test } from '@playwright/test';

import type { AdapterMutationResult } from '../../src/adapters/base';
import { getAdapterMutationFailureDetail } from '../../src/content/adapterMutation';
import { buildLauncherItems } from '../../src/content/launcher-items';
import { reconcilePopupItems } from '../../src/content/popupRefresh';
import type { PromptMeta } from '../../src/prompt/schema';

const baseTimestamp = '2026-03-29T00:00:00.000Z';

function promptMeta(
  id: string,
  title: string,
  normalOrder: number,
): PromptMeta {
  return {
    id,
    title,
    pinned: false,
    normalOrder,
    pinnedOrder: null,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    bodyUpdatedAt: baseTimestamp,
    charCount: title.length,
  };
}

function mutationResult(value: unknown): AdapterMutationResult {
  return value as AdapterMutationResult;
}

test('adapter mutation failure detail preserves accepted success and failure variants', () => {
  expect(getAdapterMutationFailureDetail({ ok: true })).toBeNull();
  expect(getAdapterMutationFailureDetail(mutationResult({ success: true }))).toBeNull();
  expect(getAdapterMutationFailureDetail(mutationResult({ status: 'success' }))).toBeNull();
  expect(getAdapterMutationFailureDetail(mutationResult({ type: 'ok' }))).toBeNull();
  expect(getAdapterMutationFailureDetail(mutationResult({ kind: 'success' }))).toBeNull();

  expect(
    getAdapterMutationFailureDetail(
      mutationResult({ success: false, message: 'failed by flag' }),
    ),
  ).toBe('failed by flag');
  expect(
    getAdapterMutationFailureDetail(
      mutationResult({ status: 'failed', reason: 'stale-context' }),
    ),
  ).toBe('stale-context');
  expect(
    getAdapterMutationFailureDetail(mutationResult({ status: 'pending' })),
  ).toBe('');
});

test('popup refresh preserves the active item by id across reorder', () => {
  const first = promptMeta('first', 'First prompt', 1);
  const second = promptMeta('second', 'Second prompt', 2);
  const previousItems = buildLauncherItems([first, second]);

  const refresh = reconcilePopupItems(
    previousItems,
    [
      {
        ...second,
        normalOrder: 0,
      },
      first,
    ],
    {
      rowIndex: 1,
      column: 'copy',
    },
  );

  expect(refresh.items.map((item) => item.id)).toEqual(['second', 'first']);
  expect(refresh.activeCell).toEqual({
    rowIndex: 0,
    column: 'copy',
  });
});

test('popup refresh clamps the active cell when the active item disappears', () => {
  const first = promptMeta('first', 'First prompt', 1);
  const second = promptMeta('second', 'Second prompt', 2);
  const previousItems = buildLauncherItems([first, second]);

  const refresh = reconcilePopupItems(
    previousItems,
    [first],
    {
      rowIndex: 1,
      column: 'copy',
    },
  );

  expect(refresh.items.map((item) => item.id)).toEqual(['first']);
  expect(refresh.activeCell).toEqual({
    rowIndex: 0,
    column: 'copy',
  });
});

test('popup refresh falls back to title when the active column is invalid', () => {
  const previousItems = buildLauncherItems([
    promptMeta('removed', 'Removed prompt', 1),
  ]);

  const refresh = reconcilePopupItems(
    previousItems,
    [],
    {
      rowIndex: 0,
      column: 'copy',
    },
  );

  expect(refresh.items).toEqual([
    expect.objectContaining({
      kind: 'empty-state',
    }),
  ]);
  expect(refresh.activeCell).toEqual({
    rowIndex: 0,
    column: 'title',
  });
});
