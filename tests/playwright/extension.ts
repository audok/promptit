import { chromium, type BrowserContext } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PromptItem } from '../../src/prompt/schema';
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
  getPrompts: () => Promise<PromptItem[]>;
  setPrompts: (prompts: PromptItem[]) => Promise<void>;
  setRawPrompts: (rawValue: unknown) => Promise<void>;
  sendRuntimeMessage: (
    message: PromptitRuntimeRequest,
  ) => Promise<PromptitRuntimeResponse>;
  close: () => Promise<void>;
};

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

  return {
    context: launchedContext,
    extensionId,
    optionsPageUrl: `chrome-extension://${extensionId}/src/options/index.html`,
    async getPrompts() {
      const serviceWorker = await getServiceWorker();

      return await serviceWorker.evaluate(async () => {
        const result = await chrome.storage.local.get('prompts');
        return (result.prompts ?? []) as PromptItem[];
      });
    },
    async setPrompts(prompts) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async (nextPrompts) => {
        await chrome.storage.local.set({ prompts: nextPrompts });
      }, prompts);
    },
    async setRawPrompts(rawValue) {
      const serviceWorker = await getServiceWorker();

      await serviceWorker.evaluate(async (nextRawValue) => {
        await chrome.storage.local.set({ prompts: nextRawValue });
      }, rawValue);
    },
    async sendRuntimeMessage(message) {
      const serviceWorker = await getServiceWorker();

      return sendPromptitRuntimeRequest(
        async (nextMessage) =>
          await serviceWorker.evaluate(
            async (request) => await chrome.runtime.sendMessage(request),
            nextMessage,
          ),
        message,
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
