import {
  sortPromptMetas,
  type PromptMeta,
  type PromptRecord,
} from '../prompt/schema';
import { type PromptMetasSubscriptionEvent } from '../prompt/runtimeStorageClient';
import { type LocalizedMessageDescriptor } from '../shared/i18n';
import {
  DELETE_RECOVERY_MESSAGE,
  EXTERNAL_CHANGE_MESSAGE,
  PROMPT_CREATED_MESSAGE,
  PROMPT_DELETED_MESSAGE,
  PROMPT_PINNED_MESSAGE,
  PROMPT_UNPINNED_MESSAGE,
  PROMPT_UPDATED_MESSAGE,
  UPDATE_NOT_FOUND_MESSAGE,
  createEmptyForm,
  createFormFromPrompt,
  createLoadingFormFromMeta,
  mergeMetaIntoRecord,
  removePrompt,
  upsertPromptMeta,
  type PromptEditorBodyLoadState,
  type PromptEditorConflictState,
  type PromptEditorLoadState,
  type PromptEditorMode,
  type PromptEditorSaveState,
  type PromptFormErrors,
  type PromptFormState,
} from './promptEditorState';

export type PromptEditorState = {
  prompts: PromptMeta[];
  activePrompt: PromptRecord | null;
  loadState: PromptEditorLoadState;
  bodyLoadState: PromptEditorBodyLoadState;
  saveState: PromptEditorSaveState;
  mode: PromptEditorMode;
  form: PromptFormState;
  errors: PromptFormErrors;
  notice: LocalizedMessageDescriptor | null;
  alertMessage: LocalizedMessageDescriptor | null;
  conflictState: PromptEditorConflictState;
  isDirty: boolean;
};

export type SavedPromptEcho = {
  promptId: string;
  updatedAt: string;
  bodyUpdatedAt: string;
};

export type IncomingPromptEffect =
  | { type: 'none' }
  | { type: 'load-record'; prompt: PromptMeta };

export type PromptEditorAction =
  | { type: 'clear-alert-message' }
  | { type: 'clear-notice' }
  | { type: 'move-to-create-mode' }
  | { type: 'start-create-mode' }
  | {
      type: 'sync-editing-prompt';
      prompt: PromptRecord;
    }
  | {
      type: 'body-load-started';
      prompt: PromptMeta;
      preserveDirtyDraftOnFailure: boolean;
    }
  | {
      type: 'body-load-failed';
      promptId: string;
      message: LocalizedMessageDescriptor;
    }
  | {
      type: 'incoming-prompts-received';
      prompts: PromptMeta[];
      event?: PromptMetasSubscriptionEvent;
      savedPromptEcho: SavedPromptEcho | null;
      savingPromptId: string | null;
    }
  | {
      type: 'load-prompts-failed';
      message: LocalizedMessageDescriptor;
    }
  | {
      type: 'field-updated';
      field: keyof PromptFormState;
      value: string | boolean;
    }
  | { type: 'submit-attempted' }
  | {
      type: 'submit-blocked';
      alertMessage: LocalizedMessageDescriptor | null;
    }
  | {
      type: 'validation-failed';
      errors: PromptFormErrors;
    }
  | { type: 'save-started' }
  | { type: 'save-finished' }
  | {
      type: 'save-failed';
      message: LocalizedMessageDescriptor;
    }
  | {
      type: 'editing-prompt-missing-on-save';
      promptId: string;
    }
  | {
      type: 'existing-prompt-save-conflicted';
      prompts: PromptMeta[];
      record: PromptRecord;
      message: LocalizedMessageDescriptor;
      alertMessage: LocalizedMessageDescriptor;
    }
  | {
      type: 'existing-prompt-save-not-found';
      prompts: PromptMeta[];
      alertMessage: LocalizedMessageDescriptor;
    }
  | {
      type: 'existing-prompt-save-succeeded';
      prompts: PromptMeta[];
      record: PromptRecord;
    }
  | {
      type: 'prompt-create-succeeded';
      prompt: PromptRecord;
    }
  | {
      type: 'mutation-started';
      clearAlert: boolean;
    }
  | {
      type: 'prompt-move-succeeded';
      id: string;
      meta: PromptMeta;
      activeMode: PromptEditorMode;
    }
  | {
      type: 'prompt-pin-succeeded';
      id: string;
      meta: PromptMeta;
      activeMode: PromptEditorMode;
    }
  | {
      type: 'prompt-meta-conflicted';
      id: string;
      meta: PromptMeta;
      activeMode: PromptEditorMode;
      alertMessage: LocalizedMessageDescriptor;
    }
  | {
      type: 'prompt-meta-not-found';
      id: string;
      activeMode: PromptEditorMode;
      activePromptAlertMessage: LocalizedMessageDescriptor;
      inactivePromptAlertMessage: LocalizedMessageDescriptor;
    }
  | {
      type: 'prompt-delete-succeeded';
      id: string;
      activeMode: PromptEditorMode;
    }
  | {
      type: 'prompt-delete-conflict-body-load-failed';
      prompts: PromptMeta[];
      alertMessage: LocalizedMessageDescriptor;
    }
  | {
      type: 'prompt-delete-conflicted';
      prompts: PromptMeta[];
      record: PromptRecord;
      message: LocalizedMessageDescriptor;
      alertMessage: LocalizedMessageDescriptor;
    }
  | {
      type: 'prompt-delete-not-found';
      id: string;
      activeMode: PromptEditorMode;
      activePromptAlertMessage: LocalizedMessageDescriptor;
      inactivePromptAlertMessage: LocalizedMessageDescriptor;
    };

export function createInitialPromptEditorState(): PromptEditorState {
  return {
    prompts: [],
    activePrompt: null,
    loadState: { status: 'loading' },
    bodyLoadState: { status: 'idle' },
    saveState: { status: 'idle' },
    mode: { kind: 'create' },
    form: createEmptyForm(),
    errors: {},
    notice: null,
    alertMessage: null,
    conflictState: { status: 'idle' },
    isDirty: false,
  };
}

export function getIncomingPromptEffect(input: {
  state: PromptEditorState;
  prompts: PromptMeta[];
  event?: PromptMetasSubscriptionEvent;
  savedPromptEcho: SavedPromptEcho | null;
  savingPromptId: string | null;
}): IncomingPromptEffect {
  const { state, event, savedPromptEcho, savingPromptId } = input;
  const sortedPrompts = sortPromptMetas(input.prompts);

  if (state.mode.kind === 'create') {
    return { type: 'none' };
  }

  const currentMode = state.mode;
  const currentPrompt =
    sortedPrompts.find((prompt) => prompt.id === currentMode.promptId) ?? null;

  if (!currentPrompt) {
    return { type: 'none' };
  }

  if (event?.reason === 'records-replaced') {
    if (state.isDirty) {
      return { type: 'none' };
    }

    return { type: 'load-record', prompt: currentPrompt };
  }

  if (!hasPromptTimestampChanged(currentMode, currentPrompt)) {
    return { type: 'none' };
  }

  if (!state.isDirty) {
    return { type: 'load-record', prompt: currentPrompt };
  }

  if (
    savedPromptEcho &&
    savedPromptEcho.promptId === currentMode.promptId &&
    savedPromptEcho.updatedAt === currentPrompt.updatedAt &&
    savedPromptEcho.bodyUpdatedAt === currentPrompt.bodyUpdatedAt
  ) {
    return { type: 'none' };
  }

  if (savingPromptId === currentMode.promptId) {
    return { type: 'none' };
  }

  return { type: 'none' };
}

export function shouldInvalidateBodyLoadForIncomingPrompts(input: {
  state: PromptEditorState;
  prompts: PromptMeta[];
}): boolean {
  const { state } = input;

  if (state.mode.kind === 'create') {
    return !state.isDirty;
  }

  const currentMode = state.mode;

  return !input.prompts.some((prompt) => prompt.id === currentMode.promptId);
}

export function promptEditorReducer(
  state: PromptEditorState,
  action: PromptEditorAction,
): PromptEditorState {
  switch (action.type) {
    case 'clear-alert-message':
      return {
        ...state,
        alertMessage: null,
      };

    case 'clear-notice':
      return {
        ...state,
        notice: null,
      };

    case 'move-to-create-mode':
      return moveToCreateMode(state);

    case 'start-create-mode':
      return {
        ...moveToCreateMode(state),
        notice: null,
        alertMessage: null,
      };

    case 'sync-editing-prompt':
      return syncEditingPrompt(state, action.prompt);

    case 'body-load-started':
      return {
        ...state,
        mode: action.preserveDirtyDraftOnFailure
          ? state.mode
          : {
              kind: 'edit',
              promptId: action.prompt.id,
              expectedUpdatedAt: action.prompt.updatedAt,
              expectedBodyUpdatedAt: action.prompt.bodyUpdatedAt,
            },
        activePrompt: action.preserveDirtyDraftOnFailure
          ? state.activePrompt
          : null,
        bodyLoadState: { status: 'loading', promptId: action.prompt.id },
        form: action.preserveDirtyDraftOnFailure
          ? state.form
          : createLoadingFormFromMeta(action.prompt),
        errors: action.preserveDirtyDraftOnFailure ? state.errors : {},
        isDirty: action.preserveDirtyDraftOnFailure ? state.isDirty : false,
        conflictState: action.preserveDirtyDraftOnFailure
          ? state.conflictState
          : { status: 'idle' },
        notice: null,
        alertMessage: null,
      };

    case 'body-load-failed':
      return {
        ...state,
        bodyLoadState: {
          status: 'error',
          promptId: action.promptId,
          message: action.message,
        },
      };

    case 'incoming-prompts-received':
      return applyIncomingPrompts(state, action);

    case 'load-prompts-failed':
      return {
        ...state,
        loadState: {
          status: 'error',
          message: action.message,
        },
      };

    case 'field-updated':
      return updateField(state, action.field, action.value);

    case 'submit-attempted':
      return {
        ...state,
        notice: null,
        alertMessage:
          state.conflictState.status === 'idle' ? null : state.alertMessage,
      };

    case 'submit-blocked':
      return {
        ...state,
        errors: {},
        alertMessage: action.alertMessage ?? state.alertMessage,
      };

    case 'validation-failed':
      return {
        ...state,
        errors: action.errors,
      };

    case 'save-started':
      return {
        ...state,
        errors: {},
        saveState: { status: 'saving' },
      };

    case 'save-finished':
      return {
        ...state,
        saveState: { status: 'idle' },
      };

    case 'save-failed':
      return {
        ...state,
        alertMessage: action.message,
      };

    case 'editing-prompt-missing-on-save':
      return {
        ...moveToCreateMode({
          ...state,
          prompts: removePrompt(state.prompts, action.promptId),
        }),
        alertMessage: UPDATE_NOT_FOUND_MESSAGE,
      };

    case 'existing-prompt-save-conflicted':
      return {
        ...syncConflictPrompt(
          {
            ...state,
            prompts: action.prompts,
            alertMessage: action.alertMessage,
          },
          action.record,
          'save-conflict',
          action.message,
        ),
        alertMessage: action.alertMessage,
      };

    case 'existing-prompt-save-not-found':
      return {
        ...moveToCreateMode({
          ...state,
          prompts: action.prompts,
        }),
        alertMessage: action.alertMessage,
      };

    case 'existing-prompt-save-succeeded':
      return {
        ...syncEditingPrompt(
          {
            ...state,
            prompts: action.prompts,
          },
          action.record,
        ),
        notice: PROMPT_UPDATED_MESSAGE,
        alertMessage: null,
      };

    case 'prompt-create-succeeded':
      return {
        ...moveToCreateMode({
          ...state,
          prompts: upsertPromptMeta(state.prompts, action.prompt),
        }),
        notice: PROMPT_CREATED_MESSAGE,
        alertMessage: null,
      };

    case 'mutation-started':
      return {
        ...state,
        notice: null,
        alertMessage: action.clearAlert ? null : state.alertMessage,
        saveState: { status: 'saving' },
      };

    case 'prompt-move-succeeded':
      return applyPromptMetaSuccess(state, {
        id: action.id,
        meta: action.meta,
        activeMode: action.activeMode,
        updatePinnedField: false,
        notice: null,
        clearAlert: false,
      });

    case 'prompt-pin-succeeded':
      return applyPromptMetaSuccess(state, {
        id: action.id,
        meta: action.meta,
        activeMode: action.activeMode,
        updatePinnedField: true,
        notice: action.meta.pinned
          ? PROMPT_PINNED_MESSAGE
          : PROMPT_UNPINNED_MESSAGE,
        clearAlert: true,
      });

    case 'prompt-meta-conflicted':
      return applyPromptMetaConflict(state, action);

    case 'prompt-meta-not-found':
      return applyPromptNotFound(state, action);

    case 'prompt-delete-succeeded': {
      const deletedActivePrompt = isActivePrompt(action.activeMode, action.id);
      const nextState = {
        ...state,
        prompts: removePrompt(state.prompts, action.id),
      };

      return {
        ...(deletedActivePrompt ? moveToCreateMode(nextState) : nextState),
        notice: deletedActivePrompt
          ? DELETE_RECOVERY_MESSAGE
          : PROMPT_DELETED_MESSAGE,
      };
    }

    case 'prompt-delete-conflict-body-load-failed':
      return {
        ...state,
        prompts: action.prompts,
        alertMessage: action.alertMessage,
      };

    case 'prompt-delete-conflicted':
      return {
        ...syncConflictPrompt(
          {
            ...state,
            prompts: action.prompts,
            alertMessage: action.alertMessage,
          },
          action.record,
          'delete-conflict',
          action.message,
        ),
        alertMessage: action.alertMessage,
      };

    case 'prompt-delete-not-found':
      return applyPromptNotFound(state, action);

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function moveToCreateMode(state: PromptEditorState): PromptEditorState {
  return {
    ...state,
    activePrompt: null,
    bodyLoadState: { status: 'idle' },
    mode: { kind: 'create' },
    form: createEmptyForm(),
    errors: {},
    conflictState: { status: 'idle' },
    isDirty: false,
  };
}

function syncEditingPrompt(
  state: PromptEditorState,
  prompt: PromptRecord,
): PromptEditorState {
  return {
    ...state,
    activePrompt: prompt,
    bodyLoadState: { status: 'idle' },
    mode: {
      kind: 'edit',
      promptId: prompt.id,
      expectedUpdatedAt: prompt.updatedAt,
      expectedBodyUpdatedAt: prompt.bodyUpdatedAt,
    },
    form: createFormFromPrompt(prompt),
    errors: {},
    conflictState: { status: 'idle' },
    isDirty: false,
  };
}

function syncConflictPrompt(
  state: PromptEditorState,
  prompt: PromptRecord,
  reason: 'save-conflict' | 'delete-conflict',
  message: LocalizedMessageDescriptor,
): PromptEditorState {
  return {
    ...syncEditingPrompt(state, prompt),
    conflictState: {
      status: 'stale',
      reason,
      promptId: prompt.id,
      message,
      currentPrompt: prompt,
    },
  };
}

function applyIncomingPrompts(
  state: PromptEditorState,
  action: Extract<PromptEditorAction, { type: 'incoming-prompts-received' }>,
): PromptEditorState {
  const sortedPrompts = sortPromptMetas(action.prompts);
  const nextState = {
    ...state,
    prompts: sortedPrompts,
    loadState: { status: 'ready' } satisfies PromptEditorLoadState,
  };
  const currentMode = state.mode;

  if (currentMode.kind === 'create') {
    return state.isDirty ? nextState : moveToCreateMode(nextState);
  }

  const currentPrompt =
    sortedPrompts.find((prompt) => prompt.id === currentMode.promptId) ?? null;

  if (!currentPrompt) {
    return {
      ...moveToCreateMode(nextState),
      notice: DELETE_RECOVERY_MESSAGE,
      alertMessage: null,
    };
  }

  if (!state.isDirty) {
    return nextState;
  }

  if (action.event?.reason === 'records-replaced') {
    return {
      ...nextState,
      conflictState: {
        status: 'stale',
        reason: 'external-update',
        promptId: currentPrompt.id,
        message: EXTERNAL_CHANGE_MESSAGE,
        currentPrompt,
      },
      alertMessage: EXTERNAL_CHANGE_MESSAGE,
    };
  }

  if (!hasPromptTimestampChanged(currentMode, currentPrompt)) {
    return nextState;
  }

  if (
    action.savedPromptEcho &&
    action.savedPromptEcho.promptId === currentMode.promptId &&
    action.savedPromptEcho.updatedAt === currentPrompt.updatedAt &&
    action.savedPromptEcho.bodyUpdatedAt === currentPrompt.bodyUpdatedAt
  ) {
    return nextState;
  }

  if (action.savingPromptId === currentMode.promptId) {
    return nextState;
  }

  return {
    ...nextState,
    conflictState: {
      status: 'stale',
      reason: 'external-update',
      promptId: currentPrompt.id,
      message: EXTERNAL_CHANGE_MESSAGE,
      currentPrompt,
    },
    alertMessage: EXTERNAL_CHANGE_MESSAGE,
  };
}

function updateField(
  state: PromptEditorState,
  field: keyof PromptFormState,
  value: string | boolean,
): PromptEditorState {
  if (field === 'pinned') {
    return {
      ...state,
      form: {
        ...state.form,
        pinned: Boolean(value),
      },
      isDirty: true,
      notice: null,
      alertMessage:
        state.conflictState.status === 'idle' ? null : state.alertMessage,
    };
  }

  return {
    ...state,
    form: {
      ...state.form,
      [field]: String(value),
    },
    errors: {
      ...state.errors,
      [field]: undefined,
    },
    isDirty: true,
    notice: null,
    alertMessage:
      state.conflictState.status === 'idle' ? null : state.alertMessage,
  };
}

function applyPromptMetaSuccess(
  state: PromptEditorState,
  input: {
    id: string;
    meta: PromptMeta;
    activeMode: PromptEditorMode;
    updatePinnedField: boolean;
    notice: LocalizedMessageDescriptor | null;
    clearAlert: boolean;
  },
): PromptEditorState {
  const nextState = {
    ...state,
    prompts: upsertPromptMeta(state.prompts, input.meta),
    notice: input.notice ?? state.notice,
    alertMessage: input.clearAlert ? null : state.alertMessage,
  };

  if (!isActivePrompt(input.activeMode, input.id)) {
    return nextState;
  }

  return {
    ...nextState,
    activePrompt:
      state.activePrompt && state.activePrompt.id === input.id
        ? mergeMetaIntoRecord(state.activePrompt, input.meta)
        : state.activePrompt,
    mode:
      state.mode.kind === 'edit' && state.mode.promptId === input.id
        ? {
            ...state.mode,
            expectedUpdatedAt: input.meta.updatedAt,
            expectedBodyUpdatedAt: input.meta.bodyUpdatedAt,
          }
        : state.mode,
    form: input.updatePinnedField
      ? {
          ...state.form,
          pinned: input.meta.pinned,
        }
      : state.form,
  };
}

function applyPromptMetaConflict(
  state: PromptEditorState,
  action: Extract<PromptEditorAction, { type: 'prompt-meta-conflicted' }>,
): PromptEditorState {
  const nextState = {
    ...state,
    prompts: upsertPromptMeta(state.prompts, action.meta),
  };

  if (!isActivePrompt(action.activeMode, action.id)) {
    return {
      ...nextState,
      alertMessage: action.alertMessage,
    };
  }

  return {
    ...nextState,
    conflictState: {
      status: 'stale',
      reason: 'external-update',
      promptId: action.id,
      message: EXTERNAL_CHANGE_MESSAGE,
      currentPrompt: action.meta,
    },
    alertMessage: EXTERNAL_CHANGE_MESSAGE,
  };
}

function applyPromptNotFound(
  state: PromptEditorState,
  action:
    | Extract<PromptEditorAction, { type: 'prompt-meta-not-found' }>
    | Extract<PromptEditorAction, { type: 'prompt-delete-not-found' }>,
): PromptEditorState {
  const nextState = {
    ...state,
    prompts: removePrompt(state.prompts, action.id),
  };

  if (!isActivePrompt(action.activeMode, action.id)) {
    return {
      ...nextState,
      alertMessage: action.inactivePromptAlertMessage,
    };
  }

  return {
    ...moveToCreateMode(nextState),
    alertMessage: action.activePromptAlertMessage,
  };
}

function hasPromptTimestampChanged(
  mode: Extract<PromptEditorMode, { kind: 'edit' }>,
  prompt: PromptMeta,
): boolean {
  return (
    prompt.updatedAt !== mode.expectedUpdatedAt ||
    prompt.bodyUpdatedAt !== mode.expectedBodyUpdatedAt
  );
}

function isActivePrompt(mode: PromptEditorMode, id: string): boolean {
  return mode.kind === 'edit' && mode.promptId === id;
}
