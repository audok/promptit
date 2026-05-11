import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEGACY_PROMPTS_STORAGE_KEY,
  PROMPT_REVISION_STORAGE_KEY,
  type PromptBody,
  type PromptMeta,
  type PromptRecord,
} from '../../src/prompt/schema';
import {
  sendPromptitRuntimeRequest,
  type PromptitRuntimeRequest,
  type PromptitRuntimeResponse,
} from '../../src/runtime/messages';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const extensionPath = path.resolve(currentDirPath, '../../dist');
const extensionManifestPath = path.join(extensionPath, 'manifest.json');
const originalHomePath = process.env.HOME || os.homedir();
const browserCachePath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.join(originalHomePath, '.cache', 'ms-playwright');
const isHeaded = process.env.PLAYWRIGHT_EXTENSION_HEADED !== '0';
const tempRootPath = process.env.TMPDIR || '/tmp';
const browserEnvironmentKeys = [
  'HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'PLAYWRIGHT_BROWSERS_PATH',
] as const;

type BrowserEnvironmentKey = (typeof browserEnvironmentKeys)[number];
type BrowserEnvironmentSnapshot = Record<
  BrowserEnvironmentKey,
  string | undefined
>;

export type LoadedExtension = {
  context: BrowserContext;
  extensionId: string;
  optionsPageUrl: string;
  getPromptMetas: () => Promise<PromptMeta[]>;
  getPromptBody: (id: string) => Promise<PromptBody | null>;
  getPromptRecords: () => Promise<PromptRecord[]>;
  setPromptRecords: (records: PromptRecord[]) => Promise<void>;
  getLegacyPrompts: () => Promise<unknown>;
  setLegacyRawPrompts: (rawValue: unknown) => Promise<void>;
  getPromptStorageRevision: () => Promise<unknown>;
  getChromeStorageLocalSnapshot: () => Promise<Record<string, unknown>>;
  failPromptStorageRevisionWrites: (message?: string) => Promise<void>;
  failPromptStorageKeyWritesOnce: (
    keys: string[],
    message?: string,
  ) => Promise<void>;
  sendRuntimeMessage: (
    message: PromptitRuntimeRequest,
  ) => Promise<PromptitRuntimeResponse>;
  sendRawRuntimeMessage: (message: unknown) => Promise<unknown>;
  close: () => Promise<void>;
};

const PROMPT_DATABASE_NAME = 'promptit';
const PROMPT_DATABASE_VERSION = 1;
const PROMPT_META_STORE_NAME = 'promptMetas';
const PROMPT_BODY_STORE_NAME = 'promptBodies';

function assertBuiltExtension(): void {
  if (fs.existsSync(extensionManifestPath)) {
    return;
  }

  throw new Error(
    'Built extension not found. Run `pnpm build` before executing Playwright tests.',
  );
}

function captureBrowserEnvironment(): BrowserEnvironmentSnapshot {
  return Object.fromEntries(
    browserEnvironmentKeys.map((key) => [key, process.env[key]]),
  ) as BrowserEnvironmentSnapshot;
}

function restoreBrowserEnvironment(snapshot: BrowserEnvironmentSnapshot): void {
  for (const key of browserEnvironmentKeys) {
    const previousValue = snapshot[key];

    if (previousValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = previousValue;
  }
}

async function configureBrowserEnvironment(): Promise<() => void> {
  const previousEnvironment = captureBrowserEnvironment();
  const browserHomePath = path.join(tempRootPath || os.tmpdir(), 'promptit-playwright-home');
  const configPath = path.join(browserHomePath, '.config');
  const cachePath = path.join(browserHomePath, '.cache');
  const dataPath = path.join(browserHomePath, '.local', 'share');

  await Promise.all([
    mkdir(configPath, { recursive: true }),
    mkdir(cachePath, { recursive: true }),
    mkdir(dataPath, { recursive: true }),
  ]);

  process.env.HOME = browserHomePath;
  process.env.XDG_CONFIG_HOME = configPath;
  process.env.XDG_CACHE_HOME = cachePath;
  process.env.XDG_DATA_HOME = dataPath;
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserCachePath;

  return () => restoreBrowserEnvironment(previousEnvironment);
}

export async function launchExtension(): Promise<LoadedExtension> {
  assertBuiltExtension();
  const restoreConfiguredEnvironment = await configureBrowserEnvironment();
  let context: BrowserContext | null = null;
  let userDataDir: string | null = null;

  try {
    userDataDir = await mkdtemp(
      path.join(tempRootPath || os.tmpdir(), 'promptit-playwright-'),
    );
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: !isHeaded,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
  } catch (error) {
    if (context) {
      await context.close().catch(() => undefined);
    }

    if (userDataDir) {
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }

    restoreConfiguredEnvironment();
    throw error;
  }

  if (!context || !userDataDir) {
    restoreConfiguredEnvironment();
    throw new Error('Failed to initialize extension browser context.');
  }

  const launchedContext = context;
  const launchedUserDataDir = userDataDir;

  async function getServiceWorker() {
    let [serviceWorker] = launchedContext.serviceWorkers();

    if (!serviceWorker) {
      serviceWorker = await launchedContext.waitForEvent('serviceworker');
    }

    return serviceWorker;
  }

  let extensionId: string;

  try {
    extensionId = new URL((await getServiceWorker()).url()).host;
  } catch (error) {
    await launchedContext.close().catch(() => undefined);
    await rm(launchedUserDataDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
    restoreConfiguredEnvironment();
    throw error;
  }

  async function evaluatePromptDatabase<T>(
    action: 'get-metas' | 'get-body' | 'get-records' | 'set-records',
    payload?: unknown,
  ): Promise<T> {
    const serviceWorker = await getServiceWorker();

    return await serviceWorker.evaluate(async (request) => {
      type PromptDatabaseOptions = {
        databaseName: string;
        databaseVersion: number;
        metaStoreName: string;
        bodyStoreName: string;
      };

      async function openPromptDatabase(
        options: PromptDatabaseOptions,
      ): Promise<IDBDatabase> {
        return await new Promise((resolve, reject) => {
          const openRequest = indexedDB.open(
            options.databaseName,
            options.databaseVersion,
          );

          openRequest.onupgradeneeded = () => {
            const database = openRequest.result;

            if (!database.objectStoreNames.contains(options.metaStoreName)) {
              database.createObjectStore(options.metaStoreName, { keyPath: 'id' });
            }

            if (!database.objectStoreNames.contains(options.bodyStoreName)) {
              database.createObjectStore(options.bodyStoreName, { keyPath: 'id' });
            }
          };
          openRequest.onsuccess = () => {
            resolve(openRequest.result);
          };
          openRequest.onerror = () => {
            reject(
              openRequest.error ?? new Error('Failed to open prompt IndexedDB.'),
            );
          };
        });
      }

      async function getAllRecords<TRecord>(
        database: IDBDatabase,
        storeName: string,
      ): Promise<TRecord[]> {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readonly');
          const storeRequest = transaction.objectStore(storeName).getAll();

          storeRequest.onsuccess = () => {
            resolve(storeRequest.result as TRecord[]);
          };
          storeRequest.onerror = () => {
            reject(storeRequest.error ?? new Error(`Failed to read ${storeName}.`));
          };
          transaction.onerror = () => {
            reject(transaction.error ?? new Error(`Failed to read ${storeName}.`));
          };
        });
      }

      async function getRecord<TRecord>(
        database: IDBDatabase,
        storeName: string,
        id: string,
      ): Promise<TRecord | null> {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readonly');
          const storeRequest = transaction.objectStore(storeName).get(id);

          storeRequest.onsuccess = () => {
            resolve((storeRequest.result as TRecord | undefined) ?? null);
          };
          storeRequest.onerror = () => {
            reject(storeRequest.error ?? new Error(`Failed to read ${storeName}.`));
          };
          transaction.onerror = () => {
            reject(transaction.error ?? new Error(`Failed to read ${storeName}.`));
          };
        });
      }

      async function replacePromptRecords(
        database: IDBDatabase,
        options: PromptDatabaseOptions,
        records: PromptRecord[],
      ): Promise<void> {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(
            [options.metaStoreName, options.bodyStoreName],
            'readwrite',
          );
          const metaStore = transaction.objectStore(options.metaStoreName);
          const bodyStore = transaction.objectStore(options.bodyStoreName);

          metaStore.clear();
          bodyStore.clear();

          for (const record of records) {
            const { content, ...meta } = record;
            metaStore.put(meta);
            bodyStore.put({
              id: record.id,
              content,
              updatedAt: record.bodyUpdatedAt,
            });
          }

          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onerror = () => {
            reject(
              transaction.error ?? new Error('Failed to write prompt records.'),
            );
          };
          transaction.onabort = () => {
            reject(
              transaction.error ?? new Error('Prompt record write was aborted.'),
            );
          };
        });
      }

      function sortPromptMetas<TRecord extends PromptMeta>(
        records: TRecord[],
      ): TRecord[] {
        return [...records].sort((left, right) => {
          if (left.pinned !== right.pinned) {
            return left.pinned ? -1 : 1;
          }

          if (left.pinned) {
            const leftOrder = left.pinnedOrder ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = right.pinnedOrder ?? Number.MAX_SAFE_INTEGER;

            if (leftOrder !== rightOrder) {
              return leftOrder - rightOrder;
            }
          } else if (left.normalOrder !== right.normalOrder) {
            return left.normalOrder - right.normalOrder;
          }

          if (left.createdAt !== right.createdAt) {
            return left.createdAt.localeCompare(right.createdAt);
          }

          return left.id.localeCompare(right.id);
        });
      }

      const database = await openPromptDatabase(request.options);

      switch (request.action) {
        case 'get-metas':
          return sortPromptMetas(await getAllRecords<PromptMeta>(
            database,
            request.options.metaStoreName,
          ));
        case 'get-body':
          return await getRecord<PromptBody>(
            database,
            request.options.bodyStoreName,
            request.payload as string,
          );
        case 'get-records': {
          const metas = await getAllRecords<PromptMeta>(
            database,
            request.options.metaStoreName,
          );
          const bodies = await getAllRecords<PromptBody>(
            database,
            request.options.bodyStoreName,
          );
          const bodiesById = new Map(bodies.map((body) => [body.id, body]));

          return sortPromptMetas(metas).map((meta) => {
            const body = bodiesById.get(meta.id);

            if (!body) {
              throw new Error(`Missing prompt body for ${meta.id}.`);
            }

            return {
              ...meta,
              content: body.content,
            };
          });
        }
        case 'set-records':
          await replacePromptRecords(
            database,
            request.options,
            request.payload as PromptRecord[],
          );
          return undefined;
      }
    }, {
      action,
      payload,
      options: {
        databaseName: PROMPT_DATABASE_NAME,
        databaseVersion: PROMPT_DATABASE_VERSION,
        metaStoreName: PROMPT_META_STORE_NAME,
        bodyStoreName: PROMPT_BODY_STORE_NAME,
      },
    }) as T;
  }

  async function publishPromptStorageRevision(): Promise<void> {
    const serviceWorker = await getServiceWorker();

    await serviceWorker.evaluate(async (revisionKey) => {
      await chrome.storage.local.set({
        [revisionKey]: {
          id: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        },
      });
    }, PROMPT_REVISION_STORAGE_KEY);
  }

  async function withRuntimePage<T>(
    action: (runtimePage: Page) => Promise<T>,
  ): Promise<T> {
    let runtimePage = launchedContext
      .pages()
      .find((page) => page.url().startsWith(`chrome-extension://${extensionId}/`));
    let shouldCloseRuntimePage = false;

    if (!runtimePage) {
      runtimePage = await launchedContext.newPage();
      shouldCloseRuntimePage = true;
      await runtimePage.goto(`chrome-extension://${extensionId}/src/options/index.html`, {
        waitUntil: 'domcontentloaded',
      });
    }

    try {
      return await action(runtimePage);
    } finally {
      if (shouldCloseRuntimePage) {
        await runtimePage.close().catch(() => undefined);
      }
    }
  }

  return {
    context: launchedContext,
    extensionId,
    optionsPageUrl: `chrome-extension://${extensionId}/src/options/index.html`,
    async getPromptMetas() {
      return await evaluatePromptDatabase<PromptMeta[]>('get-metas');
    },
    async getPromptBody(id) {
      return await evaluatePromptDatabase<PromptBody | null>('get-body', id);
    },
    async getPromptRecords() {
      return await evaluatePromptDatabase<PromptRecord[]>('get-records');
    },
    async setPromptRecords(records) {
      await evaluatePromptDatabase<void>('set-records', records);
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async (legacyPromptsKey) => {
        await chrome.storage.local.remove(legacyPromptsKey);
      }, LEGACY_PROMPTS_STORAGE_KEY);
      await publishPromptStorageRevision();
    },
    async getLegacyPrompts() {
      const serviceWorker = await getServiceWorker();

      return await serviceWorker.evaluate(async (legacyPromptsKey) => {
        const result = await chrome.storage.local.get(legacyPromptsKey);
        return result[legacyPromptsKey] as unknown;
      }, LEGACY_PROMPTS_STORAGE_KEY);
    },
    async setLegacyRawPrompts(rawValue) {
      await evaluatePromptDatabase<void>('set-records', []);
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async (request) => {
        await chrome.storage.local.set({
          [request.legacyPromptsKey]: request.rawValue,
        });
        await chrome.storage.local.remove([
          request.revisionKey,
          'promptit:idbMigration',
        ]);
      }, {
        legacyPromptsKey: LEGACY_PROMPTS_STORAGE_KEY,
        rawValue,
        revisionKey: PROMPT_REVISION_STORAGE_KEY,
      });
    },
    async getPromptStorageRevision() {
      const serviceWorker = await getServiceWorker();

      return await serviceWorker.evaluate(async (revisionKey) => {
        const result = await chrome.storage.local.get(revisionKey);
        return result[revisionKey] as unknown;
      }, PROMPT_REVISION_STORAGE_KEY);
    },
    async getChromeStorageLocalSnapshot() {
      const serviceWorker = await getServiceWorker();

      return await serviceWorker.evaluate(async () => {
        return await chrome.storage.local.get(null) as Record<string, unknown>;
      });
    },
    async failPromptStorageRevisionWrites(
      message = 'mock prompt revision publish failure',
    ) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(({ failureMessage, revisionKey }) => {
        const storage = chrome.storage.local;
        const originalSet = storage.set.bind(storage);

        storage.set = (async (...args: unknown[]) => {
          const [items] = args;

          if (
            typeof items === 'object' &&
            items !== null &&
            revisionKey in (items as Record<string, unknown>)
          ) {
            throw new Error(failureMessage);
          }

          await (originalSet as (...nextArgs: unknown[]) => Promise<void>)(...args);
        }) as typeof chrome.storage.local.set;
      }, {
        failureMessage: message,
        revisionKey: PROMPT_REVISION_STORAGE_KEY,
      });
    },
    async failPromptStorageKeyWritesOnce(
      keys,
      message = 'mock prompt storage key write failure',
    ) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(({ failureMessage, storageKeys }) => {
        const storage = chrome.storage.local;
        const originalSet = storage.set.bind(storage);
        let didFail = false;

        storage.set = (async (...args: unknown[]) => {
          const [items] = args;
          const shouldFail =
            !didFail &&
            typeof items === 'object' &&
            items !== null &&
            storageKeys.some(
              (storageKey) => storageKey in (items as Record<string, unknown>),
            );

          if (shouldFail) {
            didFail = true;
            storage.set = originalSet as typeof chrome.storage.local.set;
            throw new Error(failureMessage);
          }

          await (originalSet as (...nextArgs: unknown[]) => Promise<void>)(...args);
        }) as typeof chrome.storage.local.set;
      }, {
        failureMessage: message,
        storageKeys: keys,
      });
    },
    async sendRuntimeMessage(message) {
      return await withRuntimePage(
        async (runtimePage) => await sendPromptitRuntimeRequest(
          async (nextMessage) =>
            await runtimePage.evaluate(
              async (request) => await chrome.runtime.sendMessage(request),
              nextMessage,
            ),
          message,
        ),
      );
    },
    async sendRawRuntimeMessage(message) {
      return await withRuntimePage(
        async (runtimePage) =>
          await runtimePage.evaluate(
            async (request) => await chrome.runtime.sendMessage(request),
            message,
          ),
      );
    },
    async close() {
      const cleanupErrors: unknown[] = [];

      try {
        await launchedContext.close();
      } catch (error) {
        cleanupErrors.push(error);
      }

      try {
        await rm(launchedUserDataDir, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }

      restoreConfiguredEnvironment();

      if (cleanupErrors.length === 1) {
        throw cleanupErrors[0];
      }

      if (cleanupErrors.length > 1) {
        throw new AggregateError(
          cleanupErrors,
          'Failed to close extension context and remove user data directory.',
        );
      }
    },
  };
}
