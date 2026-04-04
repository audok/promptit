import {
  decodeStoredPrompts,
  hasPromptDraftErrors,
  isValidPromptTimestamp,
  normalizePromptDraft,
  PROMPTS_STORAGE_KEY,
  validatePromptDraft,
  type DecodedStoredPrompts,
  type PromptDraft,
  type PromptItem,
} from './schema';
import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  UPDATE_PROMPT_MESSAGE,
  buildCreatePromptRequest,
  buildDeletePromptNotFoundResponse,
  buildDeletePromptRequest,
  buildUpdatePromptNotFoundResponse,
  buildUpdatePromptRequest,
  sendPromptitRuntimeRequest,
  type CreatePromptRequest,
  type CreatePromptResponse,
  type DeletePromptNotFoundResponse,
  type DeletePromptRequest,
  type DeletePromptResponse,
  type UpdatePromptNotFoundResponse,
  type UpdatePromptRequest,
  type UpdatePromptResponse,
} from '../runtime/messages';

const UPDATE_PROMPT_NOT_FOUND_MESSAGE = '수정할 프롬프트를 찾지 못했습니다.';
const DELETE_PROMPT_NOT_FOUND_MESSAGE = '삭제할 프롬프트를 찾지 못했습니다.';

export type UpdatePromptOptions = {
  expectedUpdatedAt?: string;
};

export type DeletePromptOptions = {
  expectedUpdatedAt?: string;
};

function hasStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function hasRuntimeApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);
}

async function readStoredPrompts(): Promise<DecodedStoredPrompts> {
  if (!hasStorageApi()) {
    return decodeStoredPrompts([]);
  }

  try {
    const result = await chrome.storage.local.get(PROMPTS_STORAGE_KEY);
    return decodeStoredPrompts(result[PROMPTS_STORAGE_KEY]);
  } catch (error) {
    console.error('[promptit] Failed to read prompts from storage.', error);

    throw error instanceof Error
      ? error
      : new Error('Failed to read prompts from storage.');
  }
}

async function repairStoredPrompts(prompts: PromptItem[]): Promise<void> {
  if (!hasStorageApi()) {
    return;
  }

  await chrome.storage.local.set({
    [PROMPTS_STORAGE_KEY]: prompts,
  });
}

async function getReadablePrompts(): Promise<PromptItem[]> {
  const decoded = await readStoredPrompts();

  if (decoded.needsRepair) {
    try {
      await repairStoredPrompts(decoded.prompts);
    } catch (error) {
      console.error(
        '[promptit] Failed to repair malformed prompt storage after a successful read.',
        error,
      );
    }
  }

  return decoded.prompts;
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

async function resolveUpdateExpectedUpdatedAt(
  id: string,
  expectedUpdatedAt: string | undefined,
): Promise<string | UpdatePromptNotFoundResponse> {
  if (typeof expectedUpdatedAt === 'string') {
    if (!isValidPromptTimestamp(expectedUpdatedAt)) {
      throw new Error('Invalid prompt updatedAt timestamp.');
    }

    return expectedUpdatedAt;
  }

  const currentPrompt = (await getReadablePrompts()).find(
    (prompt) => prompt.id === id,
  );

  if (!currentPrompt) {
    return buildUpdatePromptNotFoundResponse(id, UPDATE_PROMPT_NOT_FOUND_MESSAGE);
  }

  return currentPrompt.updatedAt;
}

async function resolveDeleteExpectedUpdatedAt(
  id: string,
  expectedUpdatedAt: string | undefined,
): Promise<string | DeletePromptNotFoundResponse> {
  if (typeof expectedUpdatedAt === 'string') {
    if (!isValidPromptTimestamp(expectedUpdatedAt)) {
      throw new Error('Invalid prompt updatedAt timestamp.');
    }

    return expectedUpdatedAt;
  }

  const currentPrompt = (await getReadablePrompts()).find(
    (prompt) => prompt.id === id,
  );

  if (!currentPrompt) {
    return buildDeletePromptNotFoundResponse(id, DELETE_PROMPT_NOT_FOUND_MESSAGE);
  }

  return currentPrompt.updatedAt;
}

export async function getPrompts(): Promise<PromptItem[]> {
  return getReadablePrompts();
}

export async function getUserPrompts(): Promise<PromptItem[]> {
  return getReadablePrompts();
}

export function createPrompt(
  draft: PromptDraft,
): Promise<CreatePromptResponse & PromptItem>;
export async function createPrompt(
  draft: PromptDraft,
): Promise<CreatePromptResponse> {
  const validatedDraft = getValidatedDraft(draft);
  const response = await sendPromptMutationRequest(
    buildCreatePromptRequest(validatedDraft),
  );

  if (!response.ok) {
    throw new Error(response.message);
  }

  return {
    ...response,
    ...response.prompt,
  };
}

export async function updatePrompt(
  id: string,
  draft: PromptDraft,
  options: UpdatePromptOptions = {},
): Promise<UpdatePromptResponse> {
  const validatedDraft = getValidatedDraft(draft);
  const expectedUpdatedAt = await resolveUpdateExpectedUpdatedAt(
    id,
    options.expectedUpdatedAt,
  );

  if (typeof expectedUpdatedAt !== 'string') {
    return expectedUpdatedAt;
  }

  return sendPromptMutationRequest(
    buildUpdatePromptRequest(id, validatedDraft, expectedUpdatedAt),
  );
}

export async function deletePrompt(
  id: string,
  options: DeletePromptOptions = {},
): Promise<DeletePromptResponse> {
  const expectedUpdatedAt = await resolveDeleteExpectedUpdatedAt(
    id,
    options.expectedUpdatedAt,
  );

  if (typeof expectedUpdatedAt !== 'string') {
    return expectedUpdatedAt;
  }

  return sendPromptMutationRequest(
    buildDeletePromptRequest(id, expectedUpdatedAt),
  );
}

export function subscribeToPrompts(
  listener: (prompts: PromptItem[]) => void,
): () => void {
  if (!hasStorageApi()) {
    return () => {};
  }

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !(PROMPTS_STORAGE_KEY in changes)) {
      return;
    }

    const { prompts } = decodeStoredPrompts(
      changes[PROMPTS_STORAGE_KEY]?.newValue,
    );
    listener(prompts);
  };

  chrome.storage.onChanged.addListener(handleChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleChange);
  };
}

async function sendPromptMutationRequest(
  request: CreatePromptRequest,
): Promise<CreatePromptResponse>;
async function sendPromptMutationRequest(
  request: UpdatePromptRequest,
): Promise<UpdatePromptResponse>;
async function sendPromptMutationRequest(
  request: DeletePromptRequest,
): Promise<DeletePromptResponse>;
async function sendPromptMutationRequest(
  request: CreatePromptRequest | UpdatePromptRequest | DeletePromptRequest,
): Promise<CreatePromptResponse | UpdatePromptResponse | DeletePromptResponse> {
  if (!hasRuntimeApi()) {
    throw new Error('Prompt mutation runtime is unavailable.');
  }

  const response = await sendPromptitRuntimeRequest(
    (nextRequest) => chrome.runtime.sendMessage(nextRequest) as Promise<unknown>,
    request,
  );

  switch (request.type) {
    case CREATE_PROMPT_MESSAGE:
      if (response.type === CREATE_PROMPT_MESSAGE) {
        return response;
      }
      break;
    case UPDATE_PROMPT_MESSAGE:
      if (response.type === UPDATE_PROMPT_MESSAGE) {
        return response;
      }
      break;
    case DELETE_PROMPT_MESSAGE:
      if (response.type === DELETE_PROMPT_MESSAGE) {
        return response;
      }
      break;
  }

  throw new Error('Received mismatched prompt mutation response.');
}
