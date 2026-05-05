import {
  decodeStoredPrompts,
  hasPromptDraftErrors,
  normalizePromptDraft,
  PROMPTS_STORAGE_KEY,
  sortPrompts,
  validatePromptDraft,
  type PromptDraft,
  type PromptItem,
} from '../prompt/schema';
import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  UPDATE_PROMPT_MESSAGE,
  assertNever,
  buildCreatePromptErrorResponse,
  buildCreatePromptSuccessResponse,
  buildDeletePromptConflictResponse,
  buildDeletePromptErrorResponse,
  buildDeletePromptNotFoundResponse,
  buildDeletePromptSuccessResponse,
  buildUpdatePromptConflictResponse,
  buildUpdatePromptErrorResponse,
  buildUpdatePromptNotFoundResponse,
  buildUpdatePromptSuccessResponse,
  type CreatePromptRequest,
  type CreatePromptResponse,
  type DeletePromptRequest,
  type DeletePromptResponse,
  type PromptMutationRequest,
  type PromptMutationResponse,
  type UpdatePromptRequest,
  type UpdatePromptResponse,
} from '../runtime/messages';

const UPDATE_PROMPT_CONFLICT_MESSAGE =
  '다른 창의 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 시도해주세요.';
const UPDATE_PROMPT_NOT_FOUND_MESSAGE = '수정할 프롬프트를 찾지 못했습니다.';
const DELETE_PROMPT_CONFLICT_MESSAGE =
  '다른 창의 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 시도해주세요.';
const DELETE_PROMPT_NOT_FOUND_MESSAGE = '삭제할 프롬프트를 찾지 못했습니다.';

let promptMutationQueue: Promise<void> = Promise.resolve();

export function handlePromptMutationRequest(
  request: PromptMutationRequest,
): Promise<PromptMutationResponse> {
  const nextRun = promptMutationQueue.then(
    () => executePromptMutation(request),
    () => executePromptMutation(request),
  );

  promptMutationQueue = nextRun.then(
    () => undefined,
    () => undefined,
  );

  return nextRun;
}

async function executePromptMutation(
  request: PromptMutationRequest,
): Promise<PromptMutationResponse> {
  try {
    switch (request.type) {
      case CREATE_PROMPT_MESSAGE:
        return await handleCreatePromptRequest(request);
      case UPDATE_PROMPT_MESSAGE:
        return await handleUpdatePromptRequest(request);
      case DELETE_PROMPT_MESSAGE:
        return await handleDeletePromptRequest(request);
    }
  } catch (error) {
    console.error('[promptit] Prompt mutation failed in background.', error);
    return buildMutationErrorResponse(request, error);
  }

  return assertNever(request);
}

async function handleCreatePromptRequest(
  request: CreatePromptRequest,
): Promise<CreatePromptResponse> {
  const validatedDraft = getValidatedDraft(request.draft);
  const prompts = await readStoredPrompts();
  const timestamp = new Date().toISOString();
  const nextPrompt: PromptItem = {
    id: crypto.randomUUID(),
    title: validatedDraft.title,
    content: validatedDraft.content,
    sortOrder: validatedDraft.sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await writeStoredPrompts([...prompts, nextPrompt]);
  return buildCreatePromptSuccessResponse(nextPrompt);
}

async function handleUpdatePromptRequest(
  request: UpdatePromptRequest,
): Promise<UpdatePromptResponse> {
  const validatedDraft = getValidatedDraft(request.draft);
  const prompts = await readStoredPrompts();
  const promptIndex = prompts.findIndex((prompt) => prompt.id === request.id);

  if (promptIndex < 0) {
    return buildUpdatePromptNotFoundResponse(
      request.id,
      UPDATE_PROMPT_NOT_FOUND_MESSAGE,
    );
  }

  const currentPrompt = prompts[promptIndex];

  if (currentPrompt.updatedAt !== request.expectedUpdatedAt) {
    return buildUpdatePromptConflictResponse(
      request.id,
      currentPrompt,
      UPDATE_PROMPT_CONFLICT_MESSAGE,
    );
  }

  const nextPrompt: PromptItem = {
    ...currentPrompt,
    title: validatedDraft.title,
    content: validatedDraft.content,
    sortOrder: validatedDraft.sortOrder,
    updatedAt: new Date().toISOString(),
  };
  const nextPrompts = [...prompts];

  nextPrompts[promptIndex] = nextPrompt;
  await writeStoredPrompts(nextPrompts);
  return buildUpdatePromptSuccessResponse(nextPrompt);
}

async function handleDeletePromptRequest(
  request: DeletePromptRequest,
): Promise<DeletePromptResponse> {
  const prompts = await readStoredPrompts();
  const currentPrompt = prompts.find((prompt) => prompt.id === request.id);

  if (!currentPrompt) {
    return buildDeletePromptNotFoundResponse(
      request.id,
      DELETE_PROMPT_NOT_FOUND_MESSAGE,
    );
  }

  if (currentPrompt.updatedAt !== request.expectedUpdatedAt) {
    return buildDeletePromptConflictResponse(
      request.id,
      currentPrompt,
      DELETE_PROMPT_CONFLICT_MESSAGE,
    );
  }

  await writeStoredPrompts(
    prompts.filter((prompt) => prompt.id !== request.id),
  );

  return buildDeletePromptSuccessResponse(request.id);
}

async function readStoredPrompts(): Promise<PromptItem[]> {
  assertStorageApi();

  const result = await chrome.storage.local.get(PROMPTS_STORAGE_KEY);
  const decoded = decodeStoredPrompts(result[PROMPTS_STORAGE_KEY]);

  if (decoded.needsRepair) {
    await writeStoredPrompts(decoded.prompts);
  }

  return decoded.prompts;
}

async function writeStoredPrompts(prompts: PromptItem[]): Promise<void> {
  assertStorageApi();

  await chrome.storage.local.set({
    [PROMPTS_STORAGE_KEY]: sortPrompts(prompts),
  });
}

function assertStorageApi(): void {
  if (!hasStorageApi()) {
    throw new Error('Prompt storage is unavailable.');
  }
}

function getValidatedDraft(draft: PromptDraft): PromptDraft {
  const normalizedDraft = normalizePromptDraft(draft);
  const errors = validatePromptDraft(normalizedDraft);

  if (hasPromptDraftErrors(errors)) {
    throw new Error(
      Object.values(errors)
        .filter(Boolean)
        .join(' '),
    );
  }

  return normalizedDraft;
}

function buildMutationErrorResponse(
  request: PromptMutationRequest,
  error: unknown,
): PromptMutationResponse {
  const message = getErrorMessage(error, getDefaultErrorMessage(request));

  switch (request.type) {
    case CREATE_PROMPT_MESSAGE:
      return buildCreatePromptErrorResponse(message);
    case UPDATE_PROMPT_MESSAGE:
      return buildUpdatePromptErrorResponse(message);
    case DELETE_PROMPT_MESSAGE:
      return buildDeletePromptErrorResponse(message);
  }

  return assertNever(request);
}

function getDefaultErrorMessage(request: PromptMutationRequest): string {
  switch (request.type) {
    case CREATE_PROMPT_MESSAGE:
    case UPDATE_PROMPT_MESSAGE:
      return '프롬프트 저장 중 오류가 발생했습니다.';
    case DELETE_PROMPT_MESSAGE:
      return '프롬프트 삭제 중 오류가 발생했습니다.';
  }

  return assertNever(request);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}

function hasStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
