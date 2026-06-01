import type {
  PromptBody,
  PromptDraft,
  PromptMeta,
  PromptMetaDraft,
  PromptRecord,
} from '../../../prompt/schema';
import type { RuntimeMessageDescriptor } from '../../../shared/i18n';
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
} from './constants';
import type {
  CreatePromptRequest,
  CreatePromptSuccessResponse,
  DeletePromptRequest,
  DeletePromptSuccessResponse,
  ExistingPromptMessageType,
  GetPromptBodyRequest,
  GetPromptBodySuccessResponse,
  GetPromptRecordRequest,
  GetPromptRecordSuccessResponse,
  ListPromptMetasRequest,
  ListPromptMetasSuccessResponse,
  MovePromptRequest,
  PromptConflictMessageType,
  PromptConflictResponse,
  PromptErrorCode,
  PromptErrorResponse,
  PromptMessageType,
  PromptMetaConflictMessageType,
  PromptMetaConflictResponse,
  PromptMetaSuccessResponse,
  PromptNotFoundResponse,
  PromptRecordConflictMessageType,
  PromptRecordConflictResponse,
  SetPromptPinnedRequest,
  UpdatePromptBodyRequest,
  UpdatePromptBodySuccessResponse,
  UpdatePromptMetaRequest,
  UpdatePromptRecordRequest,
  UpdatePromptRecordSuccessResponse,
} from './types';

export function buildListPromptMetasRequest(): ListPromptMetasRequest {
  return {
    type: LIST_PROMPT_METAS_MESSAGE,
  };
}

export function buildGetPromptBodyRequest(id: string): GetPromptBodyRequest {
  return {
    type: GET_PROMPT_BODY_MESSAGE,
    id,
  };
}

export function buildGetPromptRecordRequest(id: string): GetPromptRecordRequest {
  return {
    type: GET_PROMPT_RECORD_MESSAGE,
    id,
  };
}

export function buildCreatePromptRequest(
  draft: PromptDraft,
): CreatePromptRequest {
  return {
    type: CREATE_PROMPT_MESSAGE,
    draft,
  };
}

export function buildUpdatePromptMetaRequest(
  id: string,
  draft: PromptMetaDraft,
  expectedUpdatedAt: string,
): UpdatePromptMetaRequest {
  return {
    type: UPDATE_PROMPT_META_MESSAGE,
    id,
    draft,
    expectedUpdatedAt,
  };
}

export function buildUpdatePromptBodyRequest(
  id: string,
  content: string,
  expectedUpdatedAt: string,
  expectedBodyUpdatedAt: string,
): UpdatePromptBodyRequest {
  return {
    type: UPDATE_PROMPT_BODY_MESSAGE,
    id,
    content,
    expectedUpdatedAt,
    expectedBodyUpdatedAt,
  };
}

export function buildUpdatePromptRecordRequest(
  id: string,
  draft: PromptDraft,
  expectedUpdatedAt: string,
  expectedBodyUpdatedAt: string,
): UpdatePromptRecordRequest {
  return {
    type: UPDATE_PROMPT_RECORD_MESSAGE,
    id,
    draft,
    expectedUpdatedAt,
    expectedBodyUpdatedAt,
  };
}

export function buildDeletePromptRequest(
  id: string,
  expectedUpdatedAt: string,
  expectedBodyUpdatedAt?: string,
): DeletePromptRequest {
  return {
    type: DELETE_PROMPT_MESSAGE,
    id,
    expectedUpdatedAt,
    expectedBodyUpdatedAt,
  };
}

export function buildMovePromptRequest(
  id: string,
  request: Omit<MovePromptRequest, 'type' | 'id'>,
): MovePromptRequest {
  return {
    type: MOVE_PROMPT_MESSAGE,
    id,
    ...request,
  };
}

export function buildSetPromptPinnedRequest(
  id: string,
  pinned: boolean,
  expectedUpdatedAt: string,
): SetPromptPinnedRequest {
  return {
    type: SET_PROMPT_PINNED_MESSAGE,
    id,
    pinned,
    expectedUpdatedAt,
  };
}

export function buildListPromptMetasSuccessResponse(
  metas: PromptMeta[],
): ListPromptMetasSuccessResponse {
  return {
    type: LIST_PROMPT_METAS_MESSAGE,
    ok: true,
    status: 'success',
    metas,
  };
}

export function buildGetPromptBodySuccessResponse(
  body: PromptBody,
): GetPromptBodySuccessResponse {
  return {
    type: GET_PROMPT_BODY_MESSAGE,
    ok: true,
    status: 'success',
    body,
  };
}

export function buildGetPromptRecordSuccessResponse(
  prompt: PromptRecord,
): GetPromptRecordSuccessResponse {
  return {
    type: GET_PROMPT_RECORD_MESSAGE,
    ok: true,
    status: 'success',
    prompt,
  };
}

export function buildCreatePromptSuccessResponse(
  prompt: PromptRecord,
): CreatePromptSuccessResponse {
  return {
    type: CREATE_PROMPT_MESSAGE,
    ok: true,
    status: 'success',
    prompt,
  };
}

export function buildPromptMetaSuccessResponse<
  T extends
    | typeof UPDATE_PROMPT_META_MESSAGE
    | typeof MOVE_PROMPT_MESSAGE
    | typeof SET_PROMPT_PINNED_MESSAGE,
>(type: T, meta: PromptMeta): PromptMetaSuccessResponse<T> {
  return {
    type,
    ok: true,
    status: 'success',
    meta,
  };
}

export function buildUpdatePromptBodySuccessResponse(
  prompt: PromptRecord,
): UpdatePromptBodySuccessResponse {
  return {
    type: UPDATE_PROMPT_BODY_MESSAGE,
    ok: true,
    status: 'success',
    prompt,
  };
}

export function buildUpdatePromptRecordSuccessResponse(
  prompt: PromptRecord,
): UpdatePromptRecordSuccessResponse {
  return {
    type: UPDATE_PROMPT_RECORD_MESSAGE,
    ok: true,
    status: 'success',
    prompt,
  };
}

export function buildDeletePromptSuccessResponse(
  id: string,
): DeletePromptSuccessResponse {
  return {
    type: DELETE_PROMPT_MESSAGE,
    ok: true,
    status: 'success',
    id,
  };
}

export function buildPromptNotFoundResponse<T extends ExistingPromptMessageType>(
  type: T,
  id: string,
  message: string,
  messageDescriptor?: RuntimeMessageDescriptor,
): PromptNotFoundResponse<T> {
  return {
    type,
    ok: false,
    status: 'not-found',
    id,
    message,
    messageDescriptor,
  };
}

export function buildPromptMetaConflictResponse<
  T extends PromptMetaConflictMessageType,
>(
  type: T,
  id: string,
  currentMeta: PromptMeta,
  message: string,
  messageDescriptor?: RuntimeMessageDescriptor,
): PromptMetaConflictResponse<T> {
  return {
    type,
    ok: false,
    status: 'conflict',
    id,
    message,
    messageDescriptor,
    currentMeta,
  };
}

export function buildPromptRecordConflictResponse<
  T extends PromptRecordConflictMessageType,
>(
  type: T,
  id: string,
  currentMeta: PromptMeta,
  message: string,
  currentRecord?: PromptRecord,
  messageDescriptor?: RuntimeMessageDescriptor,
): PromptRecordConflictResponse<T> {
  const response: PromptRecordConflictResponse<T> = {
    type,
    ok: false,
    status: 'conflict',
    id,
    message,
    messageDescriptor,
    currentMeta,
  };

  if (typeof currentRecord !== 'undefined') {
    response.currentRecord = currentRecord;
  }

  return response;
}

export function buildPromptConflictResponse<T extends PromptMetaConflictMessageType>(
  type: T,
  id: string,
  currentMeta: PromptMeta,
  message: string,
  messageDescriptor?: RuntimeMessageDescriptor,
): PromptMetaConflictResponse<T>;
export function buildPromptConflictResponse<T extends PromptMetaConflictMessageType>(
  type: T,
  id: string,
  currentMeta: PromptMeta,
  message: string,
  currentRecord: undefined,
  messageDescriptor?: RuntimeMessageDescriptor,
): PromptMetaConflictResponse<T>;
export function buildPromptConflictResponse<T extends PromptRecordConflictMessageType>(
  type: T,
  id: string,
  currentMeta: PromptMeta,
  message: string,
  currentRecord?: PromptRecord,
  messageDescriptor?: RuntimeMessageDescriptor,
): PromptRecordConflictResponse<T>;
export function buildPromptConflictResponse(
  type: PromptConflictMessageType,
  id: string,
  currentMeta: PromptMeta,
  message: string,
  currentRecordOrDescriptor?: PromptRecord | RuntimeMessageDescriptor,
  messageDescriptor?: RuntimeMessageDescriptor,
): PromptConflictResponse<PromptConflictMessageType> {
  const descriptor =
    messageDescriptor ??
    (isRuntimeMessageDescriptorValue(currentRecordOrDescriptor)
      ? currentRecordOrDescriptor
      : undefined);

  if (isPromptMetaConflictMessageType(type)) {
    return buildPromptMetaConflictResponse(
      type,
      id,
      currentMeta,
      message,
      descriptor,
    );
  }

  const currentRecord = isRuntimeMessageDescriptorValue(currentRecordOrDescriptor)
    ? undefined
    : currentRecordOrDescriptor;

  return buildPromptRecordConflictResponse(
    type,
    id,
    currentMeta,
    message,
    currentRecord,
    descriptor,
  );
}

export function buildPromptErrorResponse<T extends PromptMessageType>(
  type: T,
  message: string,
  code: PromptErrorCode = 'storage-failed',
  messageDescriptor?: RuntimeMessageDescriptor,
): PromptErrorResponse<T> {
  return {
    type,
    ok: false,
    status: 'error',
    code,
    message,
    messageDescriptor,
  };
}

function isPromptMetaConflictMessageType(
  type: PromptConflictMessageType,
): type is PromptMetaConflictMessageType {
  return (
    type === UPDATE_PROMPT_META_MESSAGE ||
    type === DELETE_PROMPT_MESSAGE ||
    type === MOVE_PROMPT_MESSAGE ||
    type === SET_PROMPT_PINNED_MESSAGE
  );
}

function isRuntimeMessageDescriptorValue(
  value: PromptRecord | RuntimeMessageDescriptor | undefined,
): value is RuntimeMessageDescriptor {
  return typeof value === 'object' && value !== null && 'key' in value;
}
