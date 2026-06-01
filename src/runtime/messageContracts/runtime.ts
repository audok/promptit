import {
  OPEN_OPTIONS_PAGE_MESSAGE,
  parseOpenOptionsPageRequest,
  parseOpenOptionsPageResponse,
  type OpenOptionsPageRequest,
  type OpenOptionsPageResponse,
} from './openOptions';
import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  GET_PROMPT_BODY_MESSAGE,
  GET_PROMPT_RECORD_MESSAGE,
  LIST_PROMPT_METAS_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  UPDATE_PROMPT_RECORD_MESSAGE,
  parsePromptRuntimeRequest,
  parsePromptRuntimeResponse,
  type PromptRequest,
  type PromptResponse,
} from './prompt';
import {
  EXPORT_BACKUP_MESSAGE,
  EXPORT_PROMPTS_MESSAGE,
  IMPORT_PROMPTS_MESSAGE,
  RESTORE_BACKUP_MESSAGE,
  parseDataPortabilityRuntimeRequest,
  parseDataPortabilityRuntimeResponse,
  type DataPortabilityRequest,
  type DataPortabilityResponse,
} from './dataPortability';
import { isObjectRecord } from './shared';

export type PromptitRuntimeRequest =
  | OpenOptionsPageRequest
  | PromptRequest
  | DataPortabilityRequest;

export type PromptitRuntimeResponse =
  | OpenOptionsPageResponse
  | PromptResponse
  | DataPortabilityResponse;

export type PromptitRuntimeMessage = PromptitRuntimeRequest;

export function parsePromptitRuntimeRequest(
  value: unknown,
): PromptitRuntimeRequest | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  switch (value.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      return parseOpenOptionsPageRequest(value);
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
      return parsePromptRuntimeRequest(value);
    case EXPORT_BACKUP_MESSAGE:
    case RESTORE_BACKUP_MESSAGE:
    case EXPORT_PROMPTS_MESSAGE:
    case IMPORT_PROMPTS_MESSAGE:
      return parseDataPortabilityRuntimeRequest(value);
    default:
      return null;
  }
}

export function parsePromptitRuntimeResponse(
  value: unknown,
): PromptitRuntimeResponse | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  switch (value.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      return parseOpenOptionsPageResponse(value);
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
      return parsePromptRuntimeResponse(value);
    case EXPORT_BACKUP_MESSAGE:
    case RESTORE_BACKUP_MESSAGE:
    case EXPORT_PROMPTS_MESSAGE:
    case IMPORT_PROMPTS_MESSAGE:
      return parseDataPortabilityRuntimeResponse(value);
    default:
      return null;
  }
}

export async function sendPromptitRuntimeRequest(
  sendMessage: (request: PromptitRuntimeRequest) => Promise<unknown>,
  request: PromptitRuntimeRequest,
): Promise<PromptitRuntimeResponse> {
  const response = await sendMessage(request);
  const parsedResponse = parsePromptitRuntimeResponse(response);

  if (parsedResponse) {
    return parsedResponse;
  }

  throw new Error('Received malformed promptit runtime response.');
}
