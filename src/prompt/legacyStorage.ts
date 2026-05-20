import {
  hasPromptDraftErrors,
  normalizePromptDraft,
  sortPrompts,
  toLegacyPromptItem,
  toPromptRecord,
  validatePromptDraft,
  type PromptDraft,
  type PromptItem,
  type PromptMeta,
  type PromptRecord,
} from './schema';
import {
  getPromptBody,
  getPromptMetas,
  getPromptRecord,
  subscribeToPromptMetas,
  updatePromptBody,
  updatePromptMeta,
  type UpdatePromptOptions,
} from './runtimeStorageClient';

const UPDATE_PROMPT_NOT_FOUND_MESSAGE = '수정할 프롬프트를 찾지 못했습니다.';

export type LegacyUpdatePromptResponse =
  | {
      ok: true;
      status: 'success';
      prompt: PromptItem;
    }
  | {
      ok: false;
      status: 'not-found';
      id: string;
      message: string;
    }
  | {
      ok: false;
      status: 'conflict';
      id: string;
      message: string;
      currentPrompt: PromptItem;
    }
  | {
      ok: false;
      status: 'error';
      message: string;
    };

export async function getPrompts(): Promise<PromptItem[]> {
  return getLegacyPromptItems();
}

export async function getUserPrompts(): Promise<PromptItem[]> {
  return getLegacyPromptItems();
}

export async function updatePrompt(
  id: string,
  draft: PromptDraft,
  options?: UpdatePromptOptions,
): Promise<LegacyUpdatePromptResponse> {
  const validatedDraft = getValidatedDraft(draft);
  const currentRecord = await getLegacyPromptRecordOrNull(id);

  if (!currentRecord) {
    return {
      ok: false,
      status: 'not-found',
      id,
      message: UPDATE_PROMPT_NOT_FOUND_MESSAGE,
    };
  }

  const metaChanged =
    currentRecord.title !== validatedDraft.title ||
    (typeof validatedDraft.sortOrder === 'number' &&
      currentRecord.normalOrder !== validatedDraft.sortOrder);
  const bodyChanged = currentRecord.content !== validatedDraft.content;
  let nextRecord = currentRecord;

  if (metaChanged) {
    const metaResponse = await updatePromptMeta(
      id,
      {
        title: validatedDraft.title,
        normalOrder:
          typeof validatedDraft.sortOrder === 'number'
            ? validatedDraft.sortOrder
            : currentRecord.normalOrder,
      },
      {
        expectedUpdatedAt: options?.expectedUpdatedAt ?? currentRecord.updatedAt,
      },
    );

    if (metaResponse.status === 'not-found') {
      return metaResponse;
    }

    if (metaResponse.status === 'conflict') {
      return {
        ok: false,
        status: 'conflict',
        id,
        message: metaResponse.message,
        currentPrompt: await getLegacyPromptFromMeta(metaResponse.currentMeta),
      };
    }

    if (!metaResponse.ok) {
      return {
        ok: false,
        status: 'error',
        message: metaResponse.message,
      };
    }

    nextRecord = toPromptRecord(metaResponse.meta, {
      id,
      content: nextRecord.content,
      updatedAt: nextRecord.bodyUpdatedAt,
    });
  }

  if (bodyChanged) {
    const bodyResponse = await updatePromptBody(id, validatedDraft.content, {
      expectedBodyUpdatedAt: currentRecord.bodyUpdatedAt,
    });

    if (bodyResponse.status === 'not-found') {
      return bodyResponse;
    }

    if (bodyResponse.status === 'conflict') {
      return {
        ok: false,
        status: 'conflict',
        id,
        message: bodyResponse.message,
        currentPrompt: bodyResponse.currentRecord
          ? toLegacyPromptItem(bodyResponse.currentRecord)
          : await getLegacyPromptFromMeta(bodyResponse.currentMeta),
      };
    }

    if (!bodyResponse.ok) {
      return {
        ok: false,
        status: 'error',
        message: bodyResponse.message,
      };
    }

    nextRecord = bodyResponse.prompt;
  }

  return {
    ok: true,
    status: 'success',
    prompt: toLegacyPromptItem(nextRecord),
  };
}

export function subscribeToPrompts(
  listener: (prompts: PromptItem[]) => void,
): () => void {
  return subscribeToPromptMetas(() => {
    void getLegacyPromptItems()
      .then(listener)
      .catch((error) => {
        console.error('[promptit] Failed to refresh prompts.', error);
      });
  });
}

async function getLegacyPromptFromMeta(meta: PromptMeta): Promise<PromptItem> {
  const body = await getPromptBody(meta.id);
  return toLegacyPromptItem(toPromptRecord(meta, body));
}

async function getLegacyPromptItems(): Promise<PromptItem[]> {
  const metas = await getPromptMetas();
  const records: PromptRecord[] = [];

  for (const meta of metas) {
    try {
      records.push(toPromptRecord(meta, await getPromptBody(meta.id)));
    } catch (error) {
      console.warn(
        `[promptit] Skipping legacy prompt compatibility record with unreadable body: ${meta.id}`,
        error,
      );
    }
  }

  return sortPrompts(records.map(toLegacyPromptItem));
}

async function getLegacyPromptRecordOrNull(
  id: string,
): Promise<PromptRecord | null> {
  try {
    return await getPromptRecord(id);
  } catch {
    return null;
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
