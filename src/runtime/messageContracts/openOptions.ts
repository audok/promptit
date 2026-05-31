import type { RuntimeMessageDescriptor } from '../../shared/i18n';
import { parseRuntimeMessageDescriptor } from './shared';

export const OPEN_OPTIONS_PAGE_MESSAGE = 'promptit/open-options-page';

export type OpenOptionsPageRequest = {
  type: typeof OPEN_OPTIONS_PAGE_MESSAGE;
};

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
  messageDescriptor?: RuntimeMessageDescriptor;
};

export type OpenOptionsPageResponse =
  | OpenOptionsPageSuccessResponse
  | OpenOptionsPageErrorResponse;

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
  messageDescriptor?: RuntimeMessageDescriptor,
): OpenOptionsPageErrorResponse {
  return {
    type: OPEN_OPTIONS_PAGE_MESSAGE,
    ok: false,
    code,
    message,
    messageDescriptor,
  };
}

export function parseOpenOptionsPageRequest(
  value: Record<string, unknown>,
): OpenOptionsPageRequest | null {
  return value.type === OPEN_OPTIONS_PAGE_MESSAGE
    ? buildOpenOptionsPageRequest()
    : null;
}

export function parseOpenOptionsPageResponse(
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
    return buildOpenOptionsPageErrorResponse(
      value.message,
      value.code,
      parseRuntimeMessageDescriptor(value.messageDescriptor),
    );
  }

  return null;
}
