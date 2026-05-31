import { expect, type Page } from '@playwright/test';

import {
  CONTENTEDITABLE_FIXTURE_URL,
  TEXTAREA_FIXTURE_URL,
  createPromptRecord,
  getComposerText,
  openFixturePage,
  openPromptPopup,
  test,
  waitForPromptPopupToClose,
  type LoadedExtension,
} from '../playwright/chatgptSlashPopup';
import { GEMINI_FIXTURE_URL } from '../playwright/promptit';

type CdpExecutionContext = {
  id: number;
  name?: string;
  origin: string;
};

async function expectSinglePromptInserted(
  extension: LoadedExtension,
  url: string,
  expectedText: string,
): Promise<void> {
  await extension.setPromptRecords([
    createPromptRecord({
      id: `matrix-${expectedText.replace(/\W+/g, '-').toLowerCase()}`,
      title: 'Matrix prompt',
      content: expectedText,
      normalOrder: 1,
    }),
  ]);

  const page = await extension.context.newPage();
  await openFixturePage(page, url);
  await openPromptPopup(page);
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe(expectedText);
}

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
    .poll(() =>
      contexts.some((context) => {
        return (
          context.origin === `chrome-extension://${extension.extensionId}` ||
          context.name?.includes(extension.extensionId) === true
        );
      }),
    )
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

async function importPromptitContentScriptAgain(
  extension: LoadedExtension,
  page: Page,
): Promise<void> {
  await evaluateInPromptitContentScriptContext<void>(
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

        await import(
          chrome.runtime.getURL(contentScriptResource) +
            '?promptit-matrix-reinjection=' +
            Date.now()
        );
      }
    )()`,
  );
}

test('ChatGPT fixture supports textarea id selector', async ({ extension }) => {
  await expectSinglePromptInserted(
    extension,
    `${TEXTAREA_FIXTURE_URL}?variant=id-selector`,
    'Textarea id selector body',
  );
});

test('ChatGPT fixture supports textarea data-testid selector', async ({
  extension,
}) => {
  await expectSinglePromptInserted(
    extension,
    `${TEXTAREA_FIXTURE_URL}?variant=testid-selector`,
    'Textarea test id selector body',
  );
});

test('ChatGPT fixture supports contenteditable role selector without ProseMirror', async ({
  extension,
}) => {
  await expectSinglePromptInserted(
    extension,
    `${CONTENTEDITABLE_FIXTURE_URL}?variant=role-selector`,
    'Role selector body',
  );
});

test('ChatGPT fixture supports Lexical data-testid selector', async ({
  extension,
}) => {
  await expectSinglePromptInserted(
    extension,
    `${CONTENTEDITABLE_FIXTURE_URL}?variant=lexical-testid`,
    'Lexical selector body',
  );
});

test('Gemini fixture supports rich-textarea ql-editor selector', async ({
  extension,
}) => {
  await expectSinglePromptInserted(
    extension,
    `${GEMINI_FIXTURE_URL}?variant=rich-textarea`,
    'Gemini rich textarea body',
  );
});

test('Gemini fixture supports standalone ql-editor textarea selector', async ({
  extension,
}) => {
  await expectSinglePromptInserted(
    extension,
    `${GEMINI_FIXTURE_URL}?variant=standalone-ql-editor`,
    'Gemini standalone ql editor body',
  );
});

test('content script handles a composer inserted after same-page navigation', async ({
  extension,
}) => {
  const prompt = createPromptRecord({
    id: 'same-page-inserted-composer',
    title: 'Same page prompt',
    content: 'Same page inserted body',
    normalOrder: 1,
  });

  await extension.setPromptRecords([prompt]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await page.evaluate(() => {
    window.history.pushState({}, '', '/chatgpt-contenteditable.html?thread=next');
    const form = document.querySelector('.composer-form');

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Composer form not found.');
    }

    form.innerHTML = `
      <section class="composer-shell">
        <div class="composer-surface">
          <div
            id="prompt-textarea"
            contenteditable="true"
            role="textbox"
            aria-label="Chat with ChatGPT"
            aria-multiline="true"
            spellcheck="false"
          ></div>
        </div>
      </section>
      <button class="send-button" type="submit" disabled>Send</button>
    `;
  });

  await openPromptPopup(page);
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe(prompt.content);
});

test('content script does not duplicate popup handling after composer replacement and reinjection', async ({
  extension,
}) => {
  const prompt = createPromptRecord({
    id: 'same-page-reinjected-composer',
    title: 'Reinjected prompt',
    content: 'Reinjected body',
    normalOrder: 1,
  });

  await extension.setPromptRecords([prompt]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await importPromptitContentScriptAgain(extension, page);
  await page.evaluate(() => {
    const form = document.querySelector('.composer-form');

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Composer form not found.');
    }

    form.innerHTML = `
      <section class="composer-shell">
        <div class="composer-surface">
          <div
            id="prompt-textarea"
            class="ProseMirror"
            contenteditable="true"
            data-testid="prompt-textarea"
            role="textbox"
            aria-label="Chat with ChatGPT"
            aria-multiline="true"
            spellcheck="false"
          ></div>
        </div>
      </section>
      <button class="send-button" type="submit" disabled>Send</button>
    `;
  });

  await openPromptPopup(page);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return document.querySelectorAll('[data-testid="promptit-popup-host"]')
          .length;
      });
    })
    .toBe(1);

  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe(prompt.content);
  await expect(
    await page.evaluate(() => {
      return document.querySelectorAll('[data-testid="promptit-popup-host"]')
        .length;
    }),
  ).toBe(0);
});
