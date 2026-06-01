import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
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
import {
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  type LanguagePreference,
} from '../../src/shared/i18n';
import {
  THEME_PREFERENCE_STORAGE_KEY,
  type ThemePreference,
} from '../../src/shared/theme';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const configuredExtensionPath = process.env.PROMPTIT_EXTENSION_PATH;
const extensionPath = configuredExtensionPath
  ? path.resolve(process.cwd(), configuredExtensionPath)
  : path.resolve(currentDirPath, '../../dist');
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
  putRawPromptMetas: (records: unknown[]) => Promise<void>;
  putRawPromptBodies: (records: unknown[]) => Promise<void>;
  clearPromptStores: () => Promise<void>;
  deletePromptBody: (id: string) => Promise<void>;
  getLanguagePreference: () => Promise<unknown>;
  setLanguagePreference: (preference: LanguagePreference) => Promise<void>;
  clearLanguagePreference: () => Promise<void>;
  getThemePreference: () => Promise<unknown>;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
  clearThemePreference: () => Promise<void>;
  setChromeStorageLocalValue: (key: string, value: unknown) => Promise<void>;
  getManifestVersion: () => Promise<string>;
  getBrowserUiLanguage: () => Promise<string>;
  getPromptStorageRevision: () => Promise<unknown>;
  getChromeStorageLocalSnapshot: () => Promise<Record<string, unknown>>;
  failLanguagePreferenceWrites: (message?: string) => Promise<void>;
  failThemePreferenceWrites: (message?: string) => Promise<void>;
  failPromptStorageRevisionWrites: (message?: string) => Promise<void>;
  sendRuntimeMessage: (
    message: PromptitRuntimeRequest,
  ) => Promise<PromptitRuntimeResponse>;
  sendRawRuntimeMessage: (message: unknown) => Promise<unknown>;
  close: () => Promise<void>;
};

export type LaunchExtensionOptions = {
  browserLocale?: string;
};

const PROMPT_DATABASE_NAME = 'promptit';
const PROMPT_DATABASE_VERSION = 1;
const PROMPT_META_STORE_NAME = 'promptMetas';
const PROMPT_BODY_STORE_NAME = 'promptBodies';
const PRODUCTION_MATCHES = [
  'https://chatgpt.com/*',
  'https://gemini.google.com/*',
];
const TEST_FIXTURE_MATCHES = ['http://127.0.0.1:*/*', 'http://localhost:*/*'];
const REQUIRED_TEST_MATCHES = [...PRODUCTION_MATCHES, ...TEST_FIXTURE_MATCHES];

type ExtensionManifest = {
  content_scripts?: Array<{
    matches?: string[];
    [key: string]: unknown;
  }>;
  web_accessible_resources?: Array<{
    matches?: string[];
    resources?: string[];
    [key: string]: unknown;
  } | string>;
  [key: string]: unknown;
};

function assertBuiltExtension(): void {
  if (fs.existsSync(extensionManifestPath)) {
    return;
  }

  throw new Error(
    'Built extension not found. Run `pnpm build:test` before executing Playwright tests.',
  );
}

async function prepareTestExtensionDirectory(): Promise<string> {
  const testExtensionPath = await mkdtemp(
    path.join(tempRootPath || os.tmpdir(), 'promptit-extension-'),
  );

  try {
    await cp(extensionPath, testExtensionPath, {
      recursive: true,
    });

    const manifestPath = path.join(testExtensionPath, 'manifest.json');
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as ExtensionManifest;
    const contentScriptMatches =
      manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? [];
    const webAccessibleMatches = (
      manifest.web_accessible_resources ?? []
    ).flatMap((entry) =>
      typeof entry === 'string' ? [] : (entry.matches ?? []),
    );

    for (const match of REQUIRED_TEST_MATCHES) {
      if (
        !contentScriptMatches.includes(match) ||
        !webAccessibleMatches.includes(match)
      ) {
        throw new Error(
          `Test extension manifest is missing ${match}. Run \`pnpm build:test\` before executing Playwright tests.`,
        );
      }
    }

    return testExtensionPath;
  } catch (error) {
    await rm(testExtensionPath, { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error;
  }
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

export async function launchExtension(
  options: LaunchExtensionOptions = {},
): Promise<LoadedExtension> {
  assertBuiltExtension();
  const restoreConfiguredEnvironment = await configureBrowserEnvironment();
  let context: BrowserContext | null = null;
  let userDataDir: string | null = null;
  let testExtensionPath: string | null = null;

  try {
    testExtensionPath = await prepareTestExtensionDirectory();
    userDataDir = await mkdtemp(
      path.join(tempRootPath || os.tmpdir(), 'promptit-playwright-'),
    );
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: !isHeaded,
      locale: options.browserLocale,
      args: [
        `--disable-extensions-except=${testExtensionPath}`,
        `--load-extension=${testExtensionPath}`,
        ...(options.browserLocale ? [`--lang=${options.browserLocale}`] : []),
      ],
    });
  } catch (error) {
    if (context) {
      await context.close().catch(() => undefined);
    }

    if (userDataDir) {
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }

    if (testExtensionPath) {
      await rm(testExtensionPath, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }

    restoreConfiguredEnvironment();
    throw error;
  }

  if (!context || !userDataDir || !testExtensionPath) {
    restoreConfiguredEnvironment();
    throw new Error('Failed to initialize extension browser context.');
  }

  const launchedContext = context;
  const launchedUserDataDir = userDataDir;
  const launchedExtensionPath = testExtensionPath;

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
    await rm(testExtensionPath, { recursive: true, force: true }).catch(
      () => undefined,
    );
    restoreConfiguredEnvironment();
    throw error;
  }

  async function evaluatePromptDatabase<T>(
    action:
      | 'delete-body'
      | 'get-metas'
      | 'get-body'
      | 'get-records'
      | 'put-raw-bodies'
      | 'put-raw-metas'
      | 'clear-stores'
      | 'set-records',
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

      async function clearPromptStores(
        database: IDBDatabase,
        options: PromptDatabaseOptions,
      ): Promise<void> {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(
            [options.metaStoreName, options.bodyStoreName],
            'readwrite',
          );

          transaction.objectStore(options.bodyStoreName).clear();
          transaction.objectStore(options.metaStoreName).clear();

          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onerror = () => {
            reject(
              transaction.error ?? new Error('Failed to clear prompt stores.'),
            );
          };
          transaction.onabort = () => {
            reject(
              transaction.error ?? new Error('Prompt store clear was aborted.'),
            );
          };
        });
      }

      async function putRawRecords(
        database: IDBDatabase,
        storeName: string,
        records: unknown[],
      ): Promise<void> {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);

          for (const record of records) {
            store.put(record);
          }

          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onerror = () => {
            reject(
              transaction.error ??
                new Error(`Failed to write raw records to ${storeName}.`),
            );
          };
          transaction.onabort = () => {
            reject(
              transaction.error ??
                new Error(`Raw record write was aborted for ${storeName}.`),
            );
          };
        });
      }

      async function deletePromptBody(
        database: IDBDatabase,
        options: PromptDatabaseOptions,
        id: string,
      ): Promise<void> {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(
            options.bodyStoreName,
            'readwrite',
          );
          const deleteRequest = transaction
            .objectStore(options.bodyStoreName)
            .delete(id);

          deleteRequest.onerror = () => {
            reject(
              deleteRequest.error ??
                new Error(`Failed to delete prompt body for ${id}.`),
            );
          };
          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onerror = () => {
            reject(
              transaction.error ??
                new Error(`Failed to delete prompt body for ${id}.`),
            );
          };
          transaction.onabort = () => {
            reject(
              transaction.error ??
                new Error(`Prompt body delete was aborted for ${id}.`),
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
        case 'clear-stores':
          await clearPromptStores(database, request.options);
          return undefined;
        case 'delete-body':
          await deletePromptBody(
            database,
            request.options,
            request.payload as string,
          );
          return undefined;
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
        case 'put-raw-bodies':
          await putRawRecords(
            database,
            request.options.bodyStoreName,
            request.payload as unknown[],
          );
          return undefined;
        case 'put-raw-metas':
          await putRawRecords(
            database,
            request.options.metaStoreName,
            request.payload as unknown[],
          );
          return undefined;
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
      await publishPromptStorageRevision();
    },
    async putRawPromptMetas(records) {
      await evaluatePromptDatabase<void>('put-raw-metas', records);
      await publishPromptStorageRevision();
    },
    async putRawPromptBodies(records) {
      await evaluatePromptDatabase<void>('put-raw-bodies', records);
      await publishPromptStorageRevision();
    },
    async clearPromptStores() {
      await evaluatePromptDatabase<void>('clear-stores');
      await publishPromptStorageRevision();
    },
    async deletePromptBody(id) {
      await evaluatePromptDatabase<void>('delete-body', id);
      await publishPromptStorageRevision();
    },
    async getLanguagePreference() {
      const serviceWorker = await getServiceWorker();

      return await serviceWorker.evaluate(async (storageKey) => {
        const result = await chrome.storage.local.get(storageKey);
        return result[storageKey] as unknown;
      }, LANGUAGE_PREFERENCE_STORAGE_KEY);
    },
    async setLanguagePreference(preference) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async ({ storageKey, nextPreference }) => {
        await chrome.storage.local.set({
          [storageKey]: nextPreference,
        });
      }, {
        storageKey: LANGUAGE_PREFERENCE_STORAGE_KEY,
        nextPreference: preference,
      });
    },
    async clearLanguagePreference() {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async (storageKey) => {
        await chrome.storage.local.remove(storageKey);
      }, LANGUAGE_PREFERENCE_STORAGE_KEY);
    },
    async getThemePreference() {
      const serviceWorker = await getServiceWorker();

      return await serviceWorker.evaluate(async (storageKey) => {
        const result = await chrome.storage.local.get(storageKey);
        return result[storageKey] as unknown;
      }, THEME_PREFERENCE_STORAGE_KEY);
    },
    async setThemePreference(preference) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async ({ storageKey, nextPreference }) => {
        await chrome.storage.local.set({
          [storageKey]: nextPreference,
        });
      }, {
        storageKey: THEME_PREFERENCE_STORAGE_KEY,
        nextPreference: preference,
      });
    },
    async clearThemePreference() {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async (storageKey) => {
        await chrome.storage.local.remove(storageKey);
      }, THEME_PREFERENCE_STORAGE_KEY);
    },
    async setChromeStorageLocalValue(key, value) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async ({ storageKey, storageValue }) => {
        await chrome.storage.local.set({
          [storageKey]: storageValue,
        });
      }, {
        storageKey: key,
        storageValue: value,
      });
    },
    async getManifestVersion() {
      const serviceWorker = await getServiceWorker();

      return await serviceWorker.evaluate(
        () => chrome.runtime.getManifest().version,
      );
    },
    async getBrowserUiLanguage() {
      const serviceWorker = await getServiceWorker();

      return await serviceWorker.evaluate(() => chrome.i18n.getUILanguage());
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
    async failLanguagePreferenceWrites(
      message = 'mock language preference write failure',
    ) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(({ failureMessage, storageKey }) => {
        const storage = chrome.storage.local;
        const originalSet = storage.set.bind(storage);

        storage.set = (async (...args: unknown[]) => {
          const [items] = args;

          if (
            typeof items === 'object' &&
            items !== null &&
            storageKey in (items as Record<string, unknown>)
          ) {
            throw new Error(failureMessage);
          }

          await (originalSet as (...nextArgs: unknown[]) => Promise<void>)(...args);
        }) as typeof chrome.storage.local.set;
      }, {
        failureMessage: message,
        storageKey: LANGUAGE_PREFERENCE_STORAGE_KEY,
      });
    },
    async failThemePreferenceWrites(
      message = 'mock theme preference write failure',
    ) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(({ failureMessage, storageKey }) => {
        const storage = chrome.storage.local;
        const originalSet = storage.set.bind(storage);

        storage.set = (async (...args: unknown[]) => {
          const [items] = args;

          if (
            typeof items === 'object' &&
            items !== null &&
            storageKey in (items as Record<string, unknown>)
          ) {
            throw new Error(failureMessage);
          }

          await (originalSet as (...nextArgs: unknown[]) => Promise<void>)(...args);
        }) as typeof chrome.storage.local.set;
      }, {
        failureMessage: message,
        storageKey: THEME_PREFERENCE_STORAGE_KEY,
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

      try {
        await rm(launchedExtensionPath, { recursive: true, force: true });
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
          'Failed to close extension context and remove test directories.',
        );
      }
    },
  };
}
