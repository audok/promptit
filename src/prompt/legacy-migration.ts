import {
  getAllStoreRecords,
  PROMPT_BODIES_STORE,
  PROMPT_METAS_STORE,
  putRecordInTransaction,
  withPromptTransaction,
} from './indexed-db';
import {
  LEGACY_PROMPTS_STORAGE_KEY,
  PROMPT_BODY_MAX_BYTES,
  decodeStoredPrompts,
  getPromptCharCount,
  getUtf8ByteLength,
  isValidPromptTimestamp,
  parsePromptMeta,
  type PromptBody,
  type PromptItem,
  type PromptMeta,
} from './schema';
import { getInitialOrder } from './order';
import { publishPromptRevisionBestEffort } from './revision';

const PROMPT_IDB_MIGRATION_STORAGE_KEY = 'promptit:idbMigration';

type LegacyMigrationMarker = {
  status: 'complete';
  completedAt?: string;
};

export type LegacyMigrationFinalDeleteOptions = {
  expectedUpdatedAt?: string;
  expectedBodyUpdatedAt?: string;
};

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

  const migratedRecords = buildLegacyPromptRecords(decoded.prompts);

  await withPromptTransaction(
    [PROMPT_METAS_STORE, PROMPT_BODIES_STORE],
    'readwrite',
    async (transaction) => {
      for (const { meta, body } of migratedRecords) {
        await putRecordInTransaction(transaction, PROMPT_METAS_STORE, meta);
        await putRecordInTransaction(transaction, PROMPT_BODIES_STORE, body);
      }
    },
  );

  await ensureLegacyMigrationCompleteMarkerBestEffort();
  await publishPromptRevisionBestEffort(
    '[promptit] Failed to publish prompt revision after migration.',
  );
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

export async function ensureLegacyMigrationMarkerBeforeFinalDelete(
  id: string,
  options: LegacyMigrationFinalDeleteOptions,
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

function buildLegacyPromptRecords(
  prompts: PromptItem[],
): { meta: PromptMeta; body: PromptBody }[] {
  return prompts.map((prompt, index) => ({
    meta: {
      id: prompt.id,
      title: prompt.title,
      pinned: false,
      normalOrder: getInitialOrder(index),
      pinnedOrder: null,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
      bodyUpdatedAt: prompt.updatedAt,
      charCount: getPromptCharCount(prompt.content),
    },
    body: {
      id: prompt.id,
      content: prompt.content,
      updatedAt: prompt.updatedAt,
    },
  }));
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

function assertPromptMeta(value: PromptMeta): PromptMeta {
  const parsed = parsePromptMeta(value);

  if (!parsed) {
    throw new Error('Stored prompt metadata is malformed.');
  }

  return parsed;
}

function hasChromeStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
