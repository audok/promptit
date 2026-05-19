import {
  deleteRecordFromTransaction,
  getAllRecordsFromTransaction,
  getAllStoreRecords,
  getRecordFromTransaction,
  getStoreRecord,
  PROMPT_BODIES_STORE,
  PROMPT_METAS_STORE,
  putRecordInTransaction,
  withPromptTransaction,
} from './indexed-db';
import {
  LEGACY_PROMPTS_STORAGE_KEY,
  PROMPT_BODY_MAX_BYTES,
  PROMPT_ORDER_GAP,
  PROMPT_REVISION_STORAGE_KEY,
  decodeStoredPrompts,
  getPromptCharCount,
  getUtf8ByteLength,
  hasPromptDraftErrors,
  isValidPromptTimestamp,
  normalizePromptDraft,
  parsePromptBody,
  parsePromptMeta,
  sortPromptMetas,
  toPromptRecord,
  validatePromptDraft,
  type PromptBody,
  type PromptDraft,
  type PromptMeta,
  type PromptMetaDraft,
  type PromptOrderGroup,
  type PromptRecord,
} from './schema';
import {
  getInitialOrder,
  getOrderBetween,
  renumberPromptMetasForGroup,
} from './order';

const PROMPT_IDB_MIGRATION_STORAGE_KEY = 'promptit:idbMigration';

type LegacyMigrationMarker = {
  status: 'complete';
  completedAt?: string;
};

export type PromptMutationOptions = {
  expectedUpdatedAt?: string;
};

export type PromptBodyMutationOptions = {
  expectedBodyUpdatedAt?: string;
};

export type PromptDeleteOptions = PromptMutationOptions &
  PromptBodyMutationOptions;

export type PromptMoveRequest = PromptMutationOptions & {
  group?: PromptOrderGroup;
  previousId?: string | null;
  nextId?: string | null;
};

export type PromptMutationResult<T> =
  | {
      status: 'success';
      value: T;
    }
  | {
      status: 'not-found';
      id: string;
    }
  | {
      status: 'conflict';
      id: string;
      currentMeta: PromptMeta;
    };

export type PromptBodyMutationResult =
  | {
      status: 'success';
      value: PromptRecord;
    }
  | {
      status: 'not-found';
      id: string;
    }
  | {
      status: 'conflict';
      id: string;
      currentRecord: PromptRecord | null;
      currentMeta: PromptMeta;
    };

let storageReadyPromise: Promise<void> | null = null;

export function ensurePromptStorageReady(): Promise<void> {
  if (!storageReadyPromise) {
    storageReadyPromise = runLegacyPromptMigration().catch((error) => {
      storageReadyPromise = null;
      throw error;
    });
  }

  return storageReadyPromise;
}

export async function listPromptMetas(): Promise<PromptMeta[]> {
  await ensurePromptStorageReady();
  const records = await getAllStoreRecords(PROMPT_METAS_STORE);
  return sortPromptMetas(records.map(assertPromptMeta));
}

export async function getPromptBody(id: string): Promise<PromptBody | null> {
  await ensurePromptStorageReady();
  const body = await getStoreRecord(PROMPT_BODIES_STORE, id);

  return body ? assertPromptBody(body) : null;
}

export async function getPromptRecord(id: string): Promise<PromptRecord | null> {
  await ensurePromptStorageReady();
  const [meta, body] = await Promise.all([
    getStoreRecord(PROMPT_METAS_STORE, id),
    getStoreRecord(PROMPT_BODIES_STORE, id),
  ]);

  if (!meta || !body) {
    return null;
  }

  return toPromptRecord(assertPromptMeta(meta), assertPromptBody(body));
}

export async function createPrompt(
  draft: PromptDraft,
): Promise<PromptRecord> {
  await ensurePromptStorageReady();

  const validatedDraft = getValidatedPromptDraft(draft);
  const timestamp = new Date().toISOString();
  const id = createPromptId();
  const pinned = validatedDraft.pinned === true;

  return withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readwrite',
    async (transaction) => {
      const metas = (
        await getAllRecordsFromTransaction(transaction, PROMPT_METAS_STORE)
      ).map(assertPromptMeta);
      const normalMetas = sortPromptMetas(metas).filter((meta) => !meta.pinned);
      const pinnedMetas = sortPromptMetas(metas).filter((meta) => meta.pinned);
      const fallbackNormalOrder = getNextGroupOrder(normalMetas);
      const fallbackPinnedOrder = getNextGroupOrder(pinnedMetas);
      const normalOrder =
        typeof validatedDraft.normalOrder === 'number'
          ? validatedDraft.normalOrder
          : typeof validatedDraft.sortOrder === 'number'
            ? validatedDraft.sortOrder
            : fallbackNormalOrder;
      const pinnedOrder =
        pinned
          ? typeof validatedDraft.pinnedOrder === 'number'
            ? validatedDraft.pinnedOrder
            : fallbackPinnedOrder
          : null;

      if (typeof normalOrder !== 'number') {
        throw new Error('Could not allocate prompt order.');
      }
      const body: PromptBody = {
        id,
        content: validatedDraft.content,
        updatedAt: timestamp,
      };
      const meta: PromptMeta = {
        id,
        title: validatedDraft.title,
        pinned,
        normalOrder,
        pinnedOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
        bodyUpdatedAt: timestamp,
        charCount: getPromptCharCount(validatedDraft.content),
      };

      await putRecordInTransaction(transaction, PROMPT_METAS_STORE, meta);
      await putRecordInTransaction(transaction, PROMPT_BODIES_STORE, body);

      return toPromptRecord(meta, body);
    },
  );
}

export async function updatePromptMeta(
  id: string,
  draft: PromptMetaDraft,
  options: PromptMutationOptions = {},
): Promise<PromptMutationResult<PromptMeta>> {
  await ensurePromptStorageReady();

  const nextTitle = validatePromptTitle(draft.title);
  validateExpectedTimestamp(options.expectedUpdatedAt, 'updatedAt');

  return withPromptTransaction([PROMPT_METAS_STORE], 'readwrite', async (transaction) => {
    const current = await getRecordFromTransaction(transaction, PROMPT_METAS_STORE, id);

    if (!current) {
      return {
        status: 'not-found',
        id,
      };
    }

    const currentMeta = assertPromptMeta(current);

    if (
      options.expectedUpdatedAt &&
      currentMeta.updatedAt !== options.expectedUpdatedAt
    ) {
      return {
        status: 'conflict',
        id,
        currentMeta,
      };
    }

    const nextMeta: PromptMeta = {
      ...currentMeta,
      title: nextTitle,
      normalOrder:
        typeof draft.normalOrder === 'number'
          ? validatePromptOrder(draft.normalOrder, 'normalOrder')
          : currentMeta.normalOrder,
      pinnedOrder:
        typeof draft.pinnedOrder === 'undefined'
          ? currentMeta.pinnedOrder
          : draft.pinnedOrder === null
            ? null
            : validatePromptOrder(draft.pinnedOrder, 'pinnedOrder'),
      updatedAt: new Date().toISOString(),
    };

    await putRecordInTransaction(transaction, PROMPT_METAS_STORE, nextMeta);

    return {
      status: 'success',
      value: nextMeta,
    };
  });
}

export async function updatePromptBody(
  id: string,
  content: string,
  options: PromptBodyMutationOptions = {},
): Promise<PromptBodyMutationResult> {
  await ensurePromptStorageReady();
  const nextContent = validatePromptContent(content);
  validateExpectedTimestamp(options.expectedBodyUpdatedAt, 'bodyUpdatedAt');

  return withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readwrite',
    async (transaction) => {
      const currentMetaRecord = await getRecordFromTransaction(
        transaction,
        PROMPT_METAS_STORE,
        id,
      );
      const currentBodyRecord = await getRecordFromTransaction(
        transaction,
        PROMPT_BODIES_STORE,
        id,
      );

      if (!currentMetaRecord || !currentBodyRecord) {
        return {
          status: 'not-found',
          id,
        };
      }

      const currentMeta = assertPromptMeta(currentMetaRecord);
      const currentBody = assertPromptBody(currentBodyRecord);

      if (
        options.expectedBodyUpdatedAt &&
        currentMeta.bodyUpdatedAt !== options.expectedBodyUpdatedAt
      ) {
        return {
          status: 'conflict',
          id,
          currentMeta,
          currentRecord: toPromptRecord(currentMeta, currentBody),
        };
      }

      const timestamp = new Date().toISOString();
      const body: PromptBody = {
        id,
        content: nextContent,
        updatedAt: timestamp,
      };
      const meta: PromptMeta = {
        ...currentMeta,
        updatedAt: timestamp,
        bodyUpdatedAt: timestamp,
        charCount: getPromptCharCount(nextContent),
      };

      await putRecordInTransaction(transaction, PROMPT_BODIES_STORE, body);
      await putRecordInTransaction(transaction, PROMPT_METAS_STORE, meta);

      return {
        status: 'success',
        value: toPromptRecord(meta, body),
      };
    },
  );
}

export async function deletePrompt(
  id: string,
  options: PromptDeleteOptions = {},
): Promise<PromptMutationResult<string>> {
  await ensurePromptStorageReady();
  validateExpectedTimestamp(options.expectedUpdatedAt, 'updatedAt');
  validateExpectedTimestamp(options.expectedBodyUpdatedAt, 'bodyUpdatedAt');
  await ensureLegacyMigrationMarkerBeforeFinalDelete(id, options);

  return withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readwrite',
    async (transaction) => {
      const current = await getRecordFromTransaction(transaction, PROMPT_METAS_STORE, id);

      if (!current) {
        return {
          status: 'not-found',
          id,
        };
      }

      const currentMeta = assertPromptMeta(current);

      if (
        (options.expectedUpdatedAt &&
          currentMeta.updatedAt !== options.expectedUpdatedAt) ||
        (options.expectedBodyUpdatedAt &&
          currentMeta.bodyUpdatedAt !== options.expectedBodyUpdatedAt)
      ) {
        return {
          status: 'conflict',
          id,
          currentMeta,
        };
      }

      await deleteRecordFromTransaction(transaction, PROMPT_BODIES_STORE, id);
      await deleteRecordFromTransaction(transaction, PROMPT_METAS_STORE, id);

      return {
        status: 'success',
        value: id,
      };
    },
  );
}

export async function movePrompt(
  id: string,
  request: PromptMoveRequest,
): Promise<PromptMutationResult<PromptMeta>> {
  await ensurePromptStorageReady();
  validateExpectedTimestamp(request.expectedUpdatedAt, 'updatedAt');

  return withPromptTransaction([PROMPT_METAS_STORE], 'readwrite', async (transaction) => {
    const metas = (
      await getAllRecordsFromTransaction(transaction, PROMPT_METAS_STORE)
    ).map(assertPromptMeta);
    const currentMeta = metas.find((meta) => meta.id === id) ?? null;

    if (!currentMeta) {
      return {
        status: 'not-found',
        id,
      };
    }

    if (
      request.expectedUpdatedAt &&
      currentMeta.updatedAt !== request.expectedUpdatedAt
    ) {
      return {
        status: 'conflict',
        id,
        currentMeta,
      };
    }

    const group = request.group ?? (currentMeta.pinned ? 'pinned' : 'normal');
    const nextMetas = await applyMove(
      transaction,
      metas,
      currentMeta,
      group,
      request,
    );
    const nextMeta = nextMetas.find((meta) => meta.id === id);

    if (!nextMeta) {
      throw new Error('Moved prompt was not written.');
    }

    return {
      status: 'success',
      value: nextMeta,
    };
  });
}

export async function setPromptPinned(
  id: string,
  pinned: boolean,
  options: PromptMutationOptions = {},
): Promise<PromptMutationResult<PromptMeta>> {
  await ensurePromptStorageReady();
  validateExpectedTimestamp(options.expectedUpdatedAt, 'updatedAt');

  return withPromptTransaction([PROMPT_METAS_STORE], 'readwrite', async (transaction) => {
    const metas = (
      await getAllRecordsFromTransaction(transaction, PROMPT_METAS_STORE)
    ).map(assertPromptMeta);
    const currentMeta = metas.find((meta) => meta.id === id) ?? null;

    if (!currentMeta) {
      return {
        status: 'not-found',
        id,
      };
    }

    if (
      options.expectedUpdatedAt &&
      currentMeta.updatedAt !== options.expectedUpdatedAt
    ) {
      return {
        status: 'conflict',
        id,
        currentMeta,
      };
    }

    if (currentMeta.pinned === pinned) {
      return {
        status: 'success',
        value: currentMeta,
      };
    }

    const timestamp = new Date().toISOString();
    const groupMetas = sortPromptMetas(metas).filter((meta) =>
      pinned ? meta.pinned : !meta.pinned,
    );
    const nextGroupOrder =
      groupMetas.length === 0
        ? getInitialOrder(0)
        : getGroupOrder(groupMetas[groupMetas.length - 1]) + PROMPT_ORDER_GAP;
    const nextMeta: PromptMeta = {
      ...currentMeta,
      pinned,
      pinnedOrder: pinned ? nextGroupOrder : null,
      updatedAt: timestamp,
    };

    await putRecordInTransaction(transaction, PROMPT_METAS_STORE, nextMeta);

    return {
      status: 'success',
      value: nextMeta,
    };
  });
}

export async function runLegacyPromptMigration(): Promise<void> {
  const existingMetas = await getAllStoreRecords(PROMPT_METAS_STORE);

  if (existingMetas.length > 0) {
    await ensureLegacyMigrationCompleteMarkerBestEffort();
    return;
  }

  if (!hasChromeStorageApi()) {
    return;
  }

  if (await getLegacyMigrationMarker()) {
    return;
  }

  const result = await chrome.storage.local.get(LEGACY_PROMPTS_STORAGE_KEY);
  const decoded = decodeStoredPrompts(result[LEGACY_PROMPTS_STORAGE_KEY]);

  if (decoded.prompts.length === 0) {
    return;
  }

  const oversizedPrompt = decoded.prompts.find(
    (prompt) => getUtf8ByteLength(prompt.content) > PROMPT_BODY_MAX_BYTES,
  );

  if (oversizedPrompt) {
    throw new Error(
      `Legacy prompt "${oversizedPrompt.title || oversizedPrompt.id}" exceeds the 500KB body limit.`,
    );
  }

  const sortedPrompts = decoded.prompts;

  await withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readwrite',
    async (transaction) => {
      for (const [index, prompt] of sortedPrompts.entries()) {
        const meta: PromptMeta = {
          id: prompt.id,
          title: prompt.title,
          pinned: false,
          normalOrder: getInitialOrder(index),
          pinnedOrder: null,
          createdAt: prompt.createdAt,
          updatedAt: prompt.updatedAt,
          bodyUpdatedAt: prompt.updatedAt,
          charCount: getPromptCharCount(prompt.content),
        };
        const body: PromptBody = {
          id: prompt.id,
          content: prompt.content,
          updatedAt: prompt.updatedAt,
        };

        await putRecordInTransaction(transaction, PROMPT_METAS_STORE, meta);
        await putRecordInTransaction(transaction, PROMPT_BODIES_STORE, body);
      }
    },
  );

  await ensureLegacyMigrationCompleteMarkerBestEffort();
  await publishPromptRevisionBestEffort();
}

export async function publishPromptRevision(): Promise<void> {
  if (!hasChromeStorageApi()) {
    return;
  }

  const updatedAt = new Date().toISOString();

  await chrome.storage.local.set({
    [PROMPT_REVISION_STORAGE_KEY]: {
      updatedAt,
      revision: `${updatedAt}:${crypto.getRandomValues(new Uint32Array(1))[0]}`,
    },
  });
}

export async function ensureLegacyMigrationCompleteMarkerBestEffort(): Promise<void> {
  if (!hasChromeStorageApi()) {
    return;
  }

  try {
    await writeLegacyMigrationCompleteMarker();
  } catch (error) {
    console.error(
      '[promptit] Failed to write prompt IndexedDB migration marker.',
      error,
    );
  }
}

async function ensureLegacyMigrationMarkerBeforeFinalDelete(
  id: string,
  options: PromptDeleteOptions,
): Promise<void> {
  if (!hasChromeStorageApi()) {
    return;
  }

  const metas = (await getAllStoreRecords(PROMPT_METAS_STORE)).map(assertPromptMeta);

  if (metas.length !== 1) {
    return;
  }

  const [currentMeta] = metas;

  if (
    currentMeta.id !== id ||
    (options.expectedUpdatedAt &&
      currentMeta.updatedAt !== options.expectedUpdatedAt) ||
    (options.expectedBodyUpdatedAt &&
      currentMeta.bodyUpdatedAt !== options.expectedBodyUpdatedAt)
  ) {
    return;
  }

  if (await getLegacyMigrationMarker()) {
    return;
  }

  if (!(await hasLegacyPromptStorageValue())) {
    return;
  }

  await writeLegacyMigrationCompleteMarker();
}

async function writeLegacyMigrationCompleteMarker(): Promise<void> {
  await chrome.storage.local.set({
    [PROMPT_IDB_MIGRATION_STORAGE_KEY]: {
      status: 'complete',
      completedAt: new Date().toISOString(),
    },
  });
}

async function hasLegacyPromptStorageValue(): Promise<boolean> {
  const result = await chrome.storage.local.get(LEGACY_PROMPTS_STORAGE_KEY);
  return typeof result[LEGACY_PROMPTS_STORAGE_KEY] !== 'undefined';
}

async function getLegacyMigrationMarker(): Promise<LegacyMigrationMarker | null> {
  const result = await chrome.storage.local.get(PROMPT_IDB_MIGRATION_STORAGE_KEY);
  return parseLegacyMigrationMarker(result[PROMPT_IDB_MIGRATION_STORAGE_KEY]);
}

function parseLegacyMigrationMarker(value: unknown): LegacyMigrationMarker | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const marker = value as Record<string, unknown>;

  if (marker.status !== 'complete') {
    return null;
  }

  if (
    marker.completedAt !== undefined &&
    (typeof marker.completedAt !== 'string' ||
      !isValidPromptTimestamp(marker.completedAt))
  ) {
    return null;
  }

  return {
    status: 'complete',
    completedAt:
      typeof marker.completedAt === 'string' ? marker.completedAt : undefined,
  };
}

async function publishPromptRevisionBestEffort(): Promise<void> {
  try {
    await publishPromptRevision();
  } catch (error) {
    console.error(
      '[promptit] Failed to publish prompt revision after migration.',
      error,
    );
  }
}

async function applyMove(
  transaction: IDBTransaction,
  metas: PromptMeta[],
  currentMeta: PromptMeta,
  group: PromptOrderGroup,
  request: PromptMoveRequest,
): Promise<PromptMeta[]> {
  const timestamp = new Date().toISOString();
  const movedMeta: PromptMeta = {
    ...currentMeta,
    pinned: group === 'pinned',
    pinnedOrder: group === 'pinned' ? currentMeta.pinnedOrder : null,
    updatedAt: timestamp,
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

  const finalMetas = nextMetas.map((meta) => {
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

  for (const meta of finalMetas) {
    const original = metas.find((item) => item.id === meta.id);

    if (!original || hasMetaOrderChanged(original, meta)) {
      await putRecordInTransaction(transaction, PROMPT_METAS_STORE, meta);
    }
  }

  return finalMetas;
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

function hasMetaOrderChanged(left: PromptMeta, right: PromptMeta): boolean {
  return (
    left.pinned !== right.pinned ||
    left.normalOrder !== right.normalOrder ||
    left.pinnedOrder !== right.pinnedOrder ||
    left.updatedAt !== right.updatedAt
  );
}

function getValidatedPromptDraft(draft: PromptDraft): PromptDraft {
  const normalizedDraft = normalizePromptDraft(draft);
  const errors = validatePromptDraft(normalizedDraft);

  if (hasPromptDraftErrors(errors)) {
    throw new Error(
      Object.values(errors)
        .filter(Boolean)
        .join(' '),
    );
  }

  return normalizedDraft;
}

function validatePromptTitle(title: string): string {
  const trimmedTitle = title.trim();

  if (trimmedTitle.length < 1 || trimmedTitle.length > 40) {
    throw new Error('제목은 1자 이상 40자 이하로 입력해주세요.');
  }

  return trimmedTitle;
}

function validatePromptContent(content: string): string {
  if (content.trim().length < 1) {
    throw new Error('본문은 비워둘 수 없습니다.');
  }

  if (getUtf8ByteLength(content) > PROMPT_BODY_MAX_BYTES) {
    throw new Error('본문은 500KB 이하로 입력해주세요.');
  }

  return content;
}

function validatePromptOrder(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return value;
}

function validateExpectedTimestamp(
  value: string | undefined,
  fieldName: string,
): void {
  if (typeof value !== 'undefined' && !isValidPromptTimestamp(value)) {
    throw new Error(`Invalid prompt ${fieldName} timestamp.`);
  }
}

function assertPromptMeta(value: PromptMeta): PromptMeta {
  const parsed = parsePromptMeta(value);

  if (!parsed) {
    throw new Error('Stored prompt metadata is malformed.');
  }

  return parsed;
}

function assertPromptBody(value: PromptBody): PromptBody {
  const parsed = parsePromptBody(value);

  if (!parsed) {
    throw new Error('Stored prompt body is malformed.');
  }

  return parsed;
}

function hasChromeStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function createPromptId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
}
