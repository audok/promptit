import { startTransition, useEffect, useReducer, useRef } from 'react';

import {
  type PromptMeta,
  type PromptRecord,
} from '../prompt/schema';
import {
  PromptitRuntimeError,
  createPrompt,
  deletePrompt,
  getPromptMetas,
  getPromptRecord,
  movePrompt,
  setPromptPinned,
  subscribeToPromptMetas,
  updatePromptRecord,
} from '../prompt/storage';
import type { PromptMetasSubscriptionEvent } from '../prompt/runtimeStorageClient';
import { type LocalizedMessageDescriptor } from '../shared/i18n';
import {
  BODY_LOAD_ERROR_MESSAGE,
  DELETE_ERROR_MESSAGE,
  PIN_ERROR_MESSAGE,
  REORDER_ERROR_MESSAGE,
  SAVE_ERROR_MESSAGE,
  buildCreateDraft,
  buildPromptMovePlan,
  getConflictRetryAlertMessage,
  getCaughtErrorMessage,
  getEditSubmitBlockReason,
  getLoadErrorMessage,
  getNotFoundCreateModeAlertMessage,
  getRuntimeResponseMessage,
  parsePromptForm,
  upsertPromptMeta,
  type PromptEditorBodyLoadState,
  type PromptEditorConflictState,
  type PromptEditorLoadState,
  type PromptEditorMode,
  type PromptFormErrors,
  type PromptFormState,
  type PromptMovePlacement,
} from './promptEditorState';
import {
  createInitialPromptEditorState,
  getIncomingPromptEffect,
  promptEditorReducer,
  shouldInvalidateBodyLoadForIncomingPrompts,
  type PromptEditorState,
  type SavedPromptEcho,
} from './promptEditorReducer';
import { saveExistingPrompt } from './promptEditorSaveMutation';

export type {
  PromptEditorBodyLoadState,
  PromptEditorConflictState,
  PromptEditorLoadState,
  PromptEditorMode,
  PromptEditorSaveState,
  PromptFormErrors,
  PromptFormState,
  PromptMovePlacement,
} from './promptEditorState';

export type UsePromptEditorResult = {
  activePrompt: PromptRecord | null;
  alertMessage: LocalizedMessageDescriptor | null;
  bodyLoadState: PromptEditorBodyLoadState;
  conflictState: PromptEditorConflictState;
  errors: PromptFormErrors;
  form: PromptFormState;
  isDirty: boolean;
  isEditing: boolean;
  isEditorLoading: boolean;
  isSaving: boolean;
  loadState: PromptEditorLoadState;
  mode: PromptEditorMode;
  notice: LocalizedMessageDescriptor | null;
  prompts: PromptMeta[];
  clearAlertMessage: () => void;
  clearNotice: () => void;
  deletePromptById: (id: string) => Promise<void>;
  movePromptWithinGroup: (
    id: string,
    targetId: string,
    placement: PromptMovePlacement,
  ) => Promise<boolean>;
  selectPrompt: (prompt: PromptMeta) => Promise<void>;
  startCreateMode: () => void;
  submit: () => Promise<void>;
  togglePromptPinned: (id: string, pinned: boolean) => Promise<boolean>;
  updateField: (field: keyof PromptFormState, value: string | boolean) => void;
};

async function resolveConflictRecord(meta: PromptMeta): Promise<PromptRecord> {
  try {
    return await getPromptRecord(meta.id);
  } catch (error) {
    console.error('[promptit] Failed to load conflicted prompt body.', error);

    throw new Error(BODY_LOAD_ERROR_MESSAGE.fallback);
  }
}

export function usePromptEditor(): UsePromptEditorResult {
  const [editorState, dispatch] = useReducer(
    promptEditorReducer,
    undefined,
    createInitialPromptEditorState,
  );
  const editorStateRef = useRef<PromptEditorState>(editorState);
  const bodyLoadRequestIdRef = useRef(0);
  const savingPromptIdRef = useRef<string | null>(null);
  const savedPromptEchoRef = useRef<SavedPromptEcho | null>(null);

  editorStateRef.current = editorState;

  function clearAlertMessage(): void {
    dispatch({ type: 'clear-alert-message' });
  }

  function clearNotice(): void {
    dispatch({ type: 'clear-notice' });
  }

  function moveToCreateMode(
    actionType: 'move-to-create-mode' | 'start-create-mode',
  ): void {
    bodyLoadRequestIdRef.current += 1;
    dispatch({ type: actionType });
  }

  function syncEditingPrompt(prompt: PromptRecord): void {
    bodyLoadRequestIdRef.current += 1;
    dispatch({ type: 'sync-editing-prompt', prompt });
  }

  async function loadPromptRecord(prompt: PromptMeta): Promise<void> {
    const requestId = bodyLoadRequestIdRef.current + 1;
    const preserveDirtyDraftOnFailure =
      editorStateRef.current.isDirty &&
      editorStateRef.current.mode.kind === 'create';
    bodyLoadRequestIdRef.current = requestId;

    startTransition(() => {
      dispatch({
        type: 'body-load-started',
        prompt,
        preserveDirtyDraftOnFailure,
      });
    });

    try {
      const record = await getPromptRecord(prompt.id);

      if (bodyLoadRequestIdRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        syncEditingPrompt(record);
      });
    } catch (error) {
      console.error('[promptit] Failed to load prompt body in options page.', error);

      if (bodyLoadRequestIdRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        dispatch({
          type: 'body-load-failed',
          promptId: prompt.id,
          message: BODY_LOAD_ERROR_MESSAGE,
        });
      });
    }
  }

  function applyIncomingPrompts(
    nextPrompts: PromptMeta[],
    event: PromptMetasSubscriptionEvent = {},
  ): void {
    const currentState = editorStateRef.current;
    const incomingEffect = getIncomingPromptEffect({
      state: currentState,
      prompts: nextPrompts,
      event,
      savedPromptEcho: savedPromptEchoRef.current,
      savingPromptId: savingPromptIdRef.current,
    });

    startTransition(() => {
      if (
        shouldInvalidateBodyLoadForIncomingPrompts({
          state: currentState,
          prompts: nextPrompts,
        })
      ) {
        bodyLoadRequestIdRef.current += 1;
      }

      dispatch({
        type: 'incoming-prompts-received',
        prompts: nextPrompts,
        event,
        savedPromptEcho: savedPromptEchoRef.current,
        savingPromptId: savingPromptIdRef.current,
      });
    });

    if (incomingEffect.type === 'load-record') {
      void loadPromptRecord(incomingEffect.prompt);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const syncPrompts = (
      nextPrompts: PromptMeta[],
      event: PromptMetasSubscriptionEvent,
    ) => {
      if (cancelled) {
        return;
      }

      applyIncomingPrompts(nextPrompts, event);
    };

    void getPromptMetas()
      .then((nextPrompts) => {
        if (cancelled) {
          return;
        }

        applyIncomingPrompts(nextPrompts);
      })
      .catch((error) => {
        console.error('[promptit] Failed to load prompts in options page.', error);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          dispatch({
            type: 'load-prompts-failed',
            message: getLoadErrorMessage(error),
          });
        });
      });

    const unsubscribe = subscribeToPromptMetas(syncPrompts);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!editorState.isDirty || editorState.mode.kind === 'create') {
      savingPromptIdRef.current = null;
      savedPromptEchoRef.current = null;
    }
  }, [editorState.isDirty, editorState.mode]);

  function startCreateMode(): void {
    startTransition(() => {
      moveToCreateMode('start-create-mode');
    });
  }

  async function selectPrompt(prompt: PromptMeta): Promise<void> {
    await loadPromptRecord(prompt);
  }

  function updateField(field: keyof PromptFormState, value: string | boolean): void {
    dispatch({ type: 'field-updated', field, value });
  }

  async function submit(): Promise<void> {
    dispatch({ type: 'submit-attempted' });

    const currentState = editorStateRef.current;
    const currentMode = currentState.mode;
    const currentBodyLoadState = currentState.bodyLoadState;
    const editSubmitBlockReason = getEditSubmitBlockReason(
      currentMode,
      currentBodyLoadState,
      currentState.activePrompt,
    );

    if (editSubmitBlockReason !== null) {
      dispatch({
        type: 'submit-blocked',
        alertMessage:
          editSubmitBlockReason === 'missing-active-prompt'
            ? BODY_LOAD_ERROR_MESSAGE
            : null,
      });

      return;
    }

    const parsedForm = parsePromptForm(currentState.form);

    if (!parsedForm.ok) {
      dispatch({ type: 'validation-failed', errors: parsedForm.errors });
      return;
    }

    dispatch({ type: 'save-started' });

    try {
      if (currentMode.kind === 'edit') {
        const currentRecord = currentState.activePrompt;
        const currentMeta =
          currentState.prompts.find(
            (prompt) => prompt.id === currentMode.promptId,
          ) ?? null;

        if (!currentMeta || !currentRecord) {
          startTransition(() => {
            bodyLoadRequestIdRef.current += 1;
            dispatch({
              type: 'editing-prompt-missing-on-save',
              promptId: currentMode.promptId,
            });
          });
          return;
        }

        savingPromptIdRef.current = currentMode.promptId;

        const saveResult = await saveExistingPrompt({
          promptId: currentMode.promptId,
          expectedUpdatedAt: currentMode.expectedUpdatedAt,
          expectedBodyUpdatedAt: currentMode.expectedBodyUpdatedAt,
          form: parsedForm.form,
          prompts: currentState.prompts,
          operations: {
            updatePromptRecord,
          },
        });

        if (saveResult.status === 'conflict') {
          startTransition(() => {
            bodyLoadRequestIdRef.current += 1;
            dispatch({
              type: 'existing-prompt-save-conflicted',
              prompts: saveResult.prompts,
              record: saveResult.record,
              message: saveResult.message,
              alertMessage: saveResult.alertMessage,
            });
          });
          return;
        }

        if (saveResult.status === 'not-found') {
          startTransition(() => {
            bodyLoadRequestIdRef.current += 1;
            dispatch({
              type: 'existing-prompt-save-not-found',
              prompts: saveResult.prompts,
              alertMessage: saveResult.alertMessage,
            });
          });
          return;
        }

        startTransition(() => {
          bodyLoadRequestIdRef.current += 1;
          dispatch({
            type: 'existing-prompt-save-succeeded',
            prompts: saveResult.prompts,
            record: saveResult.record,
          });
        });
        savedPromptEchoRef.current = {
          promptId: saveResult.record.id,
          updatedAt: saveResult.record.updatedAt,
          bodyUpdatedAt: saveResult.record.bodyUpdatedAt,
        };
        savingPromptIdRef.current = null;
        return;
      }

      const createdPrompt = await createPrompt(buildCreateDraft(parsedForm.form));

      startTransition(() => {
        bodyLoadRequestIdRef.current += 1;
        dispatch({ type: 'prompt-create-succeeded', prompt: createdPrompt });
      });
    } catch (error) {
      console.error('[promptit] Failed to save prompt.', error);
      dispatch({
        type: 'save-failed',
        message: getCaughtErrorMessage(error, SAVE_ERROR_MESSAGE),
      });
    } finally {
      savingPromptIdRef.current = null;
      dispatch({ type: 'save-finished' });
    }
  }

  async function movePromptWithinGroup(
    id: string,
    targetId: string,
    placement: PromptMovePlacement,
  ): Promise<boolean> {
    const currentState = editorStateRef.current;
    const movePlan = buildPromptMovePlan(
      currentState.prompts,
      id,
      targetId,
      placement,
    );

    if (!movePlan) {
      return false;
    }

    dispatch({
      type: 'mutation-started',
      clearAlert: currentState.conflictState.status === 'idle',
    });

    try {
      const currentMode = currentState.mode;
      const result = await movePrompt(id, {
        group: movePlan.group,
        previousId: movePlan.previousId,
        nextId: movePlan.nextId,
        expectedUpdatedAt: movePlan.draggedPrompt.updatedAt,
      });

      if (result.ok) {
        startTransition(() => {
          dispatch({
            type: 'prompt-move-succeeded',
            id,
            meta: result.meta,
            activeMode: currentMode,
          });
        });
        return true;
      }

      if (result.status === 'conflict') {
        const conflictMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.updateConflict',
        );

        startTransition(() => {
          dispatch({
            type: 'prompt-meta-conflicted',
            id,
            meta: result.currentMeta,
            activeMode: currentMode,
            alertMessage: getConflictRetryAlertMessage(conflictMessage),
          });
        });
        return false;
      }

      if (result.status === 'not-found') {
        const notFoundMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.updateNotFound',
        );

        startTransition(() => {
          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            bodyLoadRequestIdRef.current += 1;
          }
          dispatch({
            type: 'prompt-meta-not-found',
            id,
            activeMode: currentMode,
            activePromptAlertMessage:
              getNotFoundCreateModeAlertMessage(notFoundMessage),
            inactivePromptAlertMessage: notFoundMessage,
          });
        });
        return false;
      }

      throw new PromptitRuntimeError(result.message, result.messageDescriptor);
    } catch (error) {
      console.error('[promptit] Failed to move prompt.', error);
      dispatch({
        type: 'save-failed',
        message: getCaughtErrorMessage(error, REORDER_ERROR_MESSAGE),
      });
      return false;
    } finally {
      dispatch({ type: 'save-finished' });
    }
  }

  async function togglePromptPinned(
    id: string,
    pinned: boolean,
  ): Promise<boolean> {
    const currentState = editorStateRef.current;
    const targetPrompt =
      currentState.prompts.find((prompt) => prompt.id === id) ?? null;

    if (!targetPrompt || targetPrompt.pinned === pinned) {
      return false;
    }

    dispatch({
      type: 'mutation-started',
      clearAlert: currentState.conflictState.status === 'idle',
    });

    try {
      const currentMode = currentState.mode;
      const result = await setPromptPinned(id, pinned, {
        expectedUpdatedAt: targetPrompt.updatedAt,
      });

      if (result.ok) {
        dispatch({
          type: 'prompt-pin-succeeded',
          id,
          meta: result.meta,
          activeMode: currentMode,
        });
        return true;
      }

      if (result.status === 'conflict') {
        const conflictMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.pinConflict',
        );

        startTransition(() => {
          dispatch({
            type: 'prompt-meta-conflicted',
            id,
            meta: result.currentMeta,
            activeMode: currentMode,
            alertMessage: getConflictRetryAlertMessage(conflictMessage),
          });
        });
        return false;
      }

      if (result.status === 'not-found') {
        const notFoundMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.pinNotFound',
        );

        startTransition(() => {
          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            bodyLoadRequestIdRef.current += 1;
          }
          dispatch({
            type: 'prompt-meta-not-found',
            id,
            activeMode: currentMode,
            activePromptAlertMessage:
              getNotFoundCreateModeAlertMessage(notFoundMessage),
            inactivePromptAlertMessage: notFoundMessage,
          });
        });
        return false;
      }

      throw new PromptitRuntimeError(result.message, result.messageDescriptor);
    } catch (error) {
      console.error('[promptit] Failed to toggle prompt pinned state.', error);
      dispatch({
        type: 'save-failed',
        message: getCaughtErrorMessage(error, PIN_ERROR_MESSAGE),
      });
      return false;
    } finally {
      dispatch({ type: 'save-finished' });
    }
  }

  async function deletePromptById(id: string): Promise<void> {
    const currentState = editorStateRef.current;
    const targetPrompt =
      currentState.prompts.find((prompt) => prompt.id === id) ?? null;

    if (!targetPrompt) {
      return;
    }

    dispatch({ type: 'mutation-started', clearAlert: true });

    try {
      const currentMode = currentState.mode;
      const expectedUpdatedAt =
        currentMode.kind === 'edit' && currentMode.promptId === id
          ? currentMode.expectedUpdatedAt
          : targetPrompt.updatedAt;
      const expectedBodyUpdatedAt =
        currentMode.kind === 'edit' && currentMode.promptId === id
          ? currentMode.expectedBodyUpdatedAt
          : targetPrompt.bodyUpdatedAt;
      const result = await deletePrompt(id, {
        expectedUpdatedAt,
        expectedBodyUpdatedAt,
      });

      if (result.ok) {
        startTransition(() => {
          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            bodyLoadRequestIdRef.current += 1;
          }

          dispatch({
            type: 'prompt-delete-succeeded',
            id,
            activeMode: currentMode,
          });
        });
        return;
      }

      if (result.status === 'conflict') {
        const conflictMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.deleteConflict',
        );
        const latestState = editorStateRef.current;
        const nextPrompts = upsertPromptMeta(
          latestState.prompts,
          result.currentMeta,
        );
        let conflictRecord: PromptRecord;

        try {
          conflictRecord = await resolveConflictRecord(result.currentMeta);
        } catch (error) {
          console.error('[promptit] Failed to resolve delete conflict.', error);

          startTransition(() => {
            dispatch({
              type: 'prompt-delete-conflict-body-load-failed',
              prompts: nextPrompts,
              alertMessage: BODY_LOAD_ERROR_MESSAGE,
            });
          });
          return;
        }

        startTransition(() => {
          bodyLoadRequestIdRef.current += 1;
          dispatch({
            type: 'prompt-delete-conflicted',
            prompts: nextPrompts,
            record: conflictRecord,
            message: conflictMessage,
            alertMessage: getConflictRetryAlertMessage(conflictMessage),
          });
        });
        return;
      }

      if (result.status === 'not-found') {
        const notFoundMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.deleteNotFound',
        );

        startTransition(() => {
          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            bodyLoadRequestIdRef.current += 1;
          }
          dispatch({
            type: 'prompt-delete-not-found',
            id,
            activeMode: currentMode,
            activePromptAlertMessage:
              getNotFoundCreateModeAlertMessage(notFoundMessage),
            inactivePromptAlertMessage: notFoundMessage,
          });
        });
        return;
      }

      throw new PromptitRuntimeError(result.message, result.messageDescriptor);
    } catch (error) {
      console.error('[promptit] Failed to delete prompt.', error);
      dispatch({
        type: 'save-failed',
        message: getCaughtErrorMessage(error, DELETE_ERROR_MESSAGE),
      });
    } finally {
      dispatch({ type: 'save-finished' });
    }
  }

  const {
    activePrompt,
    alertMessage,
    bodyLoadState,
    conflictState,
    errors,
    form,
    isDirty,
    loadState,
    mode,
    notice,
    prompts,
    saveState,
  } = editorState;

  return {
    activePrompt,
    alertMessage,
    bodyLoadState,
    conflictState,
    errors,
    form,
    isDirty,
    isEditing: mode.kind === 'edit',
    isEditorLoading: bodyLoadState.status === 'loading',
    isSaving: saveState.status === 'saving',
    loadState,
    mode,
    notice,
    prompts,
    clearAlertMessage,
    clearNotice,
    deletePromptById,
    movePromptWithinGroup,
    selectPrompt,
    startCreateMode,
    submit,
    togglePromptPinned,
    updateField,
  };
}
