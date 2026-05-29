import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  EXPORT_BACKUP_MESSAGE,
  EXPORT_PROMPTS_MESSAGE,
  GET_PROMPT_BODY_MESSAGE,
  GET_PROMPT_RECORD_MESSAGE,
  IMPORT_PROMPTS_MESSAGE,
  LIST_PROMPT_METAS_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  OPEN_OPTIONS_PAGE_MESSAGE,
  RESTORE_BACKUP_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  UPDATE_PROMPT_RECORD_MESSAGE,
  assertNever,
  buildOpenOptionsPageErrorResponse,
  buildOpenOptionsPageSuccessResponse,
  buildDataPortabilityErrorResponse,
  buildPromptErrorResponse,
  parsePromptitRuntimeRequest,
  type OpenOptionsPageResponse,
  type PromptitRuntimeRequest,
  type PromptitRuntimeResponse,
} from '../runtime/messages';
import type { RuntimeMessageDescriptor } from '../shared/i18n';
import { handleDataPortabilityRequest } from './data-portability';
import { handlePromptRequest } from './prompt-mutations';

let backgroundHandlersRegistered = false;
const IS_TEST_MODE = import.meta.env.VITE_PROMPTIT_TEST_MODE === '1';
const TEST_FAIL_OPEN_OPTIONS_STORAGE_KEY = 'promptit:test-fail-open-options';
const OPEN_OPTIONS_FAILED_MESSAGE = '설정 페이지를 열지 못했습니다.';
const OPEN_OPTIONS_FAILED_DESCRIPTOR = {
  key: 'runtime.openOptions.failed',
} satisfies RuntimeMessageDescriptor;
const RUNTIME_REQUEST_FAILED_MESSAGE =
  'promptit 요청 처리 중 오류가 발생했습니다.';
const RUNTIME_REQUEST_FAILED_DESCRIPTOR = {
  key: 'runtime.request.failed',
} satisfies RuntimeMessageDescriptor;

async function openOptionsPage(): Promise<OpenOptionsPageResponse> {
  if (await shouldFailOpenOptionsPageForTest()) {
    return buildOpenOptionsPageErrorResponse(
      OPEN_OPTIONS_FAILED_MESSAGE,
      'open-options-failed',
      OPEN_OPTIONS_FAILED_DESCRIPTOR,
    );
  }

  try {
    await chrome.runtime.openOptionsPage();
    return buildOpenOptionsPageSuccessResponse();
  } catch (error) {
    return buildOpenOptionsPageErrorResponse(
      error instanceof Error
        ? error.message
        : OPEN_OPTIONS_FAILED_MESSAGE,
      'open-options-failed',
      OPEN_OPTIONS_FAILED_DESCRIPTOR,
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
        case GET_PROMPT_RECORD_MESSAGE:
        case CREATE_PROMPT_MESSAGE:
        case UPDATE_PROMPT_META_MESSAGE:
        case UPDATE_PROMPT_BODY_MESSAGE:
        case UPDATE_PROMPT_RECORD_MESSAGE:
        case DELETE_PROMPT_MESSAGE:
        case MOVE_PROMPT_MESSAGE:
        case SET_PROMPT_PINNED_MESSAGE:
          return handlePromptRequest(request);
        case EXPORT_BACKUP_MESSAGE:
        case RESTORE_BACKUP_MESSAGE:
        case EXPORT_PROMPTS_MESSAGE:
        case IMPORT_PROMPTS_MESSAGE:
          return handleDataPortabilityRequest(request);
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
  const message = getErrorMessage(error, RUNTIME_REQUEST_FAILED_MESSAGE);

  switch (request.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      return buildOpenOptionsPageErrorResponse(
        message,
        'open-options-failed',
        OPEN_OPTIONS_FAILED_DESCRIPTOR,
      );
    case LIST_PROMPT_METAS_MESSAGE:
    case GET_PROMPT_BODY_MESSAGE:
    case GET_PROMPT_RECORD_MESSAGE:
    case CREATE_PROMPT_MESSAGE:
    case UPDATE_PROMPT_META_MESSAGE:
    case UPDATE_PROMPT_BODY_MESSAGE:
    case UPDATE_PROMPT_RECORD_MESSAGE:
    case DELETE_PROMPT_MESSAGE:
    case MOVE_PROMPT_MESSAGE:
    case SET_PROMPT_PINNED_MESSAGE:
      return buildPromptErrorResponse(
        request.type,
        message,
        'storage-failed',
        RUNTIME_REQUEST_FAILED_DESCRIPTOR,
      );
    case EXPORT_BACKUP_MESSAGE:
    case RESTORE_BACKUP_MESSAGE:
    case EXPORT_PROMPTS_MESSAGE:
    case IMPORT_PROMPTS_MESSAGE:
      return buildDataPortabilityErrorResponse(
        request.type,
        message,
        'data-portability-failed',
        RUNTIME_REQUEST_FAILED_DESCRIPTOR,
      );
  }

  return assertNever(request);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
