import {
  clearStoreInTransaction,
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
  PROMPT_BODY_MAX_BYTES,
  PROMPT_ORDER_GAP,
  getPromptCharCount,
  getUtf8ByteLength,
  hasPromptDraftErrors,
  isValidPromptTimestamp,
  normalizePromptDraft,
  parsePromptBody,
  parsePromptMeta,
  parsePromptRecord,
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
  hasMetaOrderChanged,
  movePromptMetaInOrder,
  resolvePromptCreateOrders,
  resolvePromptPinnedMeta,
  validatePromptMoveBoundaries,
} from './order';
export { publishPromptRevision } from './revision';

export type PromptMutationOptions = {
  expectedUpdatedAt?: string;
};

export type PromptBodyMutationOptions = {
  expectedUpdatedAt?: string;
  expectedBodyUpdatedAt?: string;
};

export type PromptRecordMutationOptions = {
  expectedUpdatedAt?: string;
  expectedBodyUpdatedAt?: string;
};

export type PromptDeleteOptions = PromptMutationOptions &
  PromptBodyMutationOptions;

export type PromptMoveRequest = PromptMutationOptions & {
  group?: PromptOrderGroup;
  previousId: string | null;
  nextId: string | null;
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

export async function listPromptMetas(): Promise<PromptMeta[]> {
  const records = await getAllStoreRecords(PROMPT_METAS_STORE);
  return sortPromptMetas(records.map(assertPromptMeta));
}

export async function getPromptBody(id: string): Promise<PromptBody | null> {
  const body = await getStoreRecord(PROMPT_BODIES_STORE, id);

  return body ? assertPromptBody(body) : null;
}

export async function getPromptRecord(id: string): Promise<PromptRecord | null> {
  return withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readonly',
    async (transaction) => {
      const meta = await getRecordFromTransaction(
        transaction,
        PROMPT_METAS_STORE,
        id,
      );
      const body = await getRecordFromTransaction(
        transaction,
        PROMPT_BODIES_STORE,
        id,
      );

      if (!meta || !body) {
        return null;
      }

      return toPromptRecord(assertPromptMeta(meta), assertPromptBody(body));
    },
  );
}

export async function listPromptRecords(): Promise<PromptRecord[]> {
  return withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readonly',
    async (transaction) => {
      const metas = (
        await getAllRecordsFromTransaction(transaction, PROMPT_METAS_STORE)
      ).map(assertPromptMeta);
      const bodies = (
        await getAllRecordsFromTransaction(transaction, PROMPT_BODIES_STORE)
      ).map(assertPromptBody);
      const bodiesById = new Map(bodies.map((body) => [body.id, body]));
      const metaIds = new Set(metas.map((meta) => meta.id));
      const records = metas.map((meta) => {
        const body = bodiesById.get(meta.id);

        if (!body) {
          throw new Error('Stored prompt record is missing a body.');
        }

        return toPromptRecord(meta, body);
      });

      if (bodies.some((body) => !metaIds.has(body.id))) {
        throw new Error('Stored prompt body is missing metadata.');
      }

      return sortPromptRecords(records);
    },
  );
}

export async function replacePromptRecords(
  records: PromptRecord[],
): Promise<PromptRecord[]> {
  const validatedRecords = records.map(getValidatedPromptRecord);
  const ids = new Set<string>();

  for (const record of validatedRecords) {
    if (ids.has(record.id)) {
      throw new Error('Backup contains duplicate prompt ids.');
    }

    ids.add(record.id);
  }

  return withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readwrite',
    async (transaction) => {
      await clearStoreInTransaction(transaction, PROMPT_BODIES_STORE);
      await clearStoreInTransaction(transaction, PROMPT_METAS_STORE);

      for (const record of validatedRecords) {
        const { content, ...meta } = record;
        const body: PromptBody = {
          id: record.id,
          content,
          updatedAt: record.bodyUpdatedAt,
        };

        await putRecordInTransaction(transaction, PROMPT_METAS_STORE, meta);
        await putRecordInTransaction(transaction, PROMPT_BODIES_STORE, body);
      }

      return sortPromptRecords(validatedRecords);
    },
  );
}

export async function appendPromptDrafts(
  drafts: PromptDraft[],
): Promise<PromptRecord[]> {
  const validatedDrafts = drafts.map(getValidatedPromptDraft);

  if (validatedDrafts.length === 0) {
    return [];
  }

  return withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readwrite',
    async (transaction) => {
      const metas = (
        await getAllRecordsFromTransaction(transaction, PROMPT_METAS_STORE)
      ).map(assertPromptMeta);
      const existingIds = new Set(metas.map((meta) => meta.id));
      const normalOrders = metas
        .filter((meta) => !meta.pinned)
        .map((meta) => meta.normalOrder);
      const firstOrder =
        normalOrders.length === 0
          ? PROMPT_ORDER_GAP
          : Math.max(...normalOrders) + PROMPT_ORDER_GAP;
      const timestamp = new Date().toISOString();
      const createdRecords = validatedDrafts.map((draft, index) => {
        const id = createUniquePromptId(existingIds);
        const meta: PromptMeta = {
          id,
          title: draft.title,
          pinned: false,
          normalOrder: firstOrder + index * PROMPT_ORDER_GAP,
          pinnedOrder: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          bodyUpdatedAt: timestamp,
          charCount: getPromptCharCount(draft.content),
        };
        const body: PromptBody = {
          id,
          content: draft.content,
          updatedAt: timestamp,
        };

        return toPromptRecord(meta, body);
      });

      for (const record of createdRecords) {
        const { content, ...meta } = record;
        const body: PromptBody = {
          id: record.id,
          content,
          updatedAt: record.bodyUpdatedAt,
        };

        await putRecordInTransaction(transaction, PROMPT_METAS_STORE, meta);
        await putRecordInTransaction(transaction, PROMPT_BODIES_STORE, body);
      }

      return createdRecords;
    },
  );
}

export async function createPrompt(
  draft: PromptDraft,
): Promise<PromptRecord> {
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
      const { normalOrder, pinnedOrder } = resolvePromptCreateOrders(
        metas,
        validatedDraft,
        pinned,
      );

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
  const nextContent = validatePromptContent(content);
  validateExpectedTimestamp(options.expectedUpdatedAt, 'updatedAt');
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
        (options.expectedUpdatedAt &&
          currentMeta.updatedAt !== options.expectedUpdatedAt) ||
        (options.expectedBodyUpdatedAt &&
          currentMeta.bodyUpdatedAt !== options.expectedBodyUpdatedAt)
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

export async function updatePromptRecord(
  id: string,
  draft: PromptDraft,
  options: PromptRecordMutationOptions = {},
): Promise<PromptBodyMutationResult> {
  const validatedDraft = getValidatedPromptDraft(draft);
  validateExpectedTimestamp(options.expectedUpdatedAt, 'updatedAt');
  validateExpectedTimestamp(options.expectedBodyUpdatedAt, 'bodyUpdatedAt');

  return withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readwrite',
    async (transaction) => {
      const metas = (
        await getAllRecordsFromTransaction(transaction, PROMPT_METAS_STORE)
      ).map(assertPromptMeta);
      const currentMeta = metas.find((meta) => meta.id === id) ?? null;
      const currentBodyRecord = await getRecordFromTransaction(
        transaction,
        PROMPT_BODIES_STORE,
        id,
      );

      if (!currentMeta || !currentBodyRecord) {
        return {
          status: 'not-found',
          id,
        };
      }

      const currentBody = assertPromptBody(currentBodyRecord);
      const currentRecord = toPromptRecord(currentMeta, currentBody);

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
          currentRecord,
        };
      }

      const nextPinned = validatedDraft.pinned ?? currentMeta.pinned;
      const titleChanged = validatedDraft.title !== currentMeta.title;
      const contentChanged = validatedDraft.content !== currentBody.content;
      const pinnedChanged = nextPinned !== currentMeta.pinned;

      if (!titleChanged && !contentChanged && !pinnedChanged) {
        return {
          status: 'success',
          value: currentRecord,
        };
      }

      const timestamp = new Date().toISOString();
      const pinnedMeta = pinnedChanged
        ? resolvePromptPinnedMeta(metas, currentMeta, nextPinned, timestamp)
        : currentMeta;
      const body: PromptBody = contentChanged
        ? {
            id,
            content: validatedDraft.content,
            updatedAt: timestamp,
          }
        : currentBody;
      const meta: PromptMeta = {
        ...pinnedMeta,
        title: validatedDraft.title,
        updatedAt: timestamp,
        bodyUpdatedAt: contentChanged ? timestamp : currentMeta.bodyUpdatedAt,
        charCount: contentChanged
          ? getPromptCharCount(validatedDraft.content)
          : currentMeta.charCount,
      };

      if (contentChanged) {
        await putRecordInTransaction(transaction, PROMPT_BODIES_STORE, body);
      }
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
  validateExpectedTimestamp(options.expectedUpdatedAt, 'updatedAt');
  validateExpectedTimestamp(options.expectedBodyUpdatedAt, 'bodyUpdatedAt');

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
    const boundaryValidation = validatePromptMoveBoundaries(
      metas,
      currentMeta,
      group,
      request,
    );

    if (!boundaryValidation.ok) {
      return {
        status: 'conflict',
        id,
        currentMeta,
      };
    }

    const nextMetas = movePromptMetaInOrder(
      metas,
      currentMeta,
      group,
      request,
      new Date().toISOString(),
    );
    const nextMeta = nextMetas.find((meta) => meta.id === id);

    if (!nextMeta) {
      throw new Error('Moved prompt was not written.');
    }

    for (const meta of nextMetas) {
      const original = metas.find((item) => item.id === meta.id);

      if (!original || hasMetaOrderChanged(original, meta)) {
        await putRecordInTransaction(transaction, PROMPT_METAS_STORE, meta);
      }
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

    const nextMeta = resolvePromptPinnedMeta(
      metas,
      currentMeta,
      pinned,
      new Date().toISOString(),
    );

    await putRecordInTransaction(transaction, PROMPT_METAS_STORE, nextMeta);

    return {
      status: 'success',
      value: nextMeta,
    };
  });
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

function getValidatedPromptRecord(record: PromptRecord): PromptRecord {
  const parsed = parsePromptRecord({
    ...record,
    charCount: getPromptCharCount(record.content),
  });

  if (!parsed) {
    throw new Error('Prompt record is malformed.');
  }

  return parsed;
}

function sortPromptRecords(records: PromptRecord[]): PromptRecord[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));

  return sortPromptMetas(records).map((meta) => {
    const record = recordsById.get(meta.id);

    if (!record) {
      throw new Error('Prompt record was not found after sorting.');
    }

    return record;
  });
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

function createPromptId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
}

function createUniquePromptId(existingIds: Set<string>): string {
  let id = createPromptId();

  while (existingIds.has(id)) {
    id = createPromptId();
  }

  existingIds.add(id);
  return id;
}
