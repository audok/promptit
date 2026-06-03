import { expect, test as base, type Page } from '@playwright/test';

import {
  launchExtension,
  type LoadedExtension,
} from '../playwright/extension';
import {
  CONTENTEDITABLE_FIXTURE_URL,
  EDITOR_FIXTURE_URL,
  openFixturePage,
} from '../playwright/promptit';

async function getServiceWorker(extension: LoadedExtension) {
  const [serviceWorker] = extension.context.serviceWorkers();

  if (serviceWorker) {
    return serviceWorker;
  }

  return await extension.context.waitForEvent('serviceworker');
}

type CdpExecutionContext = {
  id: number;
  name?: string;
  origin: string;
};

const test = base.extend<{
  extension: LoadedExtension;
}>({
  extension: async ({}, use) => {
    const extension = await launchExtension();
    await extension.setLanguagePreference('ko');
    await use(extension);
    await extension.close();
  },
});

const SUPPORTED_PRODUCTION_MATCHES = [
  'https://chatgpt.com/*',
  'https://gemini.google.com/*',
];
const TEST_ONLY_MATCHES = ['http://127.0.0.1:*/*', 'http://localhost:*/*'];
const EXPECTED_TEST_MANIFEST_MATCHES = [
  ...SUPPORTED_PRODUCTION_MATCHES,
  ...TEST_ONLY_MATCHES,
];

async function evaluateInPromptitContentScriptContext<T>(
  extension: LoadedExtension,
  page: Page,
  expression: string,
): Promise<T> {
  const cdpSession = await extension.context.newCDPSession(page);
  const contexts: CdpExecutionContext[] = [];

  cdpSession.on(
    'Runtime.executionContextCreated',
    (event: { context: CdpExecutionContext }) => {
      contexts.push(event.context);
    },
  );

  await cdpSession.send('Runtime.enable');
  await expect
    .poll(() => {
      return contexts.some((context) => {
        return (
          context.origin === `chrome-extension://${extension.extensionId}` ||
          context.name?.includes(extension.extensionId) === true
        );
      });
    })
    .toBe(true);

  const context = contexts.find((nextContext) => {
    return (
      nextContext.origin === `chrome-extension://${extension.extensionId}` ||
      nextContext.name?.includes(extension.extensionId) === true
    );
  });

  if (!context) {
    await cdpSession.detach();
    throw new Error('promptit content script execution context not found.');
  }

  const result = await cdpSession.send('Runtime.evaluate', {
    awaitPromise: true,
    contextId: context.id,
    expression,
    returnByValue: true,
  });
  await cdpSession.detach();

  if (result.exceptionDetails) {
    throw new Error('promptit content script evaluation failed.');
  }

  return result.result.value as T;
}

test('manifest keeps supported-site injection policy without host permissions', async ({
  extension,
}) => {
  const serviceWorker = await getServiceWorker(extension);
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());

  expect(manifest.permissions).toEqual(['storage']);
  expect(manifest.host_permissions ?? []).toEqual([]);
  const contentScriptMatches =
    manifest.content_scripts?.flatMap((script) => script.matches ?? []) ?? [];

  expect(contentScriptMatches).toEqual(EXPECTED_TEST_MANIFEST_MATCHES);

  const webAccessibleResourceEntries = (
    manifest.web_accessible_resources ?? []
  ).filter(
    (entry): entry is Exclude<typeof entry, string> => typeof entry !== 'string',
  );
  const webAccessibleMatches = Array.from(
    new Set(
      webAccessibleResourceEntries.flatMap(
        (entry) => entry.matches ?? [],
      ),
    ),
  );

  expect(webAccessibleMatches).toEqual(
    expect.arrayContaining(EXPECTED_TEST_MANIFEST_MATCHES),
  );
  expect(webAccessibleMatches).toHaveLength(
    EXPECTED_TEST_MANIFEST_MATCHES.length,
  );
  expect(
    webAccessibleResourceEntries.flatMap(
      (entry) => entry.resources ?? [],
    ),
  ).toContain('fonts/PretendardVariable.woff2');
  expect((manifest as { default_locale?: unknown }).default_locale).toBe('ko');
  expect(manifest.name).toBe('promptit');
  expect(manifest.action?.default_title).toBe('promptit');
  expect(manifest.description).toEqual(expect.any(String));
  expect(manifest.description).not.toBe('');

  const rawManifest = await serviceWorker.evaluate(async () => {
    const response = await fetch(chrome.runtime.getURL('manifest.json'));
    return await response.json() as {
      action?: { default_title?: unknown };
      description?: unknown;
      name?: unknown;
    };
  });

  expect(rawManifest.name).toBe('__MSG_appName__');
  expect(rawManifest.description).toBe('__MSG_extensionDescription__');
  expect(rawManifest.action?.default_title).toBe('__MSG_appName__');

  const localeMessages = await serviceWorker.evaluate(async () => {
    const localeCodes = ['ko', 'en'] as const;
    const entries = await Promise.all(
      localeCodes.map(async (locale) => {
        const response = await fetch(
          chrome.runtime.getURL(`_locales/${locale}/messages.json`),
        );

        return [locale, await response.json()] as const;
      }),
    );

    return Object.fromEntries(entries) as Record<
      (typeof localeCodes)[number],
      Record<string, { message?: unknown }>
    >;
  });

  expect(Object.keys(localeMessages.ko).sort()).toEqual(
    Object.keys(localeMessages.en).sort(),
  );
  expect(localeMessages.ko.appName?.message).toBe('promptit');
  expect(localeMessages.en.appName?.message).toBe('promptit');
  expect(localeMessages.ko.extensionDescription?.message).toEqual(
    expect.any(String),
  );
  expect(localeMessages.en.extensionDescription?.message).toEqual(
    expect.any(String),
  );
  expect(localeMessages.ko.extensionDescription?.message).not.toBe('');
  expect(localeMessages.en.extensionDescription?.message).not.toBe('');
});

test('opens the options page when the content script sends the runtime message', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  const optionsPagePromise = extension.context.waitForEvent('page');

  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('promptit:test-open-options-page'),
    );
  });

  const optionsPage = await optionsPagePromise;
  await optionsPage.waitForLoadState('domcontentloaded');

  await expect(optionsPage).toHaveTitle(/promptit Settings/i);
  await expect(optionsPage.getByText('promptit')).toBeVisible();
  await expect(
    optionsPage.getByRole('heading', { name: '프롬프트를 저장하고 붙여 넣으세요.' }),
  ).toBeVisible();
  await expect(
    optionsPage.getByText(/ChatGPT, Gemini/),
  ).toBeVisible();
  await expect(optionsPage.getByLabel('/ space')).toBeVisible();
  await expect(optionsPage.locator('kbd').filter({ hasText: '/' })).toBeVisible();
  await expect(optionsPage.locator('kbd').filter({ hasText: 'Space' })).toBeVisible();
});

test('ignores malformed runtime messages without opening the options page', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  const pageCountBefore = extension.context.pages().length;

  const optionsPagePromise = extension.context.waitForEvent('page', {
    timeout: 500,
  });
  const serviceWorker = await getServiceWorker(extension);

  await serviceWorker.evaluate(async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'promptit/malformed-runtime-message',
        payload: { invalid: true },
      });
    } catch {
      // Malformed messages are intentionally ignored by the background listener.
    }
  });

  await expect(optionsPagePromise).rejects.toThrow(/Timeout/);
  await expect(extension.context.pages()).toHaveLength(pageCountBefore);
  await expect(page.locator('[data-testid="promptit-popup"]')).toHaveCount(0);
});

test('does not initialize promptit on unsupported URLs', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await page.goto('about:blank');
  await page.waitForTimeout(150);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return {
          initialized:
            '__promptitContentInitialized__' in window &&
            Object.prototype.hasOwnProperty.call(
              window,
              '__promptitContentInitialized__',
            ),
          readyAttribute:
            document.documentElement.getAttribute('data-promptit-ready'),
        };
      });
    })
    .toEqual({
      initialized: false,
      readyAttribute: null,
    });
});

test('does not register duplicate content script listeners on same-page reinjection', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await expect(page.locator('#prompt-textarea')).toBeVisible();

  const duplicateInitResult =
    await evaluateInPromptitContentScriptContext<{
      afterReadyAttribute: string | null;
      beforeReadyAttribute: string | null;
      initialized: boolean;
      popupHosts: number;
    }>(
      extension,
      page,
      `(
        async () => {
          const manifest = chrome.runtime.getManifest();
          const resources = (manifest.web_accessible_resources ?? [])
            .flatMap((entry) => entry.resources ?? []);
          const contentScriptResource = resources.find((resource) => {
            return (
              resource.startsWith('assets/content-script.ts-') &&
              resource.endsWith('.js')
            );
          });

          if (!contentScriptResource) {
            throw new Error('promptit content script resource not found.');
          }

          const beforeReadyAttribute =
            document.documentElement.getAttribute('data-promptit-ready');
          document.documentElement.removeAttribute('data-promptit-ready');

          await import(
            chrome.runtime.getURL(contentScriptResource) +
              '?promptit-duplicate-guard=' +
              Date.now()
          );

          return {
            afterReadyAttribute:
              document.documentElement.getAttribute('data-promptit-ready'),
            beforeReadyAttribute,
            initialized: window.__promptitContentInitialized__ === true,
            popupHosts: document.querySelectorAll(
              '[data-testid="promptit-popup-host"]',
            ).length,
          };
        }
      )()`,
    );

  expect(duplicateInitResult).toEqual({
    afterReadyAttribute: null,
    beforeReadyAttribute: 'true',
    initialized: true,
    popupHosts: 0,
  });

  await page.locator('#prompt-textarea').click();
  await page.keyboard.type('/ ');
  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return {
          popupHosts: document.querySelectorAll(
            '[data-testid="promptit-popup-host"]',
          ).length,
        };
      });
    })
    .toEqual({
      popupHosts: 1,
    });
});

test('does not initialize promptit on unsupported localhost fixtures', async ({
  extension,
}) => {
  const page = await extension.context.newPage();
  await page.goto(EDITOR_FIXTURE_URL, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(150);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return {
          initialized:
            '__promptitContentInitialized__' in window &&
            Object.prototype.hasOwnProperty.call(
              window,
              '__promptitContentInitialized__',
            ),
          readyAttribute:
            document.documentElement.getAttribute('data-promptit-ready'),
        };
      });
    })
    .toEqual({
      initialized: false,
      readyAttribute: null,
    });
});
