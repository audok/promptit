import type * as promptStorage from '../prompt/storage';
import type { PromptMeta, PromptRecord } from '../prompt/schema';
import {
  buildMetaDraft,
  didMetaDraftChange,
  didPinnedChange,
  getConflictRetryAlertMessage,
  getNotFoundCreateModeAlertMessage,
  mergeMetaIntoRecord,
  removePrompt,
  upsertPromptMeta,
  type NormalizedPromptForm,
} from './promptEditorState';

type SaveExistingPromptOperations = {
  setPromptPinned: typeof promptStorage.setPromptPinned;
  updatePromptMeta: typeof promptStorage.updatePromptMeta;
  updatePromptBody: typeof promptStorage.updatePromptBody;
  resolveConflictRecord: (
    meta: PromptMeta,
    fallback: PromptRecord | null,
  ) => Promise<PromptRecord>;
};

export type SaveExistingPromptResult =
  | {
      status: 'saved';
      prompts: PromptMeta[];
      record: PromptRecord;
    }
  | {
      status: 'conflict';
      prompts: PromptMeta[];
      record: PromptRecord;
      message: string;
      alertMessage: string;
    }
  | {
      status: 'not-found';
      prompts: PromptMeta[];
      alertMessage: string;
    };

export async function saveExistingPrompt(input: {
  promptId: string;
  expectedBodyUpdatedAt: string;
  form: NormalizedPromptForm;
  currentRecord: PromptRecord;
  prompts: PromptMeta[];
  operations: SaveExistingPromptOperations;
}): Promise<SaveExistingPromptResult> {
  const {
    promptId,
    expectedBodyUpdatedAt,
    form,
    currentRecord,
    prompts,
    operations,
  } = input;
  let nextRecord = currentRecord;
  let nextPrompts = prompts;

  if (didPinnedChange(form, currentRecord)) {
    const pinnedResult = await operations.setPromptPinned(
      promptId,
      form.pinned,
      {
        expectedUpdatedAt: nextRecord.updatedAt,
      },
    );

    if (pinnedResult.ok) {
      nextRecord = mergeMetaIntoRecord(nextRecord, pinnedResult.meta);
      nextPrompts = upsertPromptMeta(nextPrompts, pinnedResult.meta);
    } else if (pinnedResult.status === 'conflict') {
      return {
        status: 'conflict',
        prompts: upsertPromptMeta(prompts, pinnedResult.currentMeta),
        record: await operations.resolveConflictRecord(
          pinnedResult.currentMeta,
          currentRecord,
        ),
        message: pinnedResult.message,
        alertMessage: getConflictRetryAlertMessage(pinnedResult.message),
      };
    } else if (pinnedResult.status === 'not-found') {
      return {
        status: 'not-found',
        prompts: removePrompt(prompts, promptId),
        alertMessage: getNotFoundCreateModeAlertMessage(pinnedResult.message),
      };
    } else {
      throw new Error(pinnedResult.message);
    }
  }

  if (didMetaDraftChange(form, nextRecord)) {
    const metaResult = await operations.updatePromptMeta(
      promptId,
      buildMetaDraft(form),
      {
        expectedUpdatedAt: nextRecord.updatedAt,
      },
    );

    if (metaResult.ok) {
      nextRecord = mergeMetaIntoRecord(nextRecord, metaResult.meta);
      nextPrompts = upsertPromptMeta(nextPrompts, metaResult.meta);
    } else if (metaResult.status === 'conflict') {
      return {
        status: 'conflict',
        prompts: upsertPromptMeta(prompts, metaResult.currentMeta),
        record: await operations.resolveConflictRecord(
          metaResult.currentMeta,
          currentRecord,
        ),
        message: metaResult.message,
        alertMessage: getConflictRetryAlertMessage(metaResult.message),
      };
    } else if (metaResult.status === 'not-found') {
      return {
        status: 'not-found',
        prompts: removePrompt(prompts, promptId),
        alertMessage: getNotFoundCreateModeAlertMessage(metaResult.message),
      };
    } else {
      throw new Error(metaResult.message);
    }
  }

  if (form.content !== currentRecord.content) {
    const bodyResult = await operations.updatePromptBody(
      promptId,
      form.content,
      {
        expectedBodyUpdatedAt,
      },
    );

    if (bodyResult.ok) {
      nextRecord = bodyResult.prompt;
      nextPrompts = upsertPromptMeta(nextPrompts, nextRecord);
    } else if (bodyResult.status === 'conflict') {
      const conflictRecord =
        bodyResult.currentRecord ??
        await operations.resolveConflictRecord(
          bodyResult.currentMeta,
          currentRecord,
        );

      return {
        status: 'conflict',
        prompts: upsertPromptMeta(nextPrompts, bodyResult.currentMeta),
        record: conflictRecord,
        message: bodyResult.message,
        alertMessage: getConflictRetryAlertMessage(bodyResult.message),
      };
    } else if (bodyResult.status === 'not-found') {
      return {
        status: 'not-found',
        prompts: removePrompt(nextPrompts, promptId),
        alertMessage: getNotFoundCreateModeAlertMessage(bodyResult.message),
      };
    } else {
      throw new Error(bodyResult.message);
    }
  }

  return {
    status: 'saved',
    prompts: nextPrompts,
    record: nextRecord,
  };
}
