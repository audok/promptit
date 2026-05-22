import type * as promptStorage from '../prompt/storage';
import type { PromptMeta, PromptRecord } from '../prompt/schema';
import {
  getConflictRetryAlertMessage,
  getNotFoundCreateModeAlertMessage,
  removePrompt,
  upsertPromptMeta,
  type NormalizedPromptForm,
} from './promptEditorState';

type SaveExistingPromptOperations = {
  updatePromptRecord: typeof promptStorage.updatePromptRecord;
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
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt: string;
  form: NormalizedPromptForm;
  currentRecord: PromptRecord;
  prompts: PromptMeta[];
  operations: SaveExistingPromptOperations;
}): Promise<SaveExistingPromptResult> {
  const {
    promptId,
    expectedUpdatedAt,
    expectedBodyUpdatedAt,
    form,
    currentRecord,
    prompts,
    operations,
  } = input;

  const result = await operations.updatePromptRecord(
    promptId,
    {
      title: form.title,
      content: form.content,
      pinned: form.pinned,
    },
    {
      expectedUpdatedAt,
      expectedBodyUpdatedAt,
    },
  );

  if (result.ok) {
    return {
      status: 'saved',
      prompts: upsertPromptMeta(prompts, result.prompt),
      record: result.prompt,
    };
  }

  if (result.status === 'conflict') {
    const conflictRecord =
      result.currentRecord ??
      await operations.resolveConflictRecord(result.currentMeta, currentRecord);

    return {
      status: 'conflict',
      prompts: upsertPromptMeta(prompts, result.currentMeta),
      record: conflictRecord,
      message: result.message,
      alertMessage: getConflictRetryAlertMessage(result.message),
    };
  }

  if (result.status === 'not-found') {
    return {
      status: 'not-found',
      prompts: removePrompt(prompts, promptId),
      alertMessage: getNotFoundCreateModeAlertMessage(result.message),
    };
  }

  throw new Error(result.message);
}
