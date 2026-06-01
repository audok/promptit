import {
  parsePromptBody,
  parsePromptDraft,
  parsePromptMeta,
  parsePromptRecord,
  type PromptMeta,
} from '../../../prompt/schema';
import type { RuntimeMessageDescriptor } from '../../../shared/i18n';
import { parseRuntimeMessageDescriptor } from '../shared';
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
import {
  buildCreatePromptRequest,
  buildCreatePromptSuccessResponse,
  buildDeletePromptRequest,
  buildDeletePromptSuccessResponse,
  buildGetPromptBodyRequest,
  buildGetPromptBodySuccessResponse,
  buildGetPromptRecordRequest,
  buildGetPromptRecordSuccessResponse,
  buildListPromptMetasRequest,
  buildListPromptMetasSuccessResponse,
  buildMovePromptRequest,
  buildPromptErrorResponse,
  buildPromptMetaConflictResponse,
  buildPromptMetaSuccessResponse,
  buildPromptNotFoundResponse,
  buildPromptRecordConflictResponse,
  buildSetPromptPinnedRequest,
  buildUpdatePromptBodyRequest,
  buildUpdatePromptBodySuccessResponse,
  buildUpdatePromptMetaRequest,
  buildUpdatePromptRecordRequest,
  buildUpdatePromptRecordSuccessResponse,
} from './builders';
import type {
  CreatePromptRequest,
  CreatePromptResponse,
  DeletePromptRequest,
  DeletePromptResponse,
  ExistingPromptMessageType,
  GetPromptBodyRequest,
  GetPromptBodyResponse,
  GetPromptRecordRequest,
  GetPromptRecordResponse,
  ListPromptMetasResponse,
  MovePromptRequest,
  PromptErrorResponse,
  PromptMessageType,
  PromptMetaConflictMessageType,
  PromptMetaConflictResponse,
  PromptMetaSuccessResponse,
  PromptNotFoundResponse,
  PromptRecordConflictMessageType,
  PromptRecordConflictResponse,
  PromptRequest,
  PromptResponse,
  SetPromptPinnedRequest,
  UpdatePromptBodyRequest,
  UpdatePromptBodyResponse,
  UpdatePromptMetaRequest,
  UpdatePromptRecordRequest,
  UpdatePromptRecordResponse,
} from './types';
import {
  parseOptionalPromptOrderGroup,
  parseOptionalTimestamp,
  parsePromptId,
  parsePromptMetaDraft,
  parsePromptMoveBoundaryId,
  parseRequiredTimestamp,
} from './validators';

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

  const currentRecord = parsePromptRecord(value.currentRecord);

  if (!currentRecord) {
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
