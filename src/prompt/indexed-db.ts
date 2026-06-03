import type { PromptBody, PromptMeta } from './schema';

export const PROMPTIT_DATABASE_NAME = 'promptit';
export const PROMPTIT_DATABASE_VERSION = 1;
export const PROMPT_METAS_STORE = 'promptMetas';
export const PROMPT_BODIES_STORE = 'promptBodies';

export type PromptStoreName =
  | typeof PROMPT_METAS_STORE
  | typeof PROMPT_BODIES_STORE;

export type PromptStoreRecordMap = {
  [PROMPT_METAS_STORE]: PromptMeta;
  [PROMPT_BODIES_STORE]: PromptBody;
};

let databasePromise: Promise<IDBDatabase> | null = null;

export function openPromptDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(
        PROMPTIT_DATABASE_NAME,
        PROMPTIT_DATABASE_VERSION,
      );

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(PROMPT_METAS_STORE)) {
          database.createObjectStore(PROMPT_METAS_STORE, { keyPath: 'id' });
        }

        if (!database.objectStoreNames.contains(PROMPT_BODIES_STORE)) {
          database.createObjectStore(PROMPT_BODIES_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const database = request.result;

        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };

        resolve(database);
      };

      request.onerror = () => {
        databasePromise = null;
        reject(request.error ?? new Error('Failed to open prompt database.'));
      };

      request.onblocked = () => {
        databasePromise = null;
        reject(new Error('Prompt database upgrade is blocked.'));
      };
    });
  }

  return databasePromise;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed.'));
    };
  });
}

export function transactionDone(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };
  });
}

export async function withPromptTransaction<T>(
  storeNames: PromptStoreName[],
  mode: IDBTransactionMode,
  callback: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const database = await openPromptDatabase();
  const transaction = database.transaction(storeNames, mode);
  const done = transactionDone(transaction);

  try {
    const result = await callback(transaction);
    await done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already be complete or aborted by IndexedDB.
    }

    throw error;
  }
}

export async function getAllStoreRecords<TName extends PromptStoreName>(
  storeName: TName,
): Promise<PromptStoreRecordMap[TName][]> {
  return withPromptTransaction([storeName], 'readonly', (transaction) =>
    getAllRecordsFromTransaction(transaction, storeName),
  );
}

export async function getStoreRecord<TName extends PromptStoreName>(
  storeName: TName,
  id: string,
): Promise<PromptStoreRecordMap[TName] | undefined> {
  return withPromptTransaction([storeName], 'readonly', (transaction) =>
    getRecordFromTransaction(transaction, storeName, id),
  );
}

export function getAllRecordsFromTransaction<TName extends PromptStoreName>(
  transaction: IDBTransaction,
  storeName: TName,
): Promise<PromptStoreRecordMap[TName][]> {
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.getAll());
}

export function getRecordFromTransaction<TName extends PromptStoreName>(
  transaction: IDBTransaction,
  storeName: TName,
  id: string,
): Promise<PromptStoreRecordMap[TName] | undefined> {
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.get(id));
}

export function putRecordInTransaction<TName extends PromptStoreName>(
  transaction: IDBTransaction,
  storeName: TName,
  record: PromptStoreRecordMap[TName],
): Promise<IDBValidKey> {
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.put(record));
}

export function deleteRecordFromTransaction<TName extends PromptStoreName>(
  transaction: IDBTransaction,
  storeName: TName,
  id: string,
): Promise<undefined> {
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.delete(id));
}

export function clearStoreInTransaction<TName extends PromptStoreName>(
  transaction: IDBTransaction,
  storeName: TName,
): Promise<undefined> {
  const store = transaction.objectStore(storeName);
  return requestToPromise(store.clear());
}
