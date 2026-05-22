export const IS_TEST_MODE = import.meta.env.VITE_PROMPTIT_TEST_MODE === '1';

const TEST_READY_ATTRIBUTE = 'data-promptit-ready';
const TEST_OPEN_OPTIONS_EVENT = 'promptit:test-open-options-page';
const TEST_SET_CONTROLS_EVENT = 'promptit:test-set-controls';
const TEST_PROMPT_BODY_READ_PENDING_EVENT = 'promptit:test-prompt-body-read-pending';
const TEST_RELEASE_PROMPT_BODY_READ_EVENT = 'promptit:test-release-prompt-body-read';
const TEST_FAIL_OPEN_OPTIONS_STORAGE_KEY = 'promptit:test-fail-open-options';

type TestControlState = {
  deferPromptBodyRead: boolean;
  failClipboardWrite: boolean;
  failOpenOptions: boolean;
  failPromptBodyRead: boolean;
  failPromptRead: boolean;
  promptBodyReadRelease: (() => void) | null;
};

const testControlState: TestControlState = {
  deferPromptBodyRead: false,
  failClipboardWrite: false,
  failOpenOptions: false,
  failPromptBodyRead: false,
  failPromptRead: false,
  promptBodyReadRelease: null,
};

export function markTestReady(): void {
  if (!IS_TEST_MODE) {
    return;
  }

  document.documentElement.setAttribute(TEST_READY_ATTRIBUTE, 'true');
}

export function registerTestListeners(
  requestOpenOptionsPage: () => Promise<void>,
): void {
  if (!IS_TEST_MODE) {
    return;
  }

  document.addEventListener(TEST_OPEN_OPTIONS_EVENT, () => {
    void requestOpenOptionsPage();
  });

  document.addEventListener(TEST_SET_CONTROLS_EVENT, (event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const detail = event.detail;

    if (!detail || typeof detail !== 'object') {
      return;
    }

    if ('deferPromptBodyRead' in detail) {
      testControlState.deferPromptBodyRead = Boolean(detail.deferPromptBodyRead);

      if (!testControlState.deferPromptBodyRead) {
        releaseDeferredPromptBodyRead();
      }
    }

    if ('failClipboardWrite' in detail) {
      testControlState.failClipboardWrite = Boolean(detail.failClipboardWrite);
    }

    if ('failOpenOptions' in detail) {
      testControlState.failOpenOptions = Boolean(detail.failOpenOptions);
    }

    if ('failPromptBodyRead' in detail) {
      testControlState.failPromptBodyRead = Boolean(detail.failPromptBodyRead);
    }

    if ('failPromptRead' in detail) {
      testControlState.failPromptRead = Boolean(detail.failPromptRead);
    }
  });

  document.addEventListener(TEST_RELEASE_PROMPT_BODY_READ_EVENT, () => {
    testControlState.deferPromptBodyRead = false;
    releaseDeferredPromptBodyRead();
  });
}

export function shouldFailClipboardWriteForTest(): boolean {
  return IS_TEST_MODE && testControlState.failClipboardWrite;
}

export function shouldFailPromptBodyReadForTest(): boolean {
  return IS_TEST_MODE && testControlState.failPromptBodyRead;
}

export function shouldFailPromptReadForTest(): boolean {
  return IS_TEST_MODE && testControlState.failPromptRead;
}

export async function prepareOpenOptionsFailureForTest(): Promise<void> {
  if (!IS_TEST_MODE) {
    return;
  }

  await chrome.storage.local.set({
    [TEST_FAIL_OPEN_OPTIONS_STORAGE_KEY]: testControlState.failOpenOptions,
  });
}

export async function waitForDeferredPromptBodyRead(): Promise<void> {
  if (!IS_TEST_MODE || !testControlState.deferPromptBodyRead) {
    return;
  }

  await new Promise<void>((resolve) => {
    testControlState.promptBodyReadRelease = resolve;
    document.dispatchEvent(new CustomEvent(TEST_PROMPT_BODY_READ_PENDING_EVENT));
  });
}

function releaseDeferredPromptBodyRead(): void {
  const release = testControlState.promptBodyReadRelease;

  if (!release) {
    return;
  }

  testControlState.promptBodyReadRelease = null;
  release();
}
