import { startTransition, useEffect, useRef, useState } from 'react';

import {
  sortPromptMetas,
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
  DELETE_RECOVERY_MESSAGE,
  EXTERNAL_CHANGE_MESSAGE,
  PIN_ERROR_MESSAGE,
  PROMPT_CREATED_MESSAGE,
  PROMPT_DELETED_MESSAGE,
  PROMPT_PINNED_MESSAGE,
  PROMPT_UNPINNED_MESSAGE,
  PROMPT_UPDATED_MESSAGE,
  REORDER_ERROR_MESSAGE,
  SAVE_ERROR_MESSAGE,
  UPDATE_NOT_FOUND_MESSAGE,
  buildCreateDraft,
  buildPromptMovePlan,
  createEmptyForm,
  createFormFromPrompt,
  createLoadingFormFromMeta,
  getConflictRetryAlertMessage,
  getCaughtErrorMessage,
  getEditSubmitBlockReason,
  getLoadErrorMessage,
  getNotFoundCreateModeAlertMessage,
  getRuntimeResponseMessage,
  mergeMetaIntoRecord,
  parsePromptForm,
  removePrompt,
  upsertPromptMeta,
  type PromptEditorBodyLoadState,
  type PromptEditorConflictState,
  type PromptEditorLoadState,
  type PromptEditorMode,
  type PromptEditorSaveState,
  type PromptFormErrors,
  type PromptFormState,
  type PromptMovePlacement,
} from './promptEditorState';
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

async function resolveConflictRecord(
  meta: PromptMeta,
  fallback: PromptRecord | null,
): Promise<PromptRecord> {
  try {
    return await getPromptRecord(meta.id);
  } catch (error) {
    console.error('[promptit] Failed to load conflicted prompt body.', error);

    if (fallback?.id === meta.id) {
      return {
        ...meta,
        content: fallback.content,
      };
    }

    throw new Error(BODY_LOAD_ERROR_MESSAGE.fallback);
  }
}

export function usePromptEditor(): UsePromptEditorResult {
  const [prompts, setPrompts] = useState<PromptMeta[]>([]);
  const [activePrompt, setActivePrompt] = useState<PromptRecord | null>(null);
  const [loadState, setLoadState] = useState<PromptEditorLoadState>({
    status: 'loading',
  });
  const [bodyLoadState, setBodyLoadState] = useState<PromptEditorBodyLoadState>({
    status: 'idle',
  });
  const [saveState, setSaveState] = useState<PromptEditorSaveState>({
    status: 'idle',
  });
  const [mode, setMode] = useState<PromptEditorMode>({ kind: 'create' });
  const [form, setForm] = useState<PromptFormState>(() => createEmptyForm());
  const [errors, setErrors] = useState<PromptFormErrors>({});
  const [notice, setNotice] = useState<LocalizedMessageDescriptor | null>(null);
  const [alertMessage, setAlertMessage] =
    useState<LocalizedMessageDescriptor | null>(null);
  const [conflictState, setConflictState] = useState<PromptEditorConflictState>({
    status: 'idle',
  });
  const [isDirty, setIsDirty] = useState(false);

  const promptsRef = useRef(prompts);
  const activePromptRef = useRef(activePrompt);
  const modeRef = useRef(mode);
  const formRef = useRef(form);
  const conflictStateRef = useRef(conflictState);
  const isDirtyRef = useRef(isDirty);
  const bodyLoadStateRef = useRef(bodyLoadState);
  const bodyLoadRequestIdRef = useRef(0);
  const savingPromptIdRef = useRef<string | null>(null);
  const savedPromptEchoRef = useRef<{
    promptId: string;
    updatedAt: string;
    bodyUpdatedAt: string;
  } | null>(null);

  promptsRef.current = prompts;
  activePromptRef.current = activePrompt;
  modeRef.current = mode;
  formRef.current = form;
  conflictStateRef.current = conflictState;
  isDirtyRef.current = isDirty;
  bodyLoadStateRef.current = bodyLoadState;

  function clearAlertMessage(): void {
    setAlertMessage(null);
  }

  function clearNotice(): void {
    setNotice(null);
  }

  function moveToCreateMode(): void {
    bodyLoadRequestIdRef.current += 1;
    setMode({ kind: 'create' });
    setActivePrompt(null);
    setBodyLoadState({ status: 'idle' });
    setForm(createEmptyForm());
    setErrors({});
    setIsDirty(false);
    setConflictState({ status: 'idle' });
  }

  function syncEditingPrompt(prompt: PromptRecord): void {
    bodyLoadRequestIdRef.current += 1;
    setMode({
      kind: 'edit',
      promptId: prompt.id,
      expectedUpdatedAt: prompt.updatedAt,
      expectedBodyUpdatedAt: prompt.bodyUpdatedAt,
    });
    setActivePrompt(prompt);
    setBodyLoadState({ status: 'idle' });
    setForm(createFormFromPrompt(prompt));
    setErrors({});
    setIsDirty(false);
    setConflictState({ status: 'idle' });
  }

  function syncConflictPrompt(
    prompt: PromptRecord,
    reason: 'save-conflict' | 'delete-conflict',
    message: LocalizedMessageDescriptor,
  ): void {
    bodyLoadRequestIdRef.current += 1;
    setMode({
      kind: 'edit',
      promptId: prompt.id,
      expectedUpdatedAt: prompt.updatedAt,
      expectedBodyUpdatedAt: prompt.bodyUpdatedAt,
    });
    setActivePrompt(prompt);
    setBodyLoadState({ status: 'idle' });
    setForm(createFormFromPrompt(prompt));
    setErrors({});
    setIsDirty(false);
    setConflictState({
      status: 'stale',
      reason,
      promptId: prompt.id,
      message,
      currentPrompt: prompt,
    });
  }

  async function loadPromptRecord(prompt: PromptMeta): Promise<void> {
    const requestId = bodyLoadRequestIdRef.current + 1;
    const preserveDirtyDraftOnFailure =
      isDirtyRef.current && modeRef.current.kind === 'create';
    bodyLoadRequestIdRef.current = requestId;

    startTransition(() => {
      setBodyLoadState({ status: 'loading', promptId: prompt.id });
      setNotice(null);
      setAlertMessage(null);

      if (!preserveDirtyDraftOnFailure) {
        setMode({
          kind: 'edit',
          promptId: prompt.id,
          expectedUpdatedAt: prompt.updatedAt,
          expectedBodyUpdatedAt: prompt.bodyUpdatedAt,
        });
        setActivePrompt(null);
        setForm(createLoadingFormFromMeta(prompt));
        setErrors({});
        setIsDirty(false);
        setConflictState({ status: 'idle' });
      }
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
        setBodyLoadState({
          status: 'error',
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
    const currentMode = modeRef.current;
    const draftIsDirty = isDirtyRef.current;
    const sortedPrompts = sortPromptMetas(nextPrompts);

    startTransition(() => {
      setPrompts(sortedPrompts);
      setLoadState({ status: 'ready' });

      if (currentMode.kind === 'create') {
        if (!draftIsDirty) {
          moveToCreateMode();
        }
        return;
      }

      const currentPrompt =
        sortedPrompts.find((prompt) => prompt.id === currentMode.promptId) ??
        null;

      if (!currentPrompt) {
        moveToCreateMode();
        setNotice(DELETE_RECOVERY_MESSAGE);
        setAlertMessage(null);
        return;
      }

      if (event.reason === 'records-replaced') {
        void loadPromptRecord(currentPrompt);
        return;
      }

      if (
        !draftIsDirty &&
        (currentPrompt.updatedAt !== currentMode.expectedUpdatedAt ||
          currentPrompt.bodyUpdatedAt !== currentMode.expectedBodyUpdatedAt)
      ) {
        void loadPromptRecord(currentPrompt);
        return;
      }

      if (
        draftIsDirty &&
        (currentPrompt.updatedAt !== currentMode.expectedUpdatedAt ||
          currentPrompt.bodyUpdatedAt !== currentMode.expectedBodyUpdatedAt)
      ) {
        const savedPromptEcho = savedPromptEchoRef.current;

        if (
          savedPromptEcho &&
          savedPromptEcho.promptId === currentMode.promptId &&
          savedPromptEcho.updatedAt === currentPrompt.updatedAt &&
          savedPromptEcho.bodyUpdatedAt === currentPrompt.bodyUpdatedAt
        ) {
          return;
        }

        if (savingPromptIdRef.current === currentMode.promptId) {
          return;
        }

        setConflictState({
          status: 'stale',
          reason: 'external-update',
          promptId: currentPrompt.id,
          message: EXTERNAL_CHANGE_MESSAGE,
          currentPrompt,
        });
        setAlertMessage(EXTERNAL_CHANGE_MESSAGE);
      }
    });
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
          setLoadState({
            status: 'error',
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
    if (!isDirty || mode.kind === 'create') {
      savingPromptIdRef.current = null;
      savedPromptEchoRef.current = null;
    }
  }, [isDirty, mode]);

  function startCreateMode(): void {
    startTransition(() => {
      moveToCreateMode();
      setNotice(null);
      setAlertMessage(null);
    });
  }

  async function selectPrompt(prompt: PromptMeta): Promise<void> {
    await loadPromptRecord(prompt);
  }

  function updateField(field: keyof PromptFormState, value: string | boolean): void {
    if (field === 'pinned') {
      setForm((current) => ({
        ...current,
        pinned: Boolean(value),
      }));
    } else {
      setForm((current) => ({
        ...current,
        [field]: String(value),
      }));

      setErrors((current) => ({
        ...current,
        [field]: undefined,
      }));
    }
    setIsDirty(true);
    setNotice(null);

    if (conflictStateRef.current.status === 'idle') {
      setAlertMessage(null);
    }
  }

  async function submit(): Promise<void> {
    setNotice(null);

    if (conflictStateRef.current.status === 'idle') {
      setAlertMessage(null);
    }

    const currentMode = modeRef.current;
    const currentBodyLoadState = bodyLoadStateRef.current;
    const editSubmitBlockReason = getEditSubmitBlockReason(
      currentMode,
      currentBodyLoadState,
      activePromptRef.current,
    );

    if (editSubmitBlockReason !== null) {
      setErrors({});

      if (editSubmitBlockReason === 'missing-active-prompt') {
        setAlertMessage(BODY_LOAD_ERROR_MESSAGE);
      }

      return;
    }

    const parsedForm = parsePromptForm(formRef.current);

    if (!parsedForm.ok) {
      setErrors(parsedForm.errors);
      return;
    }

    setErrors({});
    setSaveState({ status: 'saving' });

    try {
      if (currentMode.kind === 'edit') {
        const currentRecord = activePromptRef.current;
        const currentMeta =
          promptsRef.current.find((prompt) => prompt.id === currentMode.promptId) ??
          null;

        if (!currentMeta || !currentRecord) {
          const nextPrompts = removePrompt(promptsRef.current, currentMode.promptId);

          startTransition(() => {
            setPrompts(nextPrompts);
            moveToCreateMode();
            setAlertMessage(UPDATE_NOT_FOUND_MESSAGE);
          });
          return;
        }

        savingPromptIdRef.current = currentMode.promptId;

        const saveResult = await saveExistingPrompt({
          promptId: currentMode.promptId,
          expectedUpdatedAt: currentMode.expectedUpdatedAt,
          expectedBodyUpdatedAt: currentMode.expectedBodyUpdatedAt,
          form: parsedForm.form,
          currentRecord,
          prompts: promptsRef.current,
          operations: {
            updatePromptRecord,
            resolveConflictRecord,
          },
        });

        if (saveResult.status === 'conflict') {
          startTransition(() => {
            setPrompts(saveResult.prompts);
            setAlertMessage(saveResult.alertMessage);
            syncConflictPrompt(
              saveResult.record,
              'save-conflict',
              saveResult.message,
            );
          });
          return;
        }

        if (saveResult.status === 'not-found') {
          startTransition(() => {
            setPrompts(saveResult.prompts);
            moveToCreateMode();
            setAlertMessage(saveResult.alertMessage);
          });
          return;
        }

        startTransition(() => {
          setPrompts(saveResult.prompts);
          syncEditingPrompt(saveResult.record);
          setNotice(PROMPT_UPDATED_MESSAGE);
          setAlertMessage(null);
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
      const nextPrompts = upsertPromptMeta(promptsRef.current, createdPrompt);

      startTransition(() => {
        setPrompts(nextPrompts);
        moveToCreateMode();
        setNotice(PROMPT_CREATED_MESSAGE);
        setAlertMessage(null);
      });
    } catch (error) {
      console.error('[promptit] Failed to save prompt.', error);
      setAlertMessage(getCaughtErrorMessage(error, SAVE_ERROR_MESSAGE));
    } finally {
      savingPromptIdRef.current = null;
      setSaveState({ status: 'idle' });
    }
  }

  async function movePromptWithinGroup(
    id: string,
    targetId: string,
    placement: PromptMovePlacement,
  ): Promise<boolean> {
    const movePlan = buildPromptMovePlan(
      promptsRef.current,
      id,
      targetId,
      placement,
    );

    if (!movePlan) {
      return false;
    }

    setNotice(null);

    if (conflictStateRef.current.status === 'idle') {
      setAlertMessage(null);
    }

    setSaveState({ status: 'saving' });

    try {
      const currentMode = modeRef.current;
      const result = await movePrompt(id, {
        group: movePlan.group,
        previousId: movePlan.previousId,
        nextId: movePlan.nextId,
        expectedUpdatedAt: movePlan.draggedPrompt.updatedAt,
      });

      if (result.ok) {
        const nextPrompts = upsertPromptMeta(promptsRef.current, result.meta);

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            setActivePrompt((current) =>
              current && current.id === id
                ? mergeMetaIntoRecord(current, result.meta)
                : current,
            );
            setMode((current) =>
              current.kind === 'edit' && current.promptId === id
                ? {
                    ...current,
                    expectedUpdatedAt: result.meta.updatedAt,
                    expectedBodyUpdatedAt: result.meta.bodyUpdatedAt,
                  }
                : current,
            );
          }
        });
        return true;
      }

      if (result.status === 'conflict') {
        const conflictMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.updateConflict',
        );
        const nextPrompts = upsertPromptMeta(
          promptsRef.current,
          result.currentMeta,
        );

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            setConflictState({
              status: 'stale',
              reason: 'external-update',
              promptId: id,
              message: EXTERNAL_CHANGE_MESSAGE,
              currentPrompt: result.currentMeta,
            });
            setAlertMessage(EXTERNAL_CHANGE_MESSAGE);
            return;
          }

          setAlertMessage(
            getConflictRetryAlertMessage(conflictMessage),
          );
        });
        return false;
      }

      if (result.status === 'not-found') {
        const notFoundMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.updateNotFound',
        );
        const nextPrompts = removePrompt(promptsRef.current, id);

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            moveToCreateMode();
            setAlertMessage(
              getNotFoundCreateModeAlertMessage(notFoundMessage),
            );
            return;
          }

          setAlertMessage(notFoundMessage);
        });
        return false;
      }

      throw new PromptitRuntimeError(result.message, result.messageDescriptor);
    } catch (error) {
      console.error('[promptit] Failed to move prompt.', error);
      setAlertMessage(getCaughtErrorMessage(error, REORDER_ERROR_MESSAGE));
      return false;
    } finally {
      setSaveState({ status: 'idle' });
    }
  }

  async function togglePromptPinned(
    id: string,
    pinned: boolean,
  ): Promise<boolean> {
    const targetPrompt = promptsRef.current.find((prompt) => prompt.id === id) ?? null;

    if (!targetPrompt || targetPrompt.pinned === pinned) {
      return false;
    }

    setNotice(null);

    if (conflictStateRef.current.status === 'idle') {
      setAlertMessage(null);
    }

    setSaveState({ status: 'saving' });

    try {
      const currentMode = modeRef.current;
      const result = await setPromptPinned(id, pinned, {
        expectedUpdatedAt: targetPrompt.updatedAt,
      });

      if (result.ok) {
        const nextPrompts = upsertPromptMeta(promptsRef.current, result.meta);

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            setActivePrompt((current) =>
              current && current.id === id
                ? mergeMetaIntoRecord(current, result.meta)
                : current,
            );
            setForm((current) => ({
              ...current,
              pinned: result.meta.pinned,
            }));
            setMode((current) =>
              current.kind === 'edit' && current.promptId === id
                ? {
                    ...current,
                    expectedUpdatedAt: result.meta.updatedAt,
                    expectedBodyUpdatedAt: result.meta.bodyUpdatedAt,
                  }
                : current,
            );
          }

          setNotice(
            result.meta.pinned
              ? PROMPT_PINNED_MESSAGE
              : PROMPT_UNPINNED_MESSAGE,
          );
          setAlertMessage(null);
        });
        return true;
      }

      if (result.status === 'conflict') {
        const conflictMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.pinConflict',
        );
        const nextPrompts = upsertPromptMeta(
          promptsRef.current,
          result.currentMeta,
        );

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            setConflictState({
              status: 'stale',
              reason: 'external-update',
              promptId: id,
              message: EXTERNAL_CHANGE_MESSAGE,
              currentPrompt: result.currentMeta,
            });
            setAlertMessage(EXTERNAL_CHANGE_MESSAGE);
            return;
          }

          setAlertMessage(
            getConflictRetryAlertMessage(conflictMessage),
          );
        });
        return false;
      }

      if (result.status === 'not-found') {
        const notFoundMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.pinNotFound',
        );
        const nextPrompts = removePrompt(promptsRef.current, id);

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            moveToCreateMode();
            setAlertMessage(
              getNotFoundCreateModeAlertMessage(notFoundMessage),
            );
            return;
          }

          setAlertMessage(notFoundMessage);
        });
        return false;
      }

      throw new PromptitRuntimeError(result.message, result.messageDescriptor);
    } catch (error) {
      console.error('[promptit] Failed to toggle prompt pinned state.', error);
      setAlertMessage(getCaughtErrorMessage(error, PIN_ERROR_MESSAGE));
      return false;
    } finally {
      setSaveState({ status: 'idle' });
    }
  }

  async function deletePromptById(id: string): Promise<void> {
    const targetPrompt = promptsRef.current.find((prompt) => prompt.id === id) ?? null;

    if (!targetPrompt) {
      return;
    }

    setNotice(null);
    setAlertMessage(null);
    setSaveState({ status: 'saving' });

    try {
      const currentMode = modeRef.current;
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
        const nextPrompts = removePrompt(promptsRef.current, id);

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            moveToCreateMode();
          }

          setNotice(PROMPT_DELETED_MESSAGE);
        });
        return;
      }

      if (result.status === 'conflict') {
        const conflictMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.deleteConflict',
        );
        const fallbackRecord =
          activePromptRef.current?.id === id ? activePromptRef.current : null;
        const nextPrompts = upsertPromptMeta(promptsRef.current, result.currentMeta);
        let conflictRecord: PromptRecord;

        try {
          conflictRecord = await resolveConflictRecord(
            result.currentMeta,
            fallbackRecord,
          );
        } catch (error) {
          console.error('[promptit] Failed to resolve delete conflict.', error);

          startTransition(() => {
            setPrompts(nextPrompts);
            setAlertMessage(BODY_LOAD_ERROR_MESSAGE);
          });
          return;
        }

        startTransition(() => {
          setPrompts(nextPrompts);

          setAlertMessage(
            getConflictRetryAlertMessage(conflictMessage),
          );
          syncConflictPrompt(
            conflictRecord,
            'delete-conflict',
            conflictMessage,
          );
        });
        return;
      }

      if (result.status === 'not-found') {
        const notFoundMessage = getRuntimeResponseMessage(
          result,
          'runtime.prompt.deleteNotFound',
        );
        const nextPrompts = removePrompt(promptsRef.current, id);

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            moveToCreateMode();
            setAlertMessage(
              getNotFoundCreateModeAlertMessage(notFoundMessage),
            );
            return;
          }

          setAlertMessage(notFoundMessage);
        });
        return;
      }

      throw new PromptitRuntimeError(result.message, result.messageDescriptor);
    } catch (error) {
      console.error('[promptit] Failed to delete prompt.', error);
      setAlertMessage(getCaughtErrorMessage(error, DELETE_ERROR_MESSAGE));
    } finally {
      setSaveState({ status: 'idle' });
    }
  }

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
