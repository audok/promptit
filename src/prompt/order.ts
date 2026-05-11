import {
  PROMPT_ORDER_GAP,
  sortPromptMetas,
  type PromptMeta,
  type PromptOrderGroup,
} from './schema';

export function getInitialOrder(index: number): number {
  return (index + 1) * PROMPT_ORDER_GAP;
}

export function getOrderBetween(
  previousOrder: number | null,
  nextOrder: number | null,
): number | null {
  if (previousOrder === null && nextOrder === null) {
    return PROMPT_ORDER_GAP;
  }

  if (previousOrder === null) {
    if (nextOrder === null) {
      return PROMPT_ORDER_GAP;
    }

    const candidate = Math.floor(nextOrder / 2);
    return candidate >= 0 && candidate < nextOrder ? candidate : null;
  }

  if (nextOrder === null) {
    return previousOrder + PROMPT_ORDER_GAP;
  }

  const candidate = Math.floor((previousOrder + nextOrder) / 2);
  return candidate > previousOrder && candidate < nextOrder
    ? candidate
    : null;
}

export function renumberPromptMetasForGroup(
  metas: PromptMeta[],
  group: PromptOrderGroup,
): PromptMeta[] {
  const sortedGroup = sortPromptMetas(metas).filter((meta) =>
    group === 'pinned' ? meta.pinned : !meta.pinned,
  );
  const byId = new Map(
    sortedGroup.map((meta, index) => [meta.id, getInitialOrder(index)]),
  );

  return metas.map((meta) => {
    const nextOrder = byId.get(meta.id);

    if (typeof nextOrder === 'undefined') {
      return meta;
    }

    if (group === 'pinned') {
      return {
        ...meta,
        pinnedOrder: nextOrder,
      };
    }

    return {
      ...meta,
      normalOrder: nextOrder,
    };
  });
}
