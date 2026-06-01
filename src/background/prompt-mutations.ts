import {
  createPrompt,
  deletePrompt,
  getPromptBody,
  getPromptRecord,
  listPromptMetas,
  movePrompt,
  publishPromptRevision,
  setPromptPinned,
  updatePromptBody,
  updatePromptMeta,
  updatePromptRecord,
} from '../prompt/repository';
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
  assertNever,
  buildCreatePromptSuccessResponse,
  buildDeletePromptSuccessResponse,
  buildGetPromptBodySuccessResponse,
  buildGetPromptRecordSuccessResponse,
  buildListPromptMetasSuccessResponse,
  buildPromptErrorResponse,
  buildPromptMetaConflictResponse,
  buildPromptMetaSuccessResponse,
  buildPromptNotFoundResponse,
  buildPromptRecordConflictResponse,
  buildUpdatePromptBodySuccessResponse,
  buildUpdatePromptRecordSuccessResponse,
  type CreatePromptRequest,
  type CreatePromptResponse,
  type DeletePromptRequest,
  type DeletePromptResponse,
  type GetPromptBodyRequest,
  type GetPromptBodyResponse,
  type GetPromptRecordRequest,
  type GetPromptRecordResponse,
  type ListPromptMetasRequest,
  type ListPromptMetasResponse,
  type MovePromptRequest,
  type MovePromptResponse,
  type PromptRequest,
  type PromptResponse,
  type SetPromptPinnedRequest,
  type SetPromptPinnedResponse,
  type UpdatePromptBodyRequest,
  type UpdatePromptBodyResponse,
  type UpdatePromptMetaRequest,
  type UpdatePromptMetaResponse,
  type UpdatePromptRecordRequest,
  type UpdatePromptRecordResponse,
} from '../runtime/messages';
import type { RuntimeMessageDescriptor } from '../shared/i18n';
import { enqueueStorageRequest } from './storage-queue';

const UPDATE_PROMPT_CONFLICT_MESSAGE =
  '다른 창의 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 시도해주세요.';
const UPDATE_PROMPT_NOT_FOUND_MESSAGE = '수정할 프롬프트를 찾지 못했습니다.';
const DELETE_PROMPT_CONFLICT_MESSAGE =
  '다른 창의 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 시도해주세요.';
const DELETE_PROMPT_NOT_FOUND_MESSAGE = '삭제할 프롬프트를 찾지 못했습니다.';
const READ_PROMPT_NOT_FOUND_MESSAGE = '프롬프트를 찾지 못했습니다.';
const UPDATE_PROMPT_CONFLICT_DESCRIPTOR = {
  key: 'runtime.prompt.updateConflict',
} satisfies RuntimeMessageDescriptor;
const UPDATE_PROMPT_NOT_FOUND_DESCRIPTOR = {
  key: 'runtime.prompt.updateNotFound',
} satisfies RuntimeMessageDescriptor;
const DELETE_PROMPT_CONFLICT_DESCRIPTOR = {
  key: 'runtime.prompt.deleteConflict',
} satisfies RuntimeMessageDescriptor;
const DELETE_PROMPT_NOT_FOUND_DESCRIPTOR = {
  key: 'runtime.prompt.deleteNotFound',
} satisfies RuntimeMessageDescriptor;
const READ_PROMPT_NOT_FOUND_DESCRIPTOR = {
  key: 'runtime.prompt.readNotFound',
} satisfies RuntimeMessageDescriptor;
const READ_PROMPT_ERROR_DESCRIPTOR = {
  key: 'runtime.prompt.readFailed',
} satisfies RuntimeMessageDescriptor;
const SAVE_PROMPT_ERROR_DESCRIPTOR = {
  key: 'runtime.prompt.saveFailed',
} satisfies RuntimeMessageDescriptor;
const DELETE_PROMPT_ERROR_DESCRIPTOR = {
  key: 'runtime.prompt.deleteFailed',
} satisfies RuntimeMessageDescriptor;
const PIN_PROMPT_CONFLICT_DESCRIPTOR = {
  key: 'runtime.prompt.pinConflict',
} satisfies RuntimeMessageDescriptor;
const PIN_PROMPT_NOT_FOUND_DESCRIPTOR = {
  key: 'runtime.prompt.pinNotFound',
} satisfies RuntimeMessageDescriptor;
const PIN_PROMPT_ERROR_DESCRIPTOR = {
  key: 'runtime.prompt.pinFailed',
} satisfies RuntimeMessageDescriptor;

export function handlePromptRequest(
  request: PromptRequest,
): Promise<PromptResponse> {
  return enqueueStorageRequest(() => executePromptRequest(request));
}

async function executePromptRequest(
  request: PromptRequest,
): Promise<PromptResponse> {
  try {
    switch (request.type) {
      case LIST_PROMPT_METAS_MESSAGE:
        return await handleListPromptMetasRequest(request);
      case GET_PROMPT_BODY_MESSAGE:
        return await handleGetPromptBodyRequest(request);
      case GET_PROMPT_RECORD_MESSAGE:
        return await handleGetPromptRecordRequest(request);
      case CREATE_PROMPT_MESSAGE:
        return await handleCreatePromptRequest(request);
      case UPDATE_PROMPT_META_MESSAGE:
        return await handleUpdatePromptMetaRequest(request);
      case UPDATE_PROMPT_BODY_MESSAGE:
        return await handleUpdatePromptBodyRequest(request);
      case UPDATE_PROMPT_RECORD_MESSAGE:
        return await handleUpdatePromptRecordRequest(request);
      case DELETE_PROMPT_MESSAGE:
        return await handleDeletePromptRequest(request);
      case MOVE_PROMPT_MESSAGE:
        return await handleMovePromptRequest(request);
      case SET_PROMPT_PINNED_MESSAGE:
        return await handleSetPromptPinnedRequest(request);
    }
  } catch (error) {
    console.error('[promptit] Prompt request failed in background.', error);
    return buildRequestErrorResponse(request, error);
  }

  return assertNever(request);
}

async function handleListPromptMetasRequest(
  _request: ListPromptMetasRequest,
): Promise<ListPromptMetasResponse> {
  return buildListPromptMetasSuccessResponse(await listPromptMetas());
}

async function handleGetPromptBodyRequest(
  request: GetPromptBodyRequest,
): Promise<GetPromptBodyResponse> {
  const body = await getPromptBody(request.id);

  if (!body) {
    return buildPromptNotFoundResponse(
      GET_PROMPT_BODY_MESSAGE,
      request.id,
      READ_PROMPT_NOT_FOUND_MESSAGE,
      READ_PROMPT_NOT_FOUND_DESCRIPTOR,
    );
  }

  return buildGetPromptBodySuccessResponse(body);
}

async function handleGetPromptRecordRequest(
  request: GetPromptRecordRequest,
): Promise<GetPromptRecordResponse> {
  const prompt = await getPromptRecord(request.id);

  if (!prompt) {
    return buildPromptNotFoundResponse(
      GET_PROMPT_RECORD_MESSAGE,
      request.id,
      READ_PROMPT_NOT_FOUND_MESSAGE,
      READ_PROMPT_NOT_FOUND_DESCRIPTOR,
    );
  }

  return buildGetPromptRecordSuccessResponse(prompt);
}

async function handleCreatePromptRequest(
  request: CreatePromptRequest,
): Promise<CreatePromptResponse> {
  const prompt = await createPrompt(request.draft);

  await publishPromptStorageSideEffectsBestEffort();
  return buildCreatePromptSuccessResponse(prompt);
}

async function handleUpdatePromptMetaRequest(
  request: UpdatePromptMetaRequest,
): Promise<UpdatePromptMetaResponse> {
  const result = await updatePromptMeta(request.id, request.draft, {
    expectedUpdatedAt: request.expectedUpdatedAt,
  });

  switch (result.status) {
    case 'success':
      await publishPromptStorageSideEffectsBestEffort();
      return buildPromptMetaSuccessResponse(
        UPDATE_PROMPT_META_MESSAGE,
        result.value,
      );
    case 'not-found':
      return buildPromptNotFoundResponse(
        UPDATE_PROMPT_META_MESSAGE,
        result.id,
        UPDATE_PROMPT_NOT_FOUND_MESSAGE,
        UPDATE_PROMPT_NOT_FOUND_DESCRIPTOR,
      );
    case 'conflict':
      return buildPromptMetaConflictResponse(
        UPDATE_PROMPT_META_MESSAGE,
        result.id,
        result.currentMeta,
        UPDATE_PROMPT_CONFLICT_MESSAGE,
        UPDATE_PROMPT_CONFLICT_DESCRIPTOR,
      );
  }

  return assertNever(result);
}

async function handleUpdatePromptBodyRequest(
  request: UpdatePromptBodyRequest,
): Promise<UpdatePromptBodyResponse> {
  const result = await updatePromptBody(request.id, request.content, {
    expectedUpdatedAt: request.expectedUpdatedAt,
    expectedBodyUpdatedAt: request.expectedBodyUpdatedAt,
  });

  switch (result.status) {
    case 'success':
      await publishPromptStorageSideEffectsBestEffort();
      return buildUpdatePromptBodySuccessResponse(result.value);
    case 'not-found':
      return buildPromptNotFoundResponse(
        UPDATE_PROMPT_BODY_MESSAGE,
        result.id,
        UPDATE_PROMPT_NOT_FOUND_MESSAGE,
        UPDATE_PROMPT_NOT_FOUND_DESCRIPTOR,
      );
    case 'conflict':
      return buildPromptRecordConflictResponse(
        UPDATE_PROMPT_BODY_MESSAGE,
        result.id,
        result.currentMeta,
        UPDATE_PROMPT_CONFLICT_MESSAGE,
        result.currentRecord,
        UPDATE_PROMPT_CONFLICT_DESCRIPTOR,
      );
  }

  return assertNever(result);
}

async function handleUpdatePromptRecordRequest(
  request: UpdatePromptRecordRequest,
): Promise<UpdatePromptRecordResponse> {
  const result = await updatePromptRecord(request.id, request.draft, {
    expectedUpdatedAt: request.expectedUpdatedAt,
    expectedBodyUpdatedAt: request.expectedBodyUpdatedAt,
  });

  switch (result.status) {
    case 'success':
      await publishPromptStorageSideEffectsBestEffort();
      return buildUpdatePromptRecordSuccessResponse(result.value);
    case 'not-found':
      return buildPromptNotFoundResponse(
        UPDATE_PROMPT_RECORD_MESSAGE,
        result.id,
        UPDATE_PROMPT_NOT_FOUND_MESSAGE,
        UPDATE_PROMPT_NOT_FOUND_DESCRIPTOR,
      );
    case 'conflict':
      return buildPromptRecordConflictResponse(
        UPDATE_PROMPT_RECORD_MESSAGE,
        result.id,
        result.currentMeta,
        UPDATE_PROMPT_CONFLICT_MESSAGE,
        result.currentRecord,
        UPDATE_PROMPT_CONFLICT_DESCRIPTOR,
      );
  }

  return assertNever(result);
}

async function handleDeletePromptRequest(
  request: DeletePromptRequest,
): Promise<DeletePromptResponse> {
  const result = await deletePrompt(request.id, {
    expectedUpdatedAt: request.expectedUpdatedAt,
    expectedBodyUpdatedAt: request.expectedBodyUpdatedAt,
  });

  switch (result.status) {
    case 'success':
      await publishPromptStorageSideEffectsBestEffort();
      return buildDeletePromptSuccessResponse(result.value);
    case 'not-found':
      return buildPromptNotFoundResponse(
        DELETE_PROMPT_MESSAGE,
        result.id,
        DELETE_PROMPT_NOT_FOUND_MESSAGE,
        DELETE_PROMPT_NOT_FOUND_DESCRIPTOR,
      );
    case 'conflict':
      return buildPromptMetaConflictResponse(
        DELETE_PROMPT_MESSAGE,
        result.id,
        result.currentMeta,
        DELETE_PROMPT_CONFLICT_MESSAGE,
        DELETE_PROMPT_CONFLICT_DESCRIPTOR,
      );
  }

  return assertNever(result);
}

async function handleMovePromptRequest(
  request: MovePromptRequest,
): Promise<MovePromptResponse> {
  const result = await movePrompt(request.id, {
    expectedUpdatedAt: request.expectedUpdatedAt,
    group: request.group,
    previousId: request.previousId,
    nextId: request.nextId,
  });

  switch (result.status) {
    case 'success':
      await publishPromptStorageSideEffectsBestEffort();
      return buildPromptMetaSuccessResponse(MOVE_PROMPT_MESSAGE, result.value);
    case 'not-found':
      return buildPromptNotFoundResponse(
        MOVE_PROMPT_MESSAGE,
        result.id,
        UPDATE_PROMPT_NOT_FOUND_MESSAGE,
        UPDATE_PROMPT_NOT_FOUND_DESCRIPTOR,
      );
    case 'conflict':
      return buildPromptMetaConflictResponse(
        MOVE_PROMPT_MESSAGE,
        result.id,
        result.currentMeta,
        UPDATE_PROMPT_CONFLICT_MESSAGE,
        UPDATE_PROMPT_CONFLICT_DESCRIPTOR,
      );
  }

  return assertNever(result);
}

async function handleSetPromptPinnedRequest(
  request: SetPromptPinnedRequest,
): Promise<SetPromptPinnedResponse> {
  const result = await setPromptPinned(request.id, request.pinned, {
    expectedUpdatedAt: request.expectedUpdatedAt,
  });

  switch (result.status) {
    case 'success':
      await publishPromptStorageSideEffectsBestEffort();
      return buildPromptMetaSuccessResponse(
        SET_PROMPT_PINNED_MESSAGE,
        result.value,
      );
    case 'not-found':
      return buildPromptNotFoundResponse(
        SET_PROMPT_PINNED_MESSAGE,
        result.id,
        UPDATE_PROMPT_NOT_FOUND_MESSAGE,
        PIN_PROMPT_NOT_FOUND_DESCRIPTOR,
      );
    case 'conflict':
      return buildPromptMetaConflictResponse(
        SET_PROMPT_PINNED_MESSAGE,
        result.id,
        result.currentMeta,
        UPDATE_PROMPT_CONFLICT_MESSAGE,
        PIN_PROMPT_CONFLICT_DESCRIPTOR,
      );
  }

  return assertNever(result);
}

function buildRequestErrorResponse(
  request: PromptRequest,
  error: unknown,
): PromptResponse {
  return buildPromptErrorResponse(
    request.type,
    getErrorMessage(error, getDefaultErrorMessage(request)),
    'storage-failed',
    getDefaultErrorDescriptor(request),
  );
}

async function publishPromptStorageSideEffectsBestEffort(): Promise<void> {
  try {
    await publishPromptRevision();
  } catch (error) {
    console.error('[promptit] Failed to publish prompt revision.', error);
  }
}

function getDefaultErrorMessage(request: PromptRequest): string {
  switch (request.type) {
    case LIST_PROMPT_METAS_MESSAGE:
    case GET_PROMPT_BODY_MESSAGE:
    case GET_PROMPT_RECORD_MESSAGE:
      return '프롬프트를 읽는 중 오류가 발생했습니다.';
    case CREATE_PROMPT_MESSAGE:
    case UPDATE_PROMPT_META_MESSAGE:
    case UPDATE_PROMPT_BODY_MESSAGE:
    case UPDATE_PROMPT_RECORD_MESSAGE:
    case MOVE_PROMPT_MESSAGE:
    case SET_PROMPT_PINNED_MESSAGE:
      return '프롬프트 저장 중 오류가 발생했습니다.';
    case DELETE_PROMPT_MESSAGE:
      return '프롬프트 삭제 중 오류가 발생했습니다.';
  }

  return assertNever(request);
}

function getDefaultErrorDescriptor(
  request: PromptRequest,
): RuntimeMessageDescriptor {
  switch (request.type) {
    case LIST_PROMPT_METAS_MESSAGE:
    case GET_PROMPT_BODY_MESSAGE:
    case GET_PROMPT_RECORD_MESSAGE:
      return READ_PROMPT_ERROR_DESCRIPTOR;
    case CREATE_PROMPT_MESSAGE:
    case UPDATE_PROMPT_META_MESSAGE:
    case UPDATE_PROMPT_BODY_MESSAGE:
    case UPDATE_PROMPT_RECORD_MESSAGE:
    case MOVE_PROMPT_MESSAGE:
      return SAVE_PROMPT_ERROR_DESCRIPTOR;
    case SET_PROMPT_PINNED_MESSAGE:
      return PIN_PROMPT_ERROR_DESCRIPTOR;
    case DELETE_PROMPT_MESSAGE:
      return DELETE_PROMPT_ERROR_DESCRIPTOR;
  }

  return assertNever(request);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
