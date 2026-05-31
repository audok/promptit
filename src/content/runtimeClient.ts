import type { PromptMeta } from '../prompt/schema';
import {
  PromptitRuntimeError,
  getPromptBody,
  getPromptMetas,
  setPromptPinned,
  subscribeToPromptMetas,
} from '../prompt/storage';
import {
  OPEN_OPTIONS_PAGE_MESSAGE,
  buildOpenOptionsPageRequest,
  parsePromptitRuntimeResponse,
} from '../runtime/messages';
import {
  prepareOpenOptionsFailureForTest,
  shouldFailPromptBodyReadForTest,
  shouldFailPromptReadForTest,
  waitForDeferredPromptBodyRead,
} from './testControls';

export class PromptBodyReadError extends Error {
  constructor() {
    super('Prompt body read failed.');
    this.name = 'PromptBodyReadError';
    Object.setPrototypeOf(this, PromptBodyReadError.prototype);
  }
}

export function isPromptBodyReadError(
  error: unknown,
): error is PromptBodyReadError {
  return error instanceof PromptBodyReadError;
}

export function isPromptitRuntimeError(
  error: unknown,
): error is PromptitRuntimeError {
  return error instanceof PromptitRuntimeError;
}

export function subscribeToContentPromptMetas(
  listener: (metas: PromptMeta[]) => void,
): () => void {
  return subscribeToPromptMetas((metas) => {
    listener(metas);
  });
}

export async function readPromptMetasForContentTrigger(): Promise<PromptMeta[]> {
  if (shouldFailPromptReadForTest()) {
    throw new Error('mock prompt read failure');
  }

  return await getPromptMetas();
}

export async function readPromptBodyContentForContentAction(
  id: string,
): Promise<string> {
  try {
    if (shouldFailPromptBodyReadForTest()) {
      throw new Error('mock prompt body read failure');
    }

    await waitForDeferredPromptBodyRead();

    const body = await getPromptBody(id);
    return body.content;
  } catch (error) {
    console.error('[promptit] Failed to read prompt body for popup action.', error);
    throw new PromptBodyReadError();
  }
}

export async function setPromptPinnedFromContent(
  id: string,
  pinned: boolean,
  options: { expectedUpdatedAt: string },
) {
  return await setPromptPinned(id, pinned, options);
}

export async function requestOpenOptionsPageFromContent(): Promise<void> {
  await prepareOpenOptionsFailureForTest();

  const response = parsePromptitRuntimeResponse(
    await chrome.runtime.sendMessage(buildOpenOptionsPageRequest()) as unknown,
  );

  if (!response) {
    throw new Error('Invalid open options response.');
  }

  switch (response.type) {
    case OPEN_OPTIONS_PAGE_MESSAGE:
      if (!response.ok) {
        throw new PromptitRuntimeError(
          response.message,
          response.messageDescriptor,
        );
      }
      return;
  }
}
