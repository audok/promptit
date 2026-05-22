import {
  PROMPT_ORDER_GAP,
  sortPromptMetas,
  type PromptDraft,
  type PromptMeta,
  type PromptOrderGroup,
} from './schema';

export type PromptCreateOrders = {
  normalOrder: number;
  pinnedOrder: number | null;
};

export type PromptMoveOrderRequest = {
  previousId?: string | null;
  nextId?: string | null;
};

export type PromptMoveBoundaryValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
    };

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

export function resolvePromptCreateOrders(
  metas: PromptMeta[],
  draft: PromptDraft,
  pinned: boolean,
): PromptCreateOrders {
  const sortedMetas = sortPromptMetas(metas);
  const normalMetas = sortedMetas.filter((meta) => !meta.pinned);
  const pinnedMetas = sortedMetas.filter((meta) => meta.pinned);
  const fallbackNormalOrder = getNextGroupOrder(normalMetas);
  const fallbackPinnedOrder = getNextGroupOrder(pinnedMetas);
  const normalOrder =
    typeof draft.normalOrder === 'number'
      ? draft.normalOrder
      : fallbackNormalOrder;
  const pinnedOrder =
    pinned
      ? typeof draft.pinnedOrder === 'number'
        ? draft.pinnedOrder
        : fallbackPinnedOrder
      : null;

  return {
    normalOrder,
    pinnedOrder,
  };
}

export function resolvePromptPinnedMeta(
  metas: PromptMeta[],
  currentMeta: PromptMeta,
  pinned: boolean,
  updatedAt: string,
): PromptMeta {
  const pinnedOrder = pinned
    ? getNextGroupOrder(sortPromptMetas(metas).filter((meta) => meta.pinned))
    : null;

  return {
    ...currentMeta,
    pinned,
    pinnedOrder,
    updatedAt,
  };
}

export function movePromptMetaInOrder(
  metas: PromptMeta[],
  currentMeta: PromptMeta,
  group: PromptOrderGroup,
  request: PromptMoveOrderRequest,
  updatedAt: string,
): PromptMeta[] {
  const movedMeta: PromptMeta = {
    ...currentMeta,
    pinned: group === 'pinned',
    pinnedOrder: group === 'pinned' ? currentMeta.pinnedOrder : null,
    updatedAt,
  };
  const withoutCurrent = metas.filter((meta) => meta.id !== currentMeta.id);
  let nextMetas = [...withoutCurrent, movedMeta];
  let groupMetas = sortPromptMetas(nextMetas).filter((meta) =>
    group === 'pinned' ? meta.pinned : !meta.pinned,
  );
  const previousOrder = getBoundaryOrder(groupMetas, request.previousId);
  const nextOrder = getBoundaryOrder(groupMetas, request.nextId);
  let order = getOrderBetween(previousOrder, nextOrder);

  if (order === null) {
    nextMetas = renumberPromptMetasForGroup(nextMetas, group);
    groupMetas = sortPromptMetas(nextMetas).filter((meta) =>
      group === 'pinned' ? meta.pinned : !meta.pinned,
    );
    order = getOrderBetween(
      getBoundaryOrder(groupMetas, request.previousId),
      getBoundaryOrder(groupMetas, request.nextId),
    );
  }

  if (order === null) {
    throw new Error('Could not allocate prompt order.');
  }

  return nextMetas.map((meta) => {
    if (meta.id !== currentMeta.id) {
      return meta;
    }

    return group === 'pinned'
      ? {
          ...meta,
          pinned: true,
          pinnedOrder: order,
        }
      : {
          ...meta,
          pinned: false,
          normalOrder: order,
          pinnedOrder: null,
        };
  });
}

export function validatePromptMoveBoundaries(
  metas: PromptMeta[],
  currentMeta: PromptMeta,
  group: PromptOrderGroup,
  request: PromptMoveOrderRequest,
): PromptMoveBoundaryValidationResult {
  const groupMetas = sortPromptMetas(
    metas.filter((meta) => meta.id !== currentMeta.id),
  ).filter((meta) => (group === 'pinned' ? meta.pinned : !meta.pinned));
  const previousIndex =
    typeof request.previousId === 'string'
      ? groupMetas.findIndex((meta) => meta.id === request.previousId)
      : null;
  const nextIndex =
    typeof request.nextId === 'string'
      ? groupMetas.findIndex((meta) => meta.id === request.nextId)
      : null;

  if (previousIndex === -1 || nextIndex === -1) {
    return { ok: false };
  }

  if (
    typeof previousIndex === 'number' &&
    typeof nextIndex === 'number' &&
    previousIndex + 1 !== nextIndex
  ) {
    return { ok: false };
  }

  if (request.previousId === null && typeof nextIndex === 'number' && nextIndex !== 0) {
    return { ok: false };
  }

  if (
    request.nextId === null &&
    typeof previousIndex === 'number' &&
    previousIndex !== groupMetas.length - 1
  ) {
    return { ok: false };
  }

  if (
    request.previousId === null &&
    request.nextId === null &&
    groupMetas.length > 0
  ) {
    return { ok: false };
  }

  return { ok: true };
}

function getBoundaryOrder(
  metas: PromptMeta[],
  id: string | null | undefined,
): number | null {
  if (!id) {
    return null;
  }

  const meta = metas.find((item) => item.id === id);
  return meta ? getGroupOrder(meta) : null;
}

function getGroupOrder(meta: PromptMeta): number {
  return meta.pinned ? (meta.pinnedOrder ?? meta.normalOrder) : meta.normalOrder;
}

function getNextGroupOrder(metas: PromptMeta[]): number {
  return metas.length === 0
    ? getInitialOrder(0)
    : getGroupOrder(metas[metas.length - 1]) + PROMPT_ORDER_GAP;
}

export function hasMetaOrderChanged(left: PromptMeta, right: PromptMeta): boolean {
  return (
    left.pinned !== right.pinned ||
    left.normalOrder !== right.normalOrder ||
    left.pinnedOrder !== right.pinnedOrder ||
    left.updatedAt !== right.updatedAt
  );
}
