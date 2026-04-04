import {
  OPEN_OPTIONS_PAGE_MESSAGE,
  buildOpenOptionsPageErrorResponse,
  buildOpenOptionsPageSuccessResponse,
  parsePromptitRuntimeRequest,
  type OpenOptionsPageResponse,
  type PromptitRuntimeResponse,
  type PromptitRuntimeRequest,
} from '../runtime/messages';

let backgroundHandlersRegistered = false;
const IS_TEST_MODE = import.meta.env.VITE_PROMPTIT_TEST_MODE === '1';
const TEST_FAIL_OPEN_OPTIONS_STORAGE_KEY = 'promptit:test-fail-open-options';

async function openOptionsPage(): Promise<OpenOptionsPageResponse> {
  if (await shouldFailOpenOptionsPageForTest()) {
    return buildOpenOptionsPageErrorResponse('mock open options failure');
  }

  try {
    await chrome.runtime.openOptionsPage();
    return buildOpenOptionsPageSuccessResponse();
  } catch (error) {
    return buildOpenOptionsPageErrorResponse(
        error instanceof Error
          ? error.message
          : 'Failed to open options page.',
    );
  }
}

async function shouldFailOpenOptionsPageForTest(): Promise<boolean> {
  if (!IS_TEST_MODE) {
    return false;
  }

  const result = await chrome.storage.local.get(TEST_FAIL_OPEN_OPTIONS_STORAGE_KEY);
  return result[TEST_FAIL_OPEN_OPTIONS_STORAGE_KEY] === true;
}

async function handleRuntimeRequest(
  request: PromptitRuntimeRequest,
): Promise<PromptitRuntimeResponse> {
  switch (request.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      return openOptionsPage();
  }
}

export function registerBackgroundHandlers(): void {
  if (backgroundHandlersRegistered) {
    return;
  }

  backgroundHandlersRegistered = true;

  chrome.action.onClicked.addListener(() => {
    void openOptionsPage();
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const request = parsePromptitRuntimeRequest(message);

    if (!request) {
      return undefined;
    }

    void handleRuntimeRequest(request).then(sendResponse);
    return true;
  });
}
