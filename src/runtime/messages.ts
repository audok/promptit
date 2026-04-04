export const OPEN_OPTIONS_PAGE_MESSAGE = 'promptit/open-options-page';

export type OpenOptionsPageRequest = {
  type: typeof OPEN_OPTIONS_PAGE_MESSAGE;
};

export type PromptitRuntimeRequest = OpenOptionsPageRequest;

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

export type PromptitRuntimeResponse = OpenOptionsPageResponse;

// Backward-compatible alias for current callers while the sender/receiver
// migration moves to PromptitRuntimeRequest.
export type PromptitRuntimeMessage = PromptitRuntimeRequest;

export function buildOpenOptionsPageRequest(): OpenOptionsPageRequest {
  return {
    type: OPEN_OPTIONS_PAGE_MESSAGE,
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

export function parsePromptitRuntimeRequest(
  value: unknown,
): PromptitRuntimeRequest | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  switch (value.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      return buildOpenOptionsPageRequest();
    default:
      return null;
  }
}

export function parsePromptitRuntimeResponse(
  value: unknown,
): PromptitRuntimeResponse | null {
  if (!isObjectRecord(value) || value.type !== OPEN_OPTIONS_PAGE_MESSAGE) {
    return null;
  }

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

export function isPromptitRuntimeRequest(
  value: unknown,
): value is PromptitRuntimeRequest {
  return parsePromptitRuntimeRequest(value) !== null;
}

export function isPromptitRuntimeResponse(
  value: unknown,
): value is PromptitRuntimeResponse {
  return parsePromptitRuntimeResponse(value) !== null;
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
