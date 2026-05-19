import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  GET_PROMPT_BODY_MESSAGE,
  LIST_PROMPT_METAS_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  OPEN_OPTIONS_PAGE_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  assertNever,
  buildOpenOptionsPageErrorResponse,
  buildOpenOptionsPageSuccessResponse,
  buildPromptErrorResponse,
  parsePromptitRuntimeRequest,
  type OpenOptionsPageResponse,
  type PromptitRuntimeRequest,
  type PromptitRuntimeResponse,
} from '../runtime/messages';
import { handlePromptRequest } from './prompt-mutations';

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
        case LIST_PROMPT_METAS_MESSAGE:
        case GET_PROMPT_BODY_MESSAGE:
        case CREATE_PROMPT_MESSAGE:
        case UPDATE_PROMPT_META_MESSAGE:
        case UPDATE_PROMPT_BODY_MESSAGE:
        case DELETE_PROMPT_MESSAGE:
        case MOVE_PROMPT_MESSAGE:
        case SET_PROMPT_PINNED_MESSAGE:
          return handlePromptRequest(request);
      }

      return assertNever(request);
    })();

    void responsePromise
      .then(sendResponse)
      .catch((error) => {
        console.error('[promptit] Runtime request failed in background.', error);
        sendResponse(buildRuntimeRequestErrorResponse(request, error));
      });
    return true;
  });
}

function buildRuntimeRequestErrorResponse(
  request: PromptitRuntimeRequest,
  error: unknown,
): PromptitRuntimeResponse {
  const message = getErrorMessage(error, 'Promptit runtime request failed.');

  switch (request.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      return buildOpenOptionsPageErrorResponse(message);
    case LIST_PROMPT_METAS_MESSAGE:
    case GET_PROMPT_BODY_MESSAGE:
    case CREATE_PROMPT_MESSAGE:
    case UPDATE_PROMPT_META_MESSAGE:
    case UPDATE_PROMPT_BODY_MESSAGE:
    case DELETE_PROMPT_MESSAGE:
    case MOVE_PROMPT_MESSAGE:
    case SET_PROMPT_PINNED_MESSAGE:
      return buildPromptErrorResponse(request.type, message);
  }

  return assertNever(request);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
