import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  OPEN_OPTIONS_PAGE_MESSAGE,
  UPDATE_PROMPT_MESSAGE,
  assertNever,
  buildOpenOptionsPageErrorResponse,
  buildOpenOptionsPageSuccessResponse,
  parsePromptitRuntimeRequest,
  type OpenOptionsPageResponse,
} from '../runtime/messages';
import { handlePromptMutationRequest } from './prompt-mutations';

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

    const responsePromise = (() => {
      switch (request.type) {
        case OPEN_OPTIONS_PAGE_MESSAGE:
          return openOptionsPage();
        case CREATE_PROMPT_MESSAGE:
        case UPDATE_PROMPT_MESSAGE:
        case DELETE_PROMPT_MESSAGE:
          return handlePromptMutationRequest(request);
      }

      return assertNever(request);
    })();

    void responsePromise.then(sendResponse);
    return true;
  });
}
