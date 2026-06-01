import { PromptitRuntimeError } from '../prompt/storage';
import type * as promptStorage from '../prompt/storage';
import type { PromptMeta, PromptRecord } from '../prompt/schema';
import { type LocalizedMessageDescriptor } from '../shared/i18n';
import {
  getConflictRetryAlertMessage,
  getNotFoundCreateModeAlertMessage,
  getRuntimeResponseMessage,
  removePrompt,
  upsertPromptMeta,
  type NormalizedPromptForm,
} from './promptEditorState';

type SaveExistingPromptOperations = {
  updatePromptRecord: typeof promptStorage.updatePromptRecord;
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
      message: LocalizedMessageDescriptor;
      alertMessage: LocalizedMessageDescriptor;
    }
  | {
      status: 'not-found';
      prompts: PromptMeta[];
      alertMessage: LocalizedMessageDescriptor;
    };

export async function saveExistingPrompt(input: {
  promptId: string;
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt: string;
  form: NormalizedPromptForm;
  prompts: PromptMeta[];
  operations: SaveExistingPromptOperations;
}): Promise<SaveExistingPromptResult> {
  const {
    promptId,
    expectedUpdatedAt,
    expectedBodyUpdatedAt,
    form,
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
    const conflictMessage = getRuntimeResponseMessage(
      result,
      'runtime.prompt.updateConflict',
    );
    return {
      status: 'conflict',
      prompts: upsertPromptMeta(prompts, result.currentMeta),
      record: result.currentRecord,
      message: conflictMessage,
      alertMessage: getConflictRetryAlertMessage(conflictMessage),
    };
  }

  if (result.status === 'not-found') {
    const notFoundMessage = getRuntimeResponseMessage(
      result,
      'runtime.prompt.updateNotFound',
    );

    return {
      status: 'not-found',
      prompts: removePrompt(prompts, promptId),
      alertMessage: getNotFoundCreateModeAlertMessage(notFoundMessage),
    };
  }

  throw new PromptitRuntimeError(result.message, result.messageDescriptor);
}
