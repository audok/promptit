import {
  isValidPromptTimestamp,
  parsePromptDraft,
  parsePromptItem,
  type PromptDraft,
  type PromptItem,
} from '../prompt/schema';

export const OPEN_OPTIONS_PAGE_MESSAGE = 'promptit/open-options-page';
export const CREATE_PROMPT_MESSAGE = 'promptit/create-prompt';
export const UPDATE_PROMPT_MESSAGE = 'promptit/update-prompt';
export const DELETE_PROMPT_MESSAGE = 'promptit/delete-prompt';

type PromptMutationMessageType =
  | typeof CREATE_PROMPT_MESSAGE
  | typeof UPDATE_PROMPT_MESSAGE
  | typeof DELETE_PROMPT_MESSAGE;

type ExistingPromptMutationMessageType =
  | typeof UPDATE_PROMPT_MESSAGE
  | typeof DELETE_PROMPT_MESSAGE;

export type OpenOptionsPageRequest = {
  type: typeof OPEN_OPTIONS_PAGE_MESSAGE;
};

export type CreatePromptRequest = {
  type: typeof CREATE_PROMPT_MESSAGE;
  draft: PromptDraft;
};

export type UpdatePromptRequest = {
  type: typeof UPDATE_PROMPT_MESSAGE;
  id: string;
  expectedUpdatedAt: string;
  draft: PromptDraft;
};

export type DeletePromptRequest = {
  type: typeof DELETE_PROMPT_MESSAGE;
  id: string;
  expectedUpdatedAt: string;
};

export type PromptMutationRequest =
  | CreatePromptRequest
  | UpdatePromptRequest
  | DeletePromptRequest;

export type PromptitRuntimeRequest =
  | OpenOptionsPageRequest
  | PromptMutationRequest;

export type OpenOptionsPageSuccessResponse = {
  type: typeof OPEN_OPTIONS_PAGE_MESSAGE;
  ok: true;
};

export type OpenOptionsPageErrorCode = 'open-options-failed';

export type OpenOptionsPageErrorResponse = {
  type: typeof OPEN_OPTIONS_PAGE_MESSAGE;
  ok: false;
  code: OpenOptionsPageErrorCode;
  message: string;
};

export type OpenOptionsPageResponse =
  | OpenOptionsPageSuccessResponse
  | OpenOptionsPageErrorResponse;

export type PromptMutationErrorCode = 'storage-failed';

export type CreatePromptSuccessResponse = {
  type: typeof CREATE_PROMPT_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptItem;
};

type PromptMutationErrorResponse<T extends PromptMutationMessageType> = {
  type: T;
  ok: false;
  status: 'error';
  code: PromptMutationErrorCode;
  message: string;
};

type ExistingPromptMutationNotFoundResponse<
  T extends ExistingPromptMutationMessageType,
> = {
  type: T;
  ok: false;
  status: 'not-found';
  id: string;
  message: string;
};

type ExistingPromptMutationConflictResponse<
  T extends ExistingPromptMutationMessageType,
> = {
  type: T;
  ok: false;
  status: 'conflict';
  id: string;
  message: string;
  currentPrompt: PromptItem;
};

export type CreatePromptErrorResponse =
  PromptMutationErrorResponse<typeof CREATE_PROMPT_MESSAGE>;

export type CreatePromptResponse =
  | CreatePromptSuccessResponse
  | CreatePromptErrorResponse;

export type UpdatePromptSuccessResponse = {
  type: typeof UPDATE_PROMPT_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptItem;
};

export type UpdatePromptNotFoundResponse =
  ExistingPromptMutationNotFoundResponse<typeof UPDATE_PROMPT_MESSAGE>;

export type UpdatePromptConflictResponse =
  ExistingPromptMutationConflictResponse<typeof UPDATE_PROMPT_MESSAGE>;

export type UpdatePromptErrorResponse =
  PromptMutationErrorResponse<typeof UPDATE_PROMPT_MESSAGE>;

export type UpdatePromptResponse =
  | UpdatePromptSuccessResponse
  | UpdatePromptNotFoundResponse
  | UpdatePromptConflictResponse
  | UpdatePromptErrorResponse;

export type DeletePromptSuccessResponse = {
  type: typeof DELETE_PROMPT_MESSAGE;
  ok: true;
  status: 'success';
  id: string;
};

export type DeletePromptNotFoundResponse =
  ExistingPromptMutationNotFoundResponse<typeof DELETE_PROMPT_MESSAGE>;

export type DeletePromptConflictResponse =
  ExistingPromptMutationConflictResponse<typeof DELETE_PROMPT_MESSAGE>;

export type DeletePromptErrorResponse =
  PromptMutationErrorResponse<typeof DELETE_PROMPT_MESSAGE>;

export type DeletePromptResponse =
  | DeletePromptSuccessResponse
  | DeletePromptNotFoundResponse
  | DeletePromptConflictResponse
  | DeletePromptErrorResponse;

export type PromptMutationResponse =
  | CreatePromptResponse
  | UpdatePromptResponse
  | DeletePromptResponse;

export type PromptitRuntimeResponse =
  | OpenOptionsPageResponse
  | PromptMutationResponse;

// Backward-compatible alias for current callers while the sender/receiver
// migration moves to PromptitRuntimeRequest.
export type PromptitRuntimeMessage = PromptitRuntimeRequest;

export function buildOpenOptionsPageRequest(): OpenOptionsPageRequest {
  return {
    type: OPEN_OPTIONS_PAGE_MESSAGE,
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

export function buildUpdatePromptRequest(
  id: string,
  draft: PromptDraft,
  expectedUpdatedAt: string,
): UpdatePromptRequest {
  return {
    type: UPDATE_PROMPT_MESSAGE,
    id,
    expectedUpdatedAt,
    draft,
  };
}

export function buildDeletePromptRequest(
  id: string,
  expectedUpdatedAt: string,
): DeletePromptRequest {
  return {
    type: DELETE_PROMPT_MESSAGE,
    id,
    expectedUpdatedAt,
  };
}

export function buildOpenOptionsPageSuccessResponse(): OpenOptionsPageSuccessResponse {
  return {
    type: OPEN_OPTIONS_PAGE_MESSAGE,
    ok: true,
  };
}

export function buildOpenOptionsPageErrorResponse(
  message: string,
  code: OpenOptionsPageErrorCode = 'open-options-failed',
): OpenOptionsPageErrorResponse {
  return {
    type: OPEN_OPTIONS_PAGE_MESSAGE,
    ok: false,
    code,
    message,
  };
}

export function buildCreatePromptSuccessResponse(
  prompt: PromptItem,
): CreatePromptSuccessResponse {
  return {
    type: CREATE_PROMPT_MESSAGE,
    ok: true,
    status: 'success',
    prompt,
  };
}

export function buildCreatePromptErrorResponse(
  message: string,
  code: PromptMutationErrorCode = 'storage-failed',
): CreatePromptErrorResponse {
  return buildPromptMutationErrorResponse(
    CREATE_PROMPT_MESSAGE,
    message,
    code,
  );
}

export function buildUpdatePromptSuccessResponse(
  prompt: PromptItem,
): UpdatePromptSuccessResponse {
  return {
    type: UPDATE_PROMPT_MESSAGE,
    ok: true,
    status: 'success',
    prompt,
  };
}

export function buildUpdatePromptNotFoundResponse(
  id: string,
  message: string,
): UpdatePromptNotFoundResponse {
  return buildExistingPromptMutationNotFoundResponse(
    UPDATE_PROMPT_MESSAGE,
    id,
    message,
  );
}

export function buildUpdatePromptConflictResponse(
  id: string,
  currentPrompt: PromptItem,
  message: string,
): UpdatePromptConflictResponse;
export function buildUpdatePromptConflictResponse(
  currentPrompt: PromptItem,
  message: string,
): UpdatePromptConflictResponse;
export function buildUpdatePromptConflictResponse(
  idOrCurrentPrompt: string | PromptItem,
  currentPromptOrMessage: PromptItem | string,
  message?: string,
): UpdatePromptConflictResponse {
  const id =
    typeof idOrCurrentPrompt === 'string'
      ? idOrCurrentPrompt
      : idOrCurrentPrompt.id;
  const currentPrompt =
    typeof idOrCurrentPrompt === 'string'
      ? currentPromptOrMessage
      : idOrCurrentPrompt;
  const resolvedMessage =
    typeof idOrCurrentPrompt === 'string'
      ? message
      : currentPromptOrMessage;

  if (
    typeof resolvedMessage !== 'string' ||
    typeof currentPrompt === 'string'
  ) {
    throw new Error('Invalid update prompt conflict response.');
  }

  return buildExistingPromptMutationConflictResponse(
    UPDATE_PROMPT_MESSAGE,
    id,
    currentPrompt,
    resolvedMessage,
  );
}

export function buildUpdatePromptErrorResponse(
  message: string,
  code: PromptMutationErrorCode = 'storage-failed',
): UpdatePromptErrorResponse {
  return buildPromptMutationErrorResponse(
    UPDATE_PROMPT_MESSAGE,
    message,
    code,
  );
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

export function buildDeletePromptNotFoundResponse(
  id: string,
  message: string,
): DeletePromptNotFoundResponse {
  return buildExistingPromptMutationNotFoundResponse(
    DELETE_PROMPT_MESSAGE,
    id,
    message,
  );
}

export function buildDeletePromptConflictResponse(
  id: string,
  currentPrompt: PromptItem,
  message: string,
): DeletePromptConflictResponse;
export function buildDeletePromptConflictResponse(
  currentPrompt: PromptItem,
  message: string,
): DeletePromptConflictResponse;
export function buildDeletePromptConflictResponse(
  idOrCurrentPrompt: string | PromptItem,
  currentPromptOrMessage: PromptItem | string,
  message?: string,
): DeletePromptConflictResponse {
  const id =
    typeof idOrCurrentPrompt === 'string'
      ? idOrCurrentPrompt
      : idOrCurrentPrompt.id;
  const currentPrompt =
    typeof idOrCurrentPrompt === 'string'
      ? currentPromptOrMessage
      : idOrCurrentPrompt;
  const resolvedMessage =
    typeof idOrCurrentPrompt === 'string'
      ? message
      : currentPromptOrMessage;

  if (
    typeof resolvedMessage !== 'string' ||
    typeof currentPrompt === 'string'
  ) {
    throw new Error('Invalid delete prompt conflict response.');
  }

  return buildExistingPromptMutationConflictResponse(
    DELETE_PROMPT_MESSAGE,
    id,
    currentPrompt,
    resolvedMessage,
  );
}

export function buildDeletePromptErrorResponse(
  message: string,
  code: PromptMutationErrorCode = 'storage-failed',
): DeletePromptErrorResponse {
  return buildPromptMutationErrorResponse(
    DELETE_PROMPT_MESSAGE,
    message,
    code,
  );
}

export function parsePromptitRuntimeRequest(
  value: unknown,
): PromptitRuntimeRequest | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  switch (value.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      return buildOpenOptionsPageRequest();
    case CREATE_PROMPT_MESSAGE:
    case UPDATE_PROMPT_MESSAGE:
    case DELETE_PROMPT_MESSAGE:
      return parsePromptMutationRequest(value);
    default:
      return null;
  }
}

export function parsePromptMutationRequest(
  value: unknown,
): PromptMutationRequest | null {
  if (!isObjectRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case CREATE_PROMPT_MESSAGE:
      return parseCreatePromptRequest(value);
    case UPDATE_PROMPT_MESSAGE:
      return parseUpdatePromptRequest(value);
    case DELETE_PROMPT_MESSAGE:
      return parseDeletePromptRequest(value);
    default:
      return null;
  }
}

export function parsePromptitRuntimeResponse(
  value: unknown,
): PromptitRuntimeResponse | null {
  if (!isObjectRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      return parseOpenOptionsPageResponse(value);
    case CREATE_PROMPT_MESSAGE:
    case UPDATE_PROMPT_MESSAGE:
    case DELETE_PROMPT_MESSAGE:
      return parsePromptMutationResponse(value);
    default:
      return null;
  }
}

export function parsePromptMutationResponse(
  value: unknown,
): PromptMutationResponse | null {
  if (!isObjectRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case CREATE_PROMPT_MESSAGE:
      return parseCreatePromptResponse(value);
    case UPDATE_PROMPT_MESSAGE:
      return parseUpdatePromptResponse(value);
    case DELETE_PROMPT_MESSAGE:
      return parseDeletePromptResponse(value);
    default:
      return null;
  }
}

export function isPromptitRuntimeRequest(
  value: unknown,
): value is PromptitRuntimeRequest {
  return parsePromptitRuntimeRequest(value) !== null;
}

export function isPromptMutationRequest(
  value: unknown,
): value is PromptMutationRequest {
  return parsePromptMutationRequest(value) !== null;
}

export function isPromptitRuntimeResponse(
  value: unknown,
): value is PromptitRuntimeResponse {
  return parsePromptitRuntimeResponse(value) !== null;
}

export function isPromptMutationResponse(
  value: unknown,
): value is PromptMutationResponse {
  return parsePromptMutationResponse(value) !== null;
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

  throw new Error('Received malformed Promptit runtime response.');
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled Promptit runtime contract: ${String(value)}`);
}

function parseCreatePromptRequest(
  value: Record<string, unknown>,
): CreatePromptRequest | null {
  const draft = parsePromptDraft(value.draft);

  if (!draft) {
    return null;
  }

  return buildCreatePromptRequest(draft);
}

function parseUpdatePromptRequest(
  value: Record<string, unknown>,
): UpdatePromptRequest | null {
  const id = parsePromptId(value.id);
  const expectedUpdatedAt = parseExpectedUpdatedAt(value.expectedUpdatedAt);
  const draft = parsePromptDraft(value.draft);

  if (!id || !expectedUpdatedAt || !draft) {
    return null;
  }

  return buildUpdatePromptRequest(id, draft, expectedUpdatedAt);
}

function parseDeletePromptRequest(
  value: Record<string, unknown>,
): DeletePromptRequest | null {
  const id = parsePromptId(value.id);
  const expectedUpdatedAt = parseExpectedUpdatedAt(value.expectedUpdatedAt);

  if (!id || !expectedUpdatedAt) {
    return null;
  }

  return buildDeletePromptRequest(id, expectedUpdatedAt);
}

function parseOpenOptionsPageResponse(
  value: Record<string, unknown>,
): OpenOptionsPageResponse | null {
  if (value.ok === true) {
    return buildOpenOptionsPageSuccessResponse();
  }

  if (
    value.ok === false &&
    value.code === 'open-options-failed' &&
    typeof value.message === 'string'
  ) {
    return buildOpenOptionsPageErrorResponse(value.message, value.code);
  }

  return null;
}

function parseCreatePromptResponse(
  value: Record<string, unknown>,
): CreatePromptResponse | null {
  if (value.ok === true && value.status === 'success') {
    const prompt = parsePromptItem(value.prompt);

    if (!prompt) {
      return null;
    }

    return buildCreatePromptSuccessResponse(prompt);
  }

  if (
    value.ok === false &&
    value.status === 'error' &&
    value.code === 'storage-failed' &&
    typeof value.message === 'string'
  ) {
    return buildCreatePromptErrorResponse(value.message, value.code);
  }

  return null;
}

function parseUpdatePromptResponse(
  value: Record<string, unknown>,
): UpdatePromptResponse | null {
  if (value.ok === true && value.status === 'success') {
    const prompt = parsePromptItem(value.prompt);

    if (!prompt) {
      return null;
    }

    return buildUpdatePromptSuccessResponse(prompt);
  }

  const id = parsePromptId(value.id);

  if (
    value.ok === false &&
    value.status === 'not-found' &&
    id &&
    typeof value.message === 'string'
  ) {
    return buildUpdatePromptNotFoundResponse(id, value.message);
  }

  const currentPrompt = parsePromptItem(value.currentPrompt);

  if (
    value.ok === false &&
    value.status === 'conflict' &&
    id &&
    typeof value.message === 'string' &&
    currentPrompt
  ) {
    if (currentPrompt.id !== id) {
      return null;
    }

    return buildUpdatePromptConflictResponse(
      id,
      currentPrompt,
      value.message,
    );
  }

  if (
    value.ok === false &&
    value.status === 'error' &&
    value.code === 'storage-failed' &&
    typeof value.message === 'string'
  ) {
    return buildUpdatePromptErrorResponse(value.message, value.code);
  }

  return null;
}

function parseDeletePromptResponse(
  value: Record<string, unknown>,
): DeletePromptResponse | null {
  const id = parsePromptId(value.id);

  if (value.ok === true && value.status === 'success' && id) {
    return buildDeletePromptSuccessResponse(id);
  }

  if (
    value.ok === false &&
    value.status === 'not-found' &&
    id &&
    typeof value.message === 'string'
  ) {
    return buildDeletePromptNotFoundResponse(id, value.message);
  }

  const currentPrompt = parsePromptItem(value.currentPrompt);

  if (
    value.ok === false &&
    value.status === 'conflict' &&
    id &&
    typeof value.message === 'string' &&
    currentPrompt
  ) {
    if (currentPrompt.id !== id) {
      return null;
    }

    return buildDeletePromptConflictResponse(
      id,
      currentPrompt,
      value.message,
    );
  }

  if (
    value.ok === false &&
    value.status === 'error' &&
    value.code === 'storage-failed' &&
    typeof value.message === 'string'
  ) {
    return buildDeletePromptErrorResponse(value.message, value.code);
  }

  return null;
}

function parsePromptId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1) {
    return null;
  }

  return value;
}

function parseExpectedUpdatedAt(value: unknown): string | null {
  if (!isValidPromptTimestamp(value)) {
    return null;
  }

  return value;
}

function buildPromptMutationErrorResponse<T extends PromptMutationMessageType>(
  type: T,
  message: string,
  code: PromptMutationErrorCode = 'storage-failed',
): PromptMutationErrorResponse<T> {
  return {
    type,
    ok: false,
    status: 'error',
    code,
    message,
  };
}

function buildExistingPromptMutationNotFoundResponse<
  T extends ExistingPromptMutationMessageType,
>(
  type: T,
  id: string,
  message: string,
): ExistingPromptMutationNotFoundResponse<T> {
  return {
    type,
    ok: false,
    status: 'not-found',
    id,
    message,
  };
}

function buildExistingPromptMutationConflictResponse<
  T extends ExistingPromptMutationMessageType,
>(
  type: T,
  id: string,
  currentPrompt: PromptItem,
  message: string,
): ExistingPromptMutationConflictResponse<T> {
  return {
    type,
    ok: false,
    status: 'conflict',
    id,
    message,
    currentPrompt,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
