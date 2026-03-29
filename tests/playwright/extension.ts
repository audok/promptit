import { chromium, type BrowserContext } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PromptItem } from '../../src/prompt/schema';
import type { PromptitRuntimeMessage } from '../../src/runtime/messages';

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

export type LoadedExtension = {
  context: BrowserContext;
  extensionId: string;
  optionsPageUrl: string;
  getPrompts: () => Promise<PromptItem[]>;
  setPrompts: (prompts: PromptItem[]) => Promise<void>;
  setRawPrompts: (rawValue: unknown) => Promise<void>;
  sendRuntimeMessage: (message: PromptitRuntimeMessage) => Promise<void>;
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

async function configureBrowserEnvironment(): Promise<void> {
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
}

export async function launchExtension(): Promise<LoadedExtension> {
  assertBuiltExtension();
  await configureBrowserEnvironment();

  const userDataDir = await mkdtemp(
    path.join(tempRootPath || os.tmpdir(), 'promptit-playwright-'),
  );
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: !isHeaded,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  async function getServiceWorker() {
    let [serviceWorker] = context.serviceWorkers();

    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }

    return serviceWorker;
  }

  const extensionId = new URL((await getServiceWorker()).url()).host;

  return {
    context,
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

      await serviceWorker.evaluate(async (nextMessage) => {
        await chrome.runtime.sendMessage(nextMessage);
      }, message);
    },
    async close() {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}
