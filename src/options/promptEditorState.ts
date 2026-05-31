import {
  normalizePromptDraft,
  sortPromptMetas,
  validatePromptDraftMessages,
  type PromptDraft,
  type PromptMeta,
  type PromptOrderGroup,
  type PromptRecord,
} from '../prompt/schema';
import {
  describeMessage,
  isI18nKey,
  type I18nKey,
  type LocalizedMessageDescriptor,
  type RuntimeMessageDescriptor,
} from '../shared/i18n';

export const LOAD_ERROR_MESSAGE = describeMessage('options.error.loadPrompts');
export const BODY_LOAD_ERROR_MESSAGE = describeMessage(
  'options.error.loadPromptBody',
);
export const SAVE_ERROR_MESSAGE = describeMessage('options.error.savePrompt');
export const DELETE_ERROR_MESSAGE = describeMessage(
  'options.error.deletePrompt',
);
export const REORDER_ERROR_MESSAGE = describeMessage(
  'options.error.reorderPrompt',
);
export const PIN_ERROR_MESSAGE = describeMessage('options.error.pinPrompt');
export const PROMPT_CREATED_MESSAGE = describeMessage(
  'options.toast.promptCreated',
);
export const PROMPT_UPDATED_MESSAGE = describeMessage(
  'options.toast.promptUpdated',
);
export const PROMPT_DELETED_MESSAGE = describeMessage(
  'options.toast.promptDeleted',
);
export const PROMPT_PINNED_MESSAGE = describeMessage(
  'options.toast.promptPinned',
);
export const PROMPT_UNPINNED_MESSAGE = describeMessage(
  'options.toast.promptUnpinned',
);
export const UPDATE_NOT_FOUND_MESSAGE = describeMessage(
  'options.alert.updateNotFoundCreateMode',
);
export const DELETE_NOT_FOUND_CREATE_MODE_MESSAGE = describeMessage(
  'options.alert.deleteNotFoundCreateMode',
);
export const PIN_NOT_FOUND_CREATE_MODE_MESSAGE = describeMessage(
  'options.alert.pinNotFoundCreateMode',
);
export const DELETE_RECOVERY_MESSAGE = describeMessage(
  'options.notice.deleteRecoveryCreateMode',
);
export const EXTERNAL_CHANGE_MESSAGE = describeMessage(
  'options.alert.externalChange',
);

export type PromptFormState = {
  title: string;
  content: string;
  pinned: boolean;
};

export type PromptFormErrors = Partial<
  Record<Exclude<keyof PromptFormState, 'pinned'>, LocalizedMessageDescriptor>
>;

export type PromptMovePlacement = 'before' | 'after';

export type PromptEditorLoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: LocalizedMessageDescriptor };

export type PromptEditorBodyLoadState =
  | { status: 'idle' }
  | { status: 'loading'; promptId: string }
  | {
      status: 'error';
      promptId: string;
      message: LocalizedMessageDescriptor;
    };

export type PromptEditorSaveState =
  | { status: 'idle' }
  | { status: 'saving' };

export type PromptEditorMode =
  | { kind: 'create' }
  | {
      kind: 'edit';
      promptId: string;
      expectedUpdatedAt: string;
      expectedBodyUpdatedAt: string;
    };

export type PromptEditorConflictState =
  | { status: 'idle' }
  | {
      status: 'stale';
      reason: 'external-update' | 'save-conflict' | 'delete-conflict';
      promptId: string;
      message: LocalizedMessageDescriptor;
      currentPrompt: PromptMeta;
    };

export type NormalizedPromptForm = {
  title: string;
  content: string;
  pinned: boolean;
};

export type ParsedPromptForm =
  | { ok: true; form: NormalizedPromptForm }
  | { ok: false; errors: PromptFormErrors };

export type PromptMovePlan = {
  draggedPrompt: PromptMeta;
  group: PromptOrderGroup;
  previousId: string | null;
  nextId: string | null;
};

export type EditSubmitBlockReason = 'body-load-active' | 'missing-active-prompt';

export function createEmptyForm(): PromptFormState {
  return {
    title: '',
    content: '',
    pinned: false,
  };
}

export function createLoadingFormFromMeta(
  prompt: PromptMeta,
): PromptFormState {
  return {
    title: prompt.title,
    content: '',
    pinned: prompt.pinned,
  };
}

export function createFormFromPrompt(
  prompt: PromptRecord,
): PromptFormState {
  return {
    title: prompt.title,
    content: prompt.content,
    pinned: prompt.pinned,
  };
}

export function upsertPromptMeta(
  prompts: PromptMeta[],
  prompt: PromptMeta,
): PromptMeta[] {
  return sortPromptMetas([
    ...prompts.filter((item) => item.id !== prompt.id),
    prompt,
  ]);
}

export function removePrompt(
  prompts: PromptMeta[],
  id: string,
): PromptMeta[] {
  return prompts.filter((prompt) => prompt.id !== id);
}

export function getPromptGroup(prompt: PromptMeta): PromptOrderGroup {
  return prompt.pinned ? 'pinned' : 'normal';
}

export function buildPromptMovePlan(
  prompts: PromptMeta[],
  id: string,
  targetId: string,
  placement: PromptMovePlacement,
): PromptMovePlan | null {
  if (id === targetId) {
    return null;
  }

  const sortedPrompts = sortPromptMetas(prompts);
  const draggedPrompt =
    sortedPrompts.find((prompt) => prompt.id === id) ?? null;
  const targetPrompt =
    sortedPrompts.find((prompt) => prompt.id === targetId) ?? null;

  if (
    !draggedPrompt ||
    !targetPrompt ||
    draggedPrompt.pinned !== targetPrompt.pinned
  ) {
    return null;
  }

  const groupPrompts = sortedPrompts.filter(
    (prompt) => prompt.pinned === draggedPrompt.pinned,
  );
  const currentIndex = groupPrompts.findIndex((prompt) => prompt.id === id);
  const groupWithoutDragged = groupPrompts.filter((prompt) => prompt.id !== id);
  const targetIndex = groupWithoutDragged.findIndex(
    (prompt) => prompt.id === targetId,
  );

  if (currentIndex < 0 || targetIndex < 0) {
    return null;
  }

  const insertionIndex = placement === 'before' ? targetIndex : targetIndex + 1;
  const nextGroupPrompts = [...groupWithoutDragged];
  nextGroupPrompts.splice(insertionIndex, 0, draggedPrompt);

  const nextIndex = nextGroupPrompts.findIndex((prompt) => prompt.id === id);

  if (nextIndex === currentIndex) {
    return null;
  }

  return {
    draggedPrompt,
    group: getPromptGroup(draggedPrompt),
    previousId: nextGroupPrompts[nextIndex - 1]?.id ?? null,
    nextId: nextGroupPrompts[nextIndex + 1]?.id ?? null,
  };
}

export function parsePromptForm(form: PromptFormState): ParsedPromptForm {
  const normalizedDraft = normalizePromptDraft({
    title: form.title,
    content: form.content,
    pinned: form.pinned,
  });
  const draftErrors = validatePromptDraftMessages(normalizedDraft);
  const errors: PromptFormErrors = {
    title: draftErrors.title,
    content: draftErrors.content,
  };

  if (hasPromptFormErrors(errors)) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    form: {
      title: normalizedDraft.title,
      content: normalizedDraft.content,
      pinned: form.pinned,
    },
  };
}

export function buildCreateDraft(
  form: NormalizedPromptForm,
): PromptDraft {
  return {
    title: form.title,
    content: form.content,
    pinned: form.pinned,
  };
}

export function mergeMetaIntoRecord(
  current: PromptRecord,
  meta: PromptMeta,
): PromptRecord {
  return {
    ...current,
    ...meta,
  };
}

export function getLoadErrorMessage(
  error: unknown,
): LocalizedMessageDescriptor {
  return {
    ...LOAD_ERROR_MESSAGE,
    fallback: getCaughtErrorMessage(error, LOAD_ERROR_MESSAGE).fallback,
  };
}

export function getConflictRetryAlertMessage(
  message: LocalizedMessageDescriptor,
): LocalizedMessageDescriptor {
  if (
    message.key === 'runtime.prompt.updateConflict' ||
    message.key === 'runtime.prompt.deleteConflict' ||
    message.key === 'runtime.prompt.pinConflict'
  ) {
    return message;
  }

  return describeMessage('options.alert.conflictRetry', {
    message: message.fallback,
  });
}

export function getNotFoundCreateModeAlertMessage(
  message: LocalizedMessageDescriptor,
): LocalizedMessageDescriptor {
  switch (message.key) {
    case 'runtime.prompt.updateNotFound':
      return UPDATE_NOT_FOUND_MESSAGE;
    case 'runtime.prompt.deleteNotFound':
      return DELETE_NOT_FOUND_CREATE_MODE_MESSAGE;
    case 'runtime.prompt.pinNotFound':
      return PIN_NOT_FOUND_CREATE_MODE_MESSAGE;
    default:
      return describeMessage('options.alert.notFoundCreateMode', {
        message: message.fallback,
      });
  }
}

export function getEditSubmitBlockReason(
  mode: PromptEditorMode,
  bodyLoadState: PromptEditorBodyLoadState,
  activePrompt: PromptRecord | null,
): EditSubmitBlockReason | null {
  if (mode.kind !== 'edit') {
    return null;
  }

  const bodyStateMatchesPrompt =
    bodyLoadState.status !== 'idle' &&
    bodyLoadState.promptId === mode.promptId;

  if (bodyStateMatchesPrompt) {
    return 'body-load-active';
  }

  if (activePrompt === null) {
    return 'missing-active-prompt';
  }

  return null;
}

export function getRuntimeResponseMessage(
  response: {
    message: string;
    messageDescriptor?: RuntimeMessageDescriptor;
  },
  fallbackKey: I18nKey,
): LocalizedMessageDescriptor {
  const fallbackMessage = describeMessage(fallbackKey);
  const fallback =
    response.message.trim().length > 0
      ? response.message
      : fallbackMessage.fallback;

  if (response.messageDescriptor && isI18nKey(response.messageDescriptor.key)) {
    return {
      key: response.messageDescriptor.key,
      values: response.messageDescriptor.values,
      fallback,
    };
  }

  return {
    ...fallbackMessage,
    fallback,
  };
}

export function getCaughtErrorMessage(
  error: unknown,
  fallbackMessage: LocalizedMessageDescriptor,
): LocalizedMessageDescriptor {
  const message = error instanceof Error ? error.message.trim() : '';
  const messageDescriptor = getErrorMessageDescriptor(error);

  if (messageDescriptor) {
    return {
      key: messageDescriptor.key,
      values: messageDescriptor.values,
      fallback: message.length > 0 ? message : fallbackMessage.fallback,
    };
  }

  if (message.length > 0) {
    return {
      ...fallbackMessage,
      fallback: message,
    };
  }

  return fallbackMessage;
}

function getErrorMessageDescriptor(
  error: unknown,
): RuntimeMessageDescriptor | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('messageDescriptor' in error)
  ) {
    return undefined;
  }

  const descriptor = (error as { messageDescriptor?: unknown })
    .messageDescriptor;

  if (
    typeof descriptor !== 'object' ||
    descriptor === null ||
    !('key' in descriptor) ||
    !isI18nKey((descriptor as { key?: unknown }).key)
  ) {
    return undefined;
  }

  const values = (descriptor as { values?: unknown }).values;

  if (typeof values === 'undefined') {
    return {
      key: (descriptor as { key: I18nKey }).key,
    };
  }

  if (typeof values !== 'object' || values === null) {
    return undefined;
  }

  const parsedValues: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return undefined;
    }

    parsedValues[key] = value;
  }

  return {
    key: (descriptor as { key: I18nKey }).key,
    values: parsedValues,
  };
}

function hasPromptFormErrors(errors: PromptFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}
