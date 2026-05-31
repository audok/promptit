import {
  isValidPromptTimestamp,
  parsePromptBody,
  parsePromptDraft,
  parsePromptMeta,
  parsePromptRecord,
  type PromptBody,
  type PromptDraft,
  type PromptMeta,
  type PromptMetaDraft,
  type PromptOrderGroup,
  type PromptRecord,
} from '../../prompt/schema';
import type { RuntimeMessageDescriptor } from '../../shared/i18n';
import { parseRuntimeMessageDescriptor, isObjectRecord } from './shared';

export const LIST_PROMPT_METAS_MESSAGE = 'promptit/list-prompt-metas';
export const GET_PROMPT_BODY_MESSAGE = 'promptit/get-prompt-body';
export const GET_PROMPT_RECORD_MESSAGE = 'promptit/get-prompt-record';
export const CREATE_PROMPT_MESSAGE = 'promptit/create-prompt';
export const UPDATE_PROMPT_META_MESSAGE = 'promptit/update-prompt-meta';
export const UPDATE_PROMPT_BODY_MESSAGE = 'promptit/update-prompt-body';
export const UPDATE_PROMPT_RECORD_MESSAGE = 'promptit/update-prompt-record';
export const DELETE_PROMPT_MESSAGE = 'promptit/delete-prompt';
export const MOVE_PROMPT_MESSAGE = 'promptit/move-prompt';
export const SET_PROMPT_PINNED_MESSAGE = 'promptit/set-prompt-pinned';

type PromptMessageType =
  | typeof LIST_PROMPT_METAS_MESSAGE
  | typeof GET_PROMPT_BODY_MESSAGE
  | typeof GET_PROMPT_RECORD_MESSAGE
  | typeof CREATE_PROMPT_MESSAGE
  | typeof UPDATE_PROMPT_META_MESSAGE
  | typeof UPDATE_PROMPT_BODY_MESSAGE
  | typeof UPDATE_PROMPT_RECORD_MESSAGE
  | typeof DELETE_PROMPT_MESSAGE
  | typeof MOVE_PROMPT_MESSAGE
  | typeof SET_PROMPT_PINNED_MESSAGE;

type ExistingPromptMessageType =
  | typeof GET_PROMPT_BODY_MESSAGE
  | typeof GET_PROMPT_RECORD_MESSAGE
  | typeof UPDATE_PROMPT_META_MESSAGE
  | typeof UPDATE_PROMPT_BODY_MESSAGE
  | typeof UPDATE_PROMPT_RECORD_MESSAGE
  | typeof DELETE_PROMPT_MESSAGE
  | typeof MOVE_PROMPT_MESSAGE
  | typeof SET_PROMPT_PINNED_MESSAGE;

type PromptConflictMessageType =
  | PromptMetaConflictMessageType
  | PromptRecordConflictMessageType;

type PromptMetaConflictMessageType =
  | typeof UPDATE_PROMPT_META_MESSAGE
  | typeof DELETE_PROMPT_MESSAGE
  | typeof MOVE_PROMPT_MESSAGE
  | typeof SET_PROMPT_PINNED_MESSAGE;

type PromptRecordConflictMessageType =
  | typeof UPDATE_PROMPT_BODY_MESSAGE
  | typeof UPDATE_PROMPT_RECORD_MESSAGE;

export type ListPromptMetasRequest = {
  type: typeof LIST_PROMPT_METAS_MESSAGE;
};

export type GetPromptBodyRequest = {
  type: typeof GET_PROMPT_BODY_MESSAGE;
  id: string;
};

export type GetPromptRecordRequest = {
  type: typeof GET_PROMPT_RECORD_MESSAGE;
  id: string;
};

export type CreatePromptRequest = {
  type: typeof CREATE_PROMPT_MESSAGE;
  draft: PromptDraft;
};

export type UpdatePromptMetaRequest = {
  type: typeof UPDATE_PROMPT_META_MESSAGE;
  id: string;
  draft: PromptMetaDraft;
  expectedUpdatedAt: string;
};

export type UpdatePromptBodyRequest = {
  type: typeof UPDATE_PROMPT_BODY_MESSAGE;
  id: string;
  content: string;
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt: string;
};

export type UpdatePromptRecordRequest = {
  type: typeof UPDATE_PROMPT_RECORD_MESSAGE;
  id: string;
  draft: PromptDraft;
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt: string;
};

export type DeletePromptRequest = {
  type: typeof DELETE_PROMPT_MESSAGE;
  id: string;
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt?: string;
};

export type MovePromptRequest = {
  type: typeof MOVE_PROMPT_MESSAGE;
  id: string;
  group?: PromptOrderGroup;
  previousId: string | null;
  nextId: string | null;
  expectedUpdatedAt: string;
};

export type SetPromptPinnedRequest = {
  type: typeof SET_PROMPT_PINNED_MESSAGE;
  id: string;
  pinned: boolean;
  expectedUpdatedAt: string;
};

export type PromptRequest =
  | ListPromptMetasRequest
  | GetPromptBodyRequest
  | GetPromptRecordRequest
  | CreatePromptRequest
  | UpdatePromptMetaRequest
  | UpdatePromptBodyRequest
  | UpdatePromptRecordRequest
  | DeletePromptRequest
  | MovePromptRequest
  | SetPromptPinnedRequest;

export type PromptMutationRequest =
  | CreatePromptRequest
  | UpdatePromptMetaRequest
  | UpdatePromptBodyRequest
  | UpdatePromptRecordRequest
  | DeletePromptRequest
  | MovePromptRequest
  | SetPromptPinnedRequest;

export type PromptErrorCode = 'storage-failed';

export type ListPromptMetasSuccessResponse = {
  type: typeof LIST_PROMPT_METAS_MESSAGE;
  ok: true;
  status: 'success';
  metas: PromptMeta[];
};

export type GetPromptBodySuccessResponse = {
  type: typeof GET_PROMPT_BODY_MESSAGE;
  ok: true;
  status: 'success';
  body: PromptBody;
};

export type GetPromptRecordSuccessResponse = {
  type: typeof GET_PROMPT_RECORD_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptRecord;
};

export type CreatePromptSuccessResponse = {
  type: typeof CREATE_PROMPT_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptRecord;
};

export type PromptMetaSuccessResponse<
  T extends
    | typeof UPDATE_PROMPT_META_MESSAGE
    | typeof MOVE_PROMPT_MESSAGE
    | typeof SET_PROMPT_PINNED_MESSAGE,
> = {
  type: T;
  ok: true;
  status: 'success';
  meta: PromptMeta;
};

export type UpdatePromptBodySuccessResponse = {
  type: typeof UPDATE_PROMPT_BODY_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptRecord;
};

export type UpdatePromptRecordSuccessResponse = {
  type: typeof UPDATE_PROMPT_RECORD_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptRecord;
};

export type DeletePromptSuccessResponse = {
  type: typeof DELETE_PROMPT_MESSAGE;
  ok: true;
  status: 'success';
  id: string;
};

type PromptNotFoundResponse<T extends ExistingPromptMessageType> = {
  type: T;
  ok: false;
  status: 'not-found';
  id: string;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
};

type PromptConflictBaseResponse<T extends PromptConflictMessageType> = {
  type: T;
  ok: false;
  status: 'conflict';
  id: string;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
  currentMeta: PromptMeta;
};

type PromptMetaConflictResponse<T extends PromptMetaConflictMessageType> =
  PromptConflictBaseResponse<T>;

type PromptRecordConflictResponse<T extends PromptRecordConflictMessageType> =
  PromptConflictBaseResponse<T> & {
    currentRecord?: PromptRecord;
  };

type PromptConflictResponse<T extends PromptConflictMessageType> =
  T extends PromptRecordConflictMessageType
    ? PromptRecordConflictResponse<T>
    : T extends PromptMetaConflictMessageType
      ? PromptMetaConflictResponse<T>
      : never;

type PromptErrorResponse<T extends PromptMessageType> = {
  type: T;
  ok: false;
  status: 'error';
  code: PromptErrorCode;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
};

export type ListPromptMetasResponse =
  | ListPromptMetasSuccessResponse
  | PromptErrorResponse<typeof LIST_PROMPT_METAS_MESSAGE>;

export type GetPromptBodyResponse =
  | GetPromptBodySuccessResponse
  | PromptNotFoundResponse<typeof GET_PROMPT_BODY_MESSAGE>
  | PromptErrorResponse<typeof GET_PROMPT_BODY_MESSAGE>;

export type GetPromptRecordResponse =
  | GetPromptRecordSuccessResponse
  | PromptNotFoundResponse<typeof GET_PROMPT_RECORD_MESSAGE>
  | PromptErrorResponse<typeof GET_PROMPT_RECORD_MESSAGE>;

export type CreatePromptResponse =
  | CreatePromptSuccessResponse
  | PromptErrorResponse<typeof CREATE_PROMPT_MESSAGE>;

export type UpdatePromptMetaResponse =
  | PromptMetaSuccessResponse<typeof UPDATE_PROMPT_META_MESSAGE>
  | PromptNotFoundResponse<typeof UPDATE_PROMPT_META_MESSAGE>
  | PromptConflictResponse<typeof UPDATE_PROMPT_META_MESSAGE>
  | PromptErrorResponse<typeof UPDATE_PROMPT_META_MESSAGE>;

export type UpdatePromptBodyResponse =
  | UpdatePromptBodySuccessResponse
  | PromptNotFoundResponse<typeof UPDATE_PROMPT_BODY_MESSAGE>
  | PromptConflictResponse<typeof UPDATE_PROMPT_BODY_MESSAGE>
  | PromptErrorResponse<typeof UPDATE_PROMPT_BODY_MESSAGE>;

export type UpdatePromptRecordResponse =
  | UpdatePromptRecordSuccessResponse
  | PromptNotFoundResponse<typeof UPDATE_PROMPT_RECORD_MESSAGE>
  | PromptConflictResponse<typeof UPDATE_PROMPT_RECORD_MESSAGE>
  | PromptErrorResponse<typeof UPDATE_PROMPT_RECORD_MESSAGE>;

export type DeletePromptResponse =
  | DeletePromptSuccessResponse
  | PromptNotFoundResponse<typeof DELETE_PROMPT_MESSAGE>
  | PromptConflictResponse<typeof DELETE_PROMPT_MESSAGE>
  | PromptErrorResponse<typeof DELETE_PROMPT_MESSAGE>;

export type MovePromptResponse =
  | PromptMetaSuccessResponse<typeof MOVE_PROMPT_MESSAGE>
  | PromptNotFoundResponse<typeof MOVE_PROMPT_MESSAGE>
  | PromptConflictResponse<typeof MOVE_PROMPT_MESSAGE>
  | PromptErrorResponse<typeof MOVE_PROMPT_MESSAGE>;

export type SetPromptPinnedResponse =
  | PromptMetaSuccessResponse<typeof SET_PROMPT_PINNED_MESSAGE>
  | PromptNotFoundResponse<typeof SET_PROMPT_PINNED_MESSAGE>
  | PromptConflictResponse<typeof SET_PROMPT_PINNED_MESSAGE>
  | PromptErrorResponse<typeof SET_PROMPT_PINNED_MESSAGE>;

export type PromptResponse =
  | ListPromptMetasResponse
  | GetPromptBodyResponse
  | GetPromptRecordResponse
  | CreatePromptResponse
  | UpdatePromptMetaResponse
  | UpdatePromptBodyResponse
  | UpdatePromptRecordResponse
  | DeletePromptResponse
  | MovePromptResponse
  | SetPromptPinnedResponse;

export type PromptMutationResponse =
  | CreatePromptResponse
  | UpdatePromptMetaResponse
  | UpdatePromptBodyResponse
  | UpdatePromptRecordResponse
  | DeletePromptResponse
  | MovePromptResponse
  | SetPromptPinnedResponse;

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

export function parsePromptRuntimeRequest(
  value: Record<string, unknown>,
): PromptRequest | null {
  switch (value.type) {
    case LIST_PROMPT_METAS_MESSAGE:
      return buildListPromptMetasRequest();
    case GET_PROMPT_BODY_MESSAGE:
      return parseGetPromptBodyRequest(value);
    case GET_PROMPT_RECORD_MESSAGE:
      return parseGetPromptRecordRequest(value);
    case CREATE_PROMPT_MESSAGE:
      return parseCreatePromptRequest(value);
    case UPDATE_PROMPT_META_MESSAGE:
      return parseUpdatePromptMetaRequest(value);
    case UPDATE_PROMPT_BODY_MESSAGE:
      return parseUpdatePromptBodyRequest(value);
    case UPDATE_PROMPT_RECORD_MESSAGE:
      return parseUpdatePromptRecordRequest(value);
    case DELETE_PROMPT_MESSAGE:
      return parseDeletePromptRequest(value);
    case MOVE_PROMPT_MESSAGE:
      return parseMovePromptRequest(value);
    case SET_PROMPT_PINNED_MESSAGE:
      return parseSetPromptPinnedRequest(value);
    default:
      return null;
  }
}

export function parsePromptRuntimeResponse(
  value: Record<string, unknown>,
): PromptResponse | null {
  switch (value.type) {
    case LIST_PROMPT_METAS_MESSAGE:
      return parseListPromptMetasResponse(value);
    case GET_PROMPT_BODY_MESSAGE:
      return parseGetPromptBodyResponse(value);
    case GET_PROMPT_RECORD_MESSAGE:
      return parseGetPromptRecordResponse(value);
    case CREATE_PROMPT_MESSAGE:
      return parseCreatePromptResponse(value);
    case UPDATE_PROMPT_META_MESSAGE:
      return parsePromptMetaResponse(value, UPDATE_PROMPT_META_MESSAGE);
    case UPDATE_PROMPT_BODY_MESSAGE:
      return parseUpdatePromptBodyResponse(value);
    case UPDATE_PROMPT_RECORD_MESSAGE:
      return parseUpdatePromptRecordResponse(value);
    case DELETE_PROMPT_MESSAGE:
      return parseDeletePromptResponse(value);
    case MOVE_PROMPT_MESSAGE:
      return parsePromptMetaResponse(value, MOVE_PROMPT_MESSAGE);
    case SET_PROMPT_PINNED_MESSAGE:
      return parsePromptMetaResponse(value, SET_PROMPT_PINNED_MESSAGE);
    default:
      return null;
  }
}

function parseGetPromptBodyRequest(
  value: Record<string, unknown>,
): GetPromptBodyRequest | null {
  const id = parsePromptId(value.id);
  return id ? buildGetPromptBodyRequest(id) : null;
}

function parseGetPromptRecordRequest(
  value: Record<string, unknown>,
): GetPromptRecordRequest | null {
  const id = parsePromptId(value.id);
  return id ? buildGetPromptRecordRequest(id) : null;
}

function parseCreatePromptRequest(
  value: Record<string, unknown>,
): CreatePromptRequest | null {
  const draft = parsePromptDraft(value.draft);
  return draft ? buildCreatePromptRequest(draft) : null;
}

function parseUpdatePromptMetaRequest(
  value: Record<string, unknown>,
): UpdatePromptMetaRequest | null {
  const id = parsePromptId(value.id);
  const draft = parsePromptMetaDraft(value.draft);
  const expectedUpdatedAt = parseRequiredTimestamp(value.expectedUpdatedAt);

  if (!id || !draft || !expectedUpdatedAt) {
    return null;
  }

  return buildUpdatePromptMetaRequest(id, draft, expectedUpdatedAt);
}

function parseUpdatePromptBodyRequest(
  value: Record<string, unknown>,
): UpdatePromptBodyRequest | null {
  const id = parsePromptId(value.id);
  const expectedUpdatedAt = parseRequiredTimestamp(value.expectedUpdatedAt);
  const expectedBodyUpdatedAt = parseRequiredTimestamp(
    value.expectedBodyUpdatedAt,
  );

  if (
    !id ||
    typeof value.content !== 'string' ||
    !expectedUpdatedAt ||
    !expectedBodyUpdatedAt
  ) {
    return null;
  }

  return buildUpdatePromptBodyRequest(
    id,
    value.content,
    expectedUpdatedAt,
    expectedBodyUpdatedAt,
  );
}

function parseUpdatePromptRecordRequest(
  value: Record<string, unknown>,
): UpdatePromptRecordRequest | null {
  const id = parsePromptId(value.id);
  const draft = parsePromptDraft(value.draft);
  const expectedUpdatedAt = parseRequiredTimestamp(value.expectedUpdatedAt);
  const expectedBodyUpdatedAt = parseRequiredTimestamp(
    value.expectedBodyUpdatedAt,
  );

  if (!id || !draft || !expectedUpdatedAt || !expectedBodyUpdatedAt) {
    return null;
  }

  return buildUpdatePromptRecordRequest(
    id,
    draft,
    expectedUpdatedAt,
    expectedBodyUpdatedAt,
  );
}

function parseDeletePromptRequest(
  value: Record<string, unknown>,
): DeletePromptRequest | null {
  const id = parsePromptId(value.id);
  const expectedUpdatedAt = parseRequiredTimestamp(value.expectedUpdatedAt);
  const expectedBodyUpdatedAt = parseOptionalTimestamp(
    value.expectedBodyUpdatedAt,
  );

  if (!id || !expectedUpdatedAt || expectedBodyUpdatedAt === null) {
    return null;
  }

  return buildDeletePromptRequest(id, expectedUpdatedAt, expectedBodyUpdatedAt);
}

function parseMovePromptRequest(
  value: Record<string, unknown>,
): MovePromptRequest | null {
  const id = parsePromptId(value.id);
  const expectedUpdatedAt = parseRequiredTimestamp(value.expectedUpdatedAt);
  const group = parseOptionalPromptOrderGroup(value.group);
  const previousId = parsePromptMoveBoundaryId(value.previousId);
  const nextId = parsePromptMoveBoundaryId(value.nextId);

  if (
    !id ||
    !expectedUpdatedAt ||
    group === null ||
    previousId === false ||
    nextId === false
  ) {
    return null;
  }

  return buildMovePromptRequest(id, {
    expectedUpdatedAt,
    group,
    previousId,
    nextId,
  });
}

function parseSetPromptPinnedRequest(
  value: Record<string, unknown>,
): SetPromptPinnedRequest | null {
  const id = parsePromptId(value.id);
  const expectedUpdatedAt = parseRequiredTimestamp(value.expectedUpdatedAt);

  if (!id || typeof value.pinned !== 'boolean' || !expectedUpdatedAt) {
    return null;
  }

  return buildSetPromptPinnedRequest(id, value.pinned, expectedUpdatedAt);
}

function parseListPromptMetasResponse(
  value: Record<string, unknown>,
): ListPromptMetasResponse | null {
  if (value.ok === true && value.status === 'success' && Array.isArray(value.metas)) {
    const metas = value.metas.map(parsePromptMeta);

    if (metas.some((meta) => meta === null)) {
      return null;
    }

    return buildListPromptMetasSuccessResponse(metas as PromptMeta[]);
  }

  return parsePromptErrorResponse(value, LIST_PROMPT_METAS_MESSAGE);
}

function parseGetPromptBodyResponse(
  value: Record<string, unknown>,
): GetPromptBodyResponse | null {
  if (value.ok === true && value.status === 'success') {
    const body = parsePromptBody(value.body);
    return body ? buildGetPromptBodySuccessResponse(body) : null;
  }

  return (
    parseNotFoundResponse(value, GET_PROMPT_BODY_MESSAGE) ??
    parsePromptErrorResponse(value, GET_PROMPT_BODY_MESSAGE)
  );
}

function parseGetPromptRecordResponse(
  value: Record<string, unknown>,
): GetPromptRecordResponse | null {
  if (value.ok === true && value.status === 'success') {
    const prompt = parsePromptRecord(value.prompt);
    return prompt ? buildGetPromptRecordSuccessResponse(prompt) : null;
  }

  return (
    parseNotFoundResponse(value, GET_PROMPT_RECORD_MESSAGE) ??
    parsePromptErrorResponse(value, GET_PROMPT_RECORD_MESSAGE)
  );
}

function parseCreatePromptResponse(
  value: Record<string, unknown>,
): CreatePromptResponse | null {
  if (value.ok === true && value.status === 'success') {
    const prompt = parsePromptRecord(value.prompt);
    return prompt ? buildCreatePromptSuccessResponse(prompt) : null;
  }

  return parsePromptErrorResponse(value, CREATE_PROMPT_MESSAGE);
}

function parsePromptMetaResponse<
  T extends
    | typeof UPDATE_PROMPT_META_MESSAGE
    | typeof MOVE_PROMPT_MESSAGE
    | typeof SET_PROMPT_PINNED_MESSAGE,
>(value: Record<string, unknown>, type: T):
  | PromptMetaSuccessResponse<T>
  | PromptNotFoundResponse<T>
  | PromptMetaConflictResponse<T>
  | PromptErrorResponse<T>
  | null {
  if (value.ok === true && value.status === 'success') {
    const meta = parsePromptMeta(value.meta);
    return meta ? buildPromptMetaSuccessResponse(type, meta) : null;
  }

  return (
    parseNotFoundResponse(value, type) ??
    parseMetaConflictResponse(value, type) ??
    parsePromptErrorResponse(value, type)
  );
}

function parseUpdatePromptBodyResponse(
  value: Record<string, unknown>,
): UpdatePromptBodyResponse | null {
  if (value.ok === true && value.status === 'success') {
    const prompt = parsePromptRecord(value.prompt);
    return prompt ? buildUpdatePromptBodySuccessResponse(prompt) : null;
  }

  return (
    parseNotFoundResponse(value, UPDATE_PROMPT_BODY_MESSAGE) ??
    parseRecordConflictResponse(value, UPDATE_PROMPT_BODY_MESSAGE) ??
    parsePromptErrorResponse(value, UPDATE_PROMPT_BODY_MESSAGE)
  );
}

function parseUpdatePromptRecordResponse(
  value: Record<string, unknown>,
): UpdatePromptRecordResponse | null {
  if (value.ok === true && value.status === 'success') {
    const prompt = parsePromptRecord(value.prompt);
    return prompt ? buildUpdatePromptRecordSuccessResponse(prompt) : null;
  }

  return (
    parseNotFoundResponse(value, UPDATE_PROMPT_RECORD_MESSAGE) ??
    parseRecordConflictResponse(value, UPDATE_PROMPT_RECORD_MESSAGE) ??
    parsePromptErrorResponse(value, UPDATE_PROMPT_RECORD_MESSAGE)
  );
}

function parseDeletePromptResponse(
  value: Record<string, unknown>,
): DeletePromptResponse | null {
  const id = parsePromptId(value.id);

  if (value.ok === true && value.status === 'success' && id) {
    return buildDeletePromptSuccessResponse(id);
  }

  return (
    parseNotFoundResponse(value, DELETE_PROMPT_MESSAGE) ??
    parseMetaConflictResponse(value, DELETE_PROMPT_MESSAGE) ??
    parsePromptErrorResponse(value, DELETE_PROMPT_MESSAGE)
  );
}

function parseNotFoundResponse<T extends ExistingPromptMessageType>(
  value: Record<string, unknown>,
  type: T,
): PromptNotFoundResponse<T> | null {
  const id = parsePromptId(value.id);

  if (
    value.ok === false &&
    value.status === 'not-found' &&
    id &&
    typeof value.message === 'string'
  ) {
    return buildPromptNotFoundResponse(
      type,
      id,
      value.message,
      parseRuntimeMessageDescriptor(value.messageDescriptor),
    );
  }

  return null;
}

type ParsedPromptConflictBase = {
  id: string;
  currentMeta: PromptMeta;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
};

function parseMetaConflictResponse<T extends PromptMetaConflictMessageType>(
  value: Record<string, unknown>,
  type: T,
): PromptMetaConflictResponse<T> | null {
  const conflict = parseConflictResponseBase(value);

  if (
    conflict === null ||
    Object.prototype.hasOwnProperty.call(value, 'currentRecord')
  ) {
    return null;
  }

  return buildPromptMetaConflictResponse(
    type,
    conflict.id,
    conflict.currentMeta,
    conflict.message,
    conflict.messageDescriptor,
  );
}

function parseRecordConflictResponse<T extends PromptRecordConflictMessageType>(
  value: Record<string, unknown>,
  type: T,
): PromptRecordConflictResponse<T> | null {
  const conflict = parseConflictResponseBase(value);

  if (conflict === null) {
    return null;
  }

  const currentRecord =
    typeof value.currentRecord === 'undefined'
      ? undefined
      : parsePromptRecord(value.currentRecord);

  if (currentRecord === null) {
    return null;
  }

  return buildPromptRecordConflictResponse(
    type,
    conflict.id,
    conflict.currentMeta,
    conflict.message,
    currentRecord,
    conflict.messageDescriptor,
  );
}

function parseConflictResponseBase(
  value: Record<string, unknown>,
): ParsedPromptConflictBase | null {
  const id = parsePromptId(value.id);
  const currentMeta = parsePromptMeta(value.currentMeta);

  if (
    value.ok !== false ||
    value.status !== 'conflict' ||
    !id ||
    typeof value.message !== 'string' ||
    !currentMeta
  ) {
    return null;
  }

  return {
    id,
    currentMeta,
    message: value.message,
    messageDescriptor: parseRuntimeMessageDescriptor(value.messageDescriptor),
  };
}

function parsePromptErrorResponse<T extends PromptMessageType>(
  value: Record<string, unknown>,
  type: T,
): PromptErrorResponse<T> | null {
  if (
    value.ok === false &&
    value.status === 'error' &&
    value.code === 'storage-failed' &&
    typeof value.message === 'string'
  ) {
    return buildPromptErrorResponse(
      type,
      value.message,
      value.code,
      parseRuntimeMessageDescriptor(value.messageDescriptor),
    );
  }

  return null;
}

function parsePromptMetaDraft(value: unknown): PromptMetaDraft | null {
  if (!isObjectRecord(value) || typeof value.title !== 'string') {
    return null;
  }

  if (
    typeof value.normalOrder !== 'undefined' &&
    (typeof value.normalOrder !== 'number' ||
      !Number.isFinite(value.normalOrder) ||
      !Number.isInteger(value.normalOrder) ||
      value.normalOrder < 0)
  ) {
    return null;
  }

  if (
    value.pinnedOrder !== null &&
    typeof value.pinnedOrder !== 'undefined' &&
    (typeof value.pinnedOrder !== 'number' ||
      !Number.isFinite(value.pinnedOrder) ||
      !Number.isInteger(value.pinnedOrder) ||
      value.pinnedOrder < 0)
  ) {
    return null;
  }

  return {
    title: value.title,
    normalOrder: value.normalOrder,
    pinnedOrder: value.pinnedOrder,
  };
}

function parsePromptId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1) {
    return null;
  }

  return value;
}

function parsePromptMoveBoundaryId(value: unknown): string | null | false {
  if (value === null) {
    return null;
  }

  return parsePromptId(value) ?? false;
}

function parseOptionalTimestamp(value: unknown): string | undefined | null {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return isValidPromptTimestamp(value) ? value : null;
}

function parseRequiredTimestamp(value: unknown): string | null {
  return isValidPromptTimestamp(value) ? value : null;
}

function parseOptionalPromptOrderGroup(
  value: unknown,
): PromptOrderGroup | undefined | null {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value === 'pinned' || value === 'normal') {
    return value;
  }

  return null;
}
