import {
  PROMPT_REVISION_STORAGE_KEY,
  hasPromptDraftErrors,
  isValidPromptTimestamp,
  normalizePromptDraft,
  sortPromptMetas,
  toLegacyPromptItem,
  toPromptRecord,
  validatePromptDraft,
  type PromptBody,
  type PromptDraft,
  type PromptItem,
  type PromptMeta,
  type PromptMetaDraft,
  type PromptOrderGroup,
  type PromptRecord,
} from './schema';
import {
  buildCreatePromptRequest,
  buildDeletePromptRequest,
  buildGetPromptBodyRequest,
  buildListPromptMetasRequest,
  buildMovePromptRequest,
  buildSetPromptPinnedRequest,
  buildUpdatePromptBodyRequest,
  buildUpdatePromptMetaRequest,
  sendPromptitRuntimeRequest,
  type DeletePromptResponse as RuntimeDeletePromptResponse,
  type MovePromptResponse,
  type SetPromptPinnedResponse,
  type UpdatePromptBodyResponse,
  type UpdatePromptMetaResponse,
} from '../runtime/messages';

type PromptRecordWithLegacyOrder = PromptRecord & {
  sortOrder: number;
};

export type UpdatePromptOptions = {
  expectedUpdatedAt: string;
};

export type UpdatePromptBodyOptions = {
  expectedBodyUpdatedAt: string;
};

export type DeletePromptOptions = {
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt?: string;
};

export type MovePromptOptions = {
  expectedUpdatedAt: string;
  group?: PromptOrderGroup;
  previousId?: string | null;
  nextId?: string | null;
};

export type SetPromptPinnedOptions = {
  expectedUpdatedAt: string;
};

export type DeletePromptResponse =
  | RuntimeDeletePromptResponse
  | {
      ok: false;
      status: 'conflict';
      id: string;
      message: string;
      currentMeta: PromptMeta;
      currentPrompt: PromptItem;
    };

function hasRuntimeApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);
}

function hasStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function getPromptMetas(): Promise<PromptMeta[]> {
  const response = await sendRuntimeRequest(buildListPromptMetasRequest());

  if (response.type !== 'promptit/list-prompt-metas') {
    throw new Error('Received mismatched prompt metas response.');
  }

  if (!response.ok) {
    throw new Error(response.message);
  }

  return sortPromptMetas(response.metas);
}

export async function getPromptBody(id: string): Promise<PromptBody> {
  const response = await sendRuntimeRequest(buildGetPromptBodyRequest(id));

  if (response.type !== 'promptit/get-prompt-body') {
    throw new Error('Received mismatched prompt body response.');
  }

  if (!response.ok) {
    throw new Error(response.message);
  }

  return response.body;
}

export async function getPromptRecord(id: string): Promise<PromptRecord> {
  const metas = await getPromptMetas();
  const meta = metas.find((item) => item.id === id) ?? null;

  if (!meta) {
    throw new Error('프롬프트를 찾지 못했습니다.');
  }

  const body = await getPromptBody(id);
  return toPromptRecord(meta, body);
}

export async function createPrompt(
  draft: PromptDraft,
): Promise<PromptRecordWithLegacyOrder> {
  const validatedDraft = getValidatedDraft(draft);
  const response = await sendRuntimeRequest(
    buildCreatePromptRequest(validatedDraft),
  );

  if (response.type !== 'promptit/create-prompt') {
    throw new Error('Received mismatched prompt create response.');
  }

  if (!response.ok) {
    throw new Error(response.message);
  }

  return withLegacyOrder(response.prompt);
}

export async function updatePromptMeta(
  id: string,
  draft: PromptMetaDraft,
  options: UpdatePromptOptions,
): Promise<UpdatePromptMetaResponse> {
  validateExpectedUpdatedAt(options.expectedUpdatedAt);

  const response = await sendRuntimeRequest(
    buildUpdatePromptMetaRequest(id, draft, options.expectedUpdatedAt),
  );

  if (response.type !== 'promptit/update-prompt-meta') {
    throw new Error('Received mismatched prompt meta update response.');
  }

  return response;
}

export async function updatePromptBody(
  id: string,
  content: string,
  options: UpdatePromptBodyOptions,
): Promise<UpdatePromptBodyResponse> {
  validateExpectedUpdatedAt(options.expectedBodyUpdatedAt);

  const response = await sendRuntimeRequest(
    buildUpdatePromptBodyRequest(id, content, options.expectedBodyUpdatedAt),
  );

  if (response.type !== 'promptit/update-prompt-body') {
    throw new Error('Received mismatched prompt body update response.');
  }

  return response;
}

export async function deletePrompt(
  id: string,
  options: DeletePromptOptions,
): Promise<DeletePromptResponse> {
  validateExpectedUpdatedAt(options.expectedUpdatedAt);
  validateExpectedUpdatedAt(options.expectedBodyUpdatedAt);

  const response = await sendRuntimeRequest(
    buildDeletePromptRequest(
      id,
      options.expectedUpdatedAt,
      options.expectedBodyUpdatedAt,
    ),
  );

  if (response.type !== 'promptit/delete-prompt') {
    throw new Error('Received mismatched prompt delete response.');
  }

  if (response.status === 'conflict') {
    return {
      ...response,
      currentPrompt: await getLegacyPromptFromMeta(response.currentMeta),
    };
  }

  return response;
}

export async function movePrompt(
  id: string,
  request: MovePromptOptions,
): Promise<MovePromptResponse> {
  validateExpectedUpdatedAt(request.expectedUpdatedAt);

  const response = await sendRuntimeRequest(
    buildMovePromptRequest(id, request),
  );

  if (response.type !== 'promptit/move-prompt') {
    throw new Error('Received mismatched prompt move response.');
  }

  return response;
}

export async function setPromptPinned(
  id: string,
  pinned: boolean,
  options: SetPromptPinnedOptions,
): Promise<SetPromptPinnedResponse> {
  validateExpectedUpdatedAt(options.expectedUpdatedAt);

  const response = await sendRuntimeRequest(
    buildSetPromptPinnedRequest(id, pinned, options.expectedUpdatedAt),
  );

  if (response.type !== 'promptit/set-prompt-pinned') {
    throw new Error('Received mismatched prompt pin response.');
  }

  return response;
}

export function subscribeToPromptMetas(
  listener: (metas: PromptMeta[]) => void,
): () => void {
  if (!hasStorageApi()) {
    return () => {};
  }

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !(PROMPT_REVISION_STORAGE_KEY in changes)) {
      return;
    }

    void getPromptMetas()
      .then(listener)
      .catch((error) => {
        console.error('[promptit] Failed to refresh prompt metadata.', error);
      });
  };

  chrome.storage.onChanged.addListener(handleChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleChange);
  };
}

async function getLegacyPromptFromMeta(meta: PromptMeta): Promise<PromptItem> {
  const body = await getPromptBody(meta.id);
  return toLegacyPromptItem(toPromptRecord(meta, body));
}

function withLegacyOrder(record: PromptRecord): PromptRecordWithLegacyOrder {
  return {
    ...record,
    sortOrder: record.normalOrder,
  };
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

function validateExpectedUpdatedAt(value: string | undefined): void {
  if (typeof value !== 'undefined' && !isValidPromptTimestamp(value)) {
    throw new Error('Invalid prompt updatedAt timestamp.');
  }
}

async function sendRuntimeRequest(
  request: Parameters<typeof sendPromptitRuntimeRequest>[1],
): ReturnType<typeof sendPromptitRuntimeRequest> {
  if (!hasRuntimeApi()) {
    throw new Error('Prompt runtime is unavailable.');
  }

  return sendPromptitRuntimeRequest(
    (nextRequest) => chrome.runtime.sendMessage(nextRequest) as Promise<unknown>,
    request,
  );
}
