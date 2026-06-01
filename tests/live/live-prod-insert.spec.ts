import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import fs from 'node:fs';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  PROMPT_BODIES_STORE,
  PROMPT_METAS_STORE,
  PROMPTIT_DATABASE_NAME,
  PROMPTIT_DATABASE_VERSION,
} from '../../src/prompt/indexed-db';
import {
  PROMPT_REVISION_STORAGE_KEY,
  type PromptRecord,
} from '../../src/prompt/schema';
import { createPromptRecord, getComposer } from '../playwright/promptit';
import { runLiveStep } from './liveSmokeClassification';
import {
  chatgptLiveSite,
  geminiLiveSite,
  type LiveSiteAdapter,
} from './liveSiteAdapters';

const configuredExtensionPath = process.env.PROMPTIT_EXTENSION_PATH;
const extensionPath = configuredExtensionPath
  ? path.resolve(process.cwd(), configuredExtensionPath)
  : path.resolve(process.cwd(), 'dist');
const extensionManifestPath = path.join(extensionPath, 'manifest.json');
const originalHomePath = process.env.HOME || os.homedir();
const browserCachePath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.join(originalHomePath, '.cache', 'ms-playwright');
const isHeaded = process.env.PLAYWRIGHT_EXTENSION_HEADED !== '0';
const tempRootPath = process.env.TMPDIR || os.tmpdir();
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

type ProductionLiveExtension = {
  readonly context: BrowserContext;
  setPromptRecords(records: PromptRecord[]): Promise<void>;
  close(): Promise<void>;
};

type ExtensionManifest = {
  content_scripts?: Array<{
    matches?: string[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

function isProductionDistPath(): boolean {
  return configuredExtensionPath
    ? path.basename(path.resolve(process.cwd(), configuredExtensionPath)) === 'dist'
    : false;
}

test.skip(
  !isProductionDistPath(),
  'production live smoke requires PROMPTIT_EXTENSION_PATH=dist',
);

async function assertProductionManifest(): Promise<void> {
  if (!fs.existsSync(extensionManifestPath)) {
    throw new Error(
      'Built production extension not found. Run `pnpm build` before executing production live smoke tests.',
    );
  }

  const manifest = JSON.parse(
    await readFile(extensionManifestPath, 'utf8'),
  ) as ExtensionManifest;
  const contentScriptMatches =
    manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? [];

  for (const match of [
    'https://chatgpt.com/*',
    'https://gemini.google.com/*',
  ]) {
    expect(contentScriptMatches).toContain(match);
  }

  expect(contentScriptMatches).not.toContain('http://127.0.0.1:*/*');
  expect(contentScriptMatches).not.toContain('http://localhost:*/*');
}

async function prepareProductionExtensionDirectory(): Promise<string> {
  await assertProductionManifest();

  const testExtensionPath = await mkdtemp(
    path.join(tempRootPath, 'promptit-production-extension-'),
  );

  try {
    await cp(extensionPath, testExtensionPath, { recursive: true });
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
  const browserHomePath = path.join(
    tempRootPath,
    'promptit-production-playwright-home',
  );
  const configPath = path.join(browserHomePath, '.config');
  const cachePath = path.join(browserHomePath, '.cache');
  const dataPath = path.join(browserHomePath, '.local', 'share');

  await Promise.all([
    fs.promises.mkdir(configPath, { recursive: true }),
    fs.promises.mkdir(cachePath, { recursive: true }),
    fs.promises.mkdir(dataPath, { recursive: true }),
  ]);

  process.env.HOME = browserHomePath;
  process.env.XDG_CONFIG_HOME = configPath;
  process.env.XDG_CACHE_HOME = cachePath;
  process.env.XDG_DATA_HOME = dataPath;
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserCachePath;

  return () => restoreBrowserEnvironment(previousEnvironment);
}

async function launchProductionExtension(): Promise<ProductionLiveExtension> {
  const restoreConfiguredEnvironment = await configureBrowserEnvironment();
  let context: BrowserContext | null = null;
  let userDataDir: string | null = null;
  let productionExtensionPath: string | null = null;

  try {
    productionExtensionPath = await prepareProductionExtensionDirectory();
    userDataDir = await mkdtemp(
      path.join(tempRootPath, 'promptit-production-playwright-'),
    );
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: !isHeaded,
      args: [
        `--disable-extensions-except=${productionExtensionPath}`,
        `--load-extension=${productionExtensionPath}`,
      ],
    });
  } catch (error) {
    if (context) {
      await context.close().catch(() => undefined);
    }

    if (userDataDir) {
      await rm(userDataDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }

    if (productionExtensionPath) {
      await rm(productionExtensionPath, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }

    restoreConfiguredEnvironment();
    throw error;
  }

  if (!context || !userDataDir || !productionExtensionPath) {
    restoreConfiguredEnvironment();
    throw new Error('Failed to initialize production extension browser context.');
  }

  const launchedContext = context;
  const launchedUserDataDir = userDataDir;
  const launchedExtensionPath = productionExtensionPath;

  async function getServiceWorker() {
    let [serviceWorker] = launchedContext.serviceWorkers();

    if (!serviceWorker) {
      serviceWorker = await launchedContext.waitForEvent('serviceworker');
    }

    return serviceWorker;
  }

  async function setPromptRecords(records: PromptRecord[]): Promise<void> {
    const serviceWorker = await getServiceWorker();

    await serviceWorker.evaluate(async (request) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const openRequest = indexedDB.open(
          request.databaseName,
          request.databaseVersion,
        );

        openRequest.onupgradeneeded = () => {
          const nextDatabase = openRequest.result;

          if (!nextDatabase.objectStoreNames.contains(request.metaStoreName)) {
            nextDatabase.createObjectStore(request.metaStoreName, {
              keyPath: 'id',
            });
          }

          if (!nextDatabase.objectStoreNames.contains(request.bodyStoreName)) {
            nextDatabase.createObjectStore(request.bodyStoreName, {
              keyPath: 'id',
            });
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

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          [request.metaStoreName, request.bodyStoreName],
          'readwrite',
        );
        const metaStore = transaction.objectStore(request.metaStoreName);
        const bodyStore = transaction.objectStore(request.bodyStoreName);

        metaStore.clear();
        bodyStore.clear();

        for (const record of request.records) {
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

      const updatedAt = new Date().toISOString();
      await chrome.storage.local.set({
        [request.revisionStorageKey]: {
          updatedAt,
          revision: `${updatedAt}:${crypto.getRandomValues(new Uint32Array(1))[0]}`,
          reason: 'records-replaced',
        },
      });
    }, {
      bodyStoreName: PROMPT_BODIES_STORE,
      databaseName: PROMPTIT_DATABASE_NAME,
      databaseVersion: PROMPTIT_DATABASE_VERSION,
      metaStoreName: PROMPT_METAS_STORE,
      records,
      revisionStorageKey: PROMPT_REVISION_STORAGE_KEY,
    });
  }

  return {
    context: launchedContext,
    setPromptRecords,
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
          'Failed to close production extension context and remove test directories.',
        );
      }
    },
  };
}

async function openProductionLiveSite(
  adapter: LiveSiteAdapter,
  page: Page,
  testInfo: Parameters<typeof runLiveStep>[0],
): Promise<void> {
  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'open production live site',
    },
    async () => {
      await page.goto(adapter.startUrl, {
        waitUntil: 'domcontentloaded',
      });
    },
  );

  await runLiveStep(
    testInfo,
    {
      site: adapter.name,
      step: 'find production composer',
    },
    async () => {
      await getComposer(page, adapter.composerSelector);
    },
  );
}

async function runProductionInsertSmoke(adapter: LiveSiteAdapter): Promise<void> {
  const extension = await launchProductionExtension();
  const promptContent = `${adapter.name} production live insert prompt body`;

  try {
    await extension.setPromptRecords([
      createPromptRecord({
        id: `${adapter.name.toLowerCase()}-production-live-insert`,
        title: `${adapter.name} production live insert`,
        content: promptContent,
        normalOrder: 1,
      }),
    ]);

    const page = await extension.context.newPage();
    await openProductionLiveSite(adapter, page, test.info());

    await runLiveStep(
      test.info(),
      {
        site: adapter.name,
        step: 'insert prompt from production bundle',
      },
      async () => {
        const composer = await getComposer(page, adapter.composerSelector);
        await composer.click();
        await page.keyboard.type('/ ');
        await expect(
          page.locator('[data-testid="promptit-popup-host"]'),
        ).toHaveCount(1);
        await page.keyboard.press('Enter');

        await expect
          .poll(async () => await adapter.readComposerText(page))
          .toContain(promptContent);
        await expect(
          page.locator('[data-testid="promptit-popup-host"]'),
        ).toHaveCount(0);
        await expect
          .poll(async () => await adapter.readComposerText(page))
          .toContain(promptContent);
      },
    );
  } finally {
    await extension.close();
  }
}

for (const adapter of [chatgptLiveSite, geminiLiveSite]) {
  test(`${adapter.name} production bundle inserts a prompt from the live composer`, async () => {
    await runProductionInsertSmoke(adapter);
  });
}
