import { startTransition, useEffect, useRef, useState } from 'react';

import {
  PROMPT_ORDER_GAP,
  hasPromptDraftErrors,
  normalizePromptDraft,
  sortPromptMetas,
  validatePromptDraft,
  type PromptDraft,
  type PromptMeta,
  type PromptMetaDraft,
  type PromptRecord,
} from '../prompt/schema';
import {
  createPrompt,
  deletePrompt,
  getPromptMetas,
  getPromptRecord,
  setPromptPinned,
  subscribeToPromptMetas,
  updatePromptBody,
  updatePromptMeta,
} from '../prompt/storage';

const LOAD_ERROR_MESSAGE =
  '저장된 프롬프트를 읽지 못했습니다. 확장 프로그램을 다시 열어 확인해보세요.';
const BODY_LOAD_ERROR_MESSAGE =
  '프롬프트 본문을 읽지 못했습니다. 잠시 후 다시 시도해주세요.';
const UPDATE_NOT_FOUND_MESSAGE =
  '수정할 프롬프트를 찾지 못했습니다. 새 프롬프트 작성 모드로 전환했습니다.';
const DELETE_RECOVERY_MESSAGE =
  '편집 중인 프롬프트가 삭제되어 새 프롬프트 작성 모드로 전환했습니다.';
const EMPTY_SORT_ORDER_MESSAGE = '정렬 순서를 입력해주세요.';
const INVALID_SORT_ORDER_MESSAGE = '정렬 순서는 0 이상의 정수여야 합니다.';
const EXTERNAL_CHANGE_MESSAGE =
  '다른 창의 변경이 먼저 저장되었습니다. 현재 입력은 유지되며 저장 시 충돌이 발생할 수 있습니다.';

export type PromptFormState = {
  title: string;
  content: string;
  sortOrder: string;
  pinned: boolean;
};

export type PromptFormErrors = Partial<
  Record<Exclude<keyof PromptFormState, 'pinned'>, string>
>;

export type PromptEditorLoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export type PromptEditorBodyLoadState =
  | { status: 'idle' }
  | { status: 'loading'; promptId: string }
  | { status: 'error'; promptId: string; message: string };

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
      message: string;
      currentPrompt: PromptMeta;
    };

export type UsePromptEditorResult = {
  activePrompt: PromptRecord | null;
  alertMessage: string | null;
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
  notice: string | null;
  prompts: PromptMeta[];
  clearAlertMessage: () => void;
  clearNotice: () => void;
  deletePromptById: (id: string) => Promise<void>;
  selectPrompt: (prompt: PromptMeta) => Promise<void>;
  startCreateMode: () => void;
  submit: () => Promise<void>;
  updateField: (field: keyof PromptFormState, value: string | boolean) => void;
};

type NormalizedPromptForm = {
  title: string;
  content: string;
  sortOrder: number;
  pinned: boolean;
};

type ParsedPromptForm =
  | { ok: true; form: NormalizedPromptForm }
  | { ok: false; errors: PromptFormErrors };

function getPromptDisplayOrder(prompt: PromptMeta): number {
  return prompt.pinned ? prompt.pinnedOrder ?? prompt.normalOrder : prompt.normalOrder;
}

function getNextOrder(
  prompts: PromptMeta[],
  pinned: boolean,
): number {
  const groupOrders = prompts
    .filter((prompt) => prompt.pinned === pinned)
    .map((prompt) => getPromptDisplayOrder(prompt));

  if (groupOrders.length === 0) {
    return PROMPT_ORDER_GAP;
  }

  return Math.max(...groupOrders) + PROMPT_ORDER_GAP;
}

function createEmptyForm(sortOrder: number): PromptFormState {
  return {
    title: '',
    content: '',
    sortOrder: String(sortOrder),
    pinned: false,
  };
}

function createLoadingFormFromMeta(prompt: PromptMeta): PromptFormState {
  return {
    title: prompt.title,
    content: '',
    sortOrder: String(getPromptDisplayOrder(prompt)),
    pinned: prompt.pinned,
  };
}

function createFormFromPrompt(prompt: PromptRecord): PromptFormState {
  return {
    title: prompt.title,
    content: prompt.content,
    sortOrder: String(getPromptDisplayOrder(prompt)),
    pinned: prompt.pinned,
  };
}

function upsertPromptMeta(
  prompts: PromptMeta[],
  prompt: PromptMeta,
): PromptMeta[] {
  return sortPromptMetas([
    ...prompts.filter((item) => item.id !== prompt.id),
    prompt,
  ]);
}

function removePrompt(prompts: PromptMeta[], id: string): PromptMeta[] {
  return prompts.filter((prompt) => prompt.id !== id);
}

function parsePromptForm(form: PromptFormState): ParsedPromptForm {
  const hasEmptySortOrder = form.sortOrder.trim().length === 0;
  const sortOrder = hasEmptySortOrder ? Number.NaN : Number(form.sortOrder);
  const normalizedDraft = normalizePromptDraft({
    title: form.title,
    content: form.content,
    pinned: form.pinned,
    normalOrder: form.pinned ? PROMPT_ORDER_GAP : sortOrder,
    pinnedOrder: form.pinned ? sortOrder : null,
  });
  const errors: PromptFormErrors = {
    ...validatePromptDraft(normalizedDraft),
  };

  if (hasEmptySortOrder) {
    errors.sortOrder = EMPTY_SORT_ORDER_MESSAGE;
  } else if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.sortOrder = INVALID_SORT_ORDER_MESSAGE;
  }

  if (hasPromptDraftErrors(errors)) {
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
      sortOrder,
      pinned: form.pinned,
    },
  };
}

function buildCreateDraft(form: NormalizedPromptForm): PromptDraft {
  return {
    title: form.title,
    content: form.content,
    pinned: form.pinned,
    normalOrder: form.pinned ? PROMPT_ORDER_GAP : form.sortOrder,
    pinnedOrder: form.pinned ? form.sortOrder : null,
  };
}

function buildMetaDraft(
  form: NormalizedPromptForm,
  activePrompt: PromptRecord,
): PromptMetaDraft {
  return {
    title: form.title,
    normalOrder: form.pinned ? activePrompt.normalOrder : form.sortOrder,
    pinnedOrder: form.pinned ? form.sortOrder : null,
  };
}

function didMetaDraftChange(
  form: NormalizedPromptForm,
  activePrompt: PromptRecord,
): boolean {
  return (
    form.title !== activePrompt.title ||
    form.sortOrder !== getPromptDisplayOrder(activePrompt)
  );
}

function didPinnedChange(
  form: NormalizedPromptForm,
  activePrompt: PromptRecord,
): boolean {
  return form.pinned !== activePrompt.pinned;
}

function mergeMetaIntoRecord(
  current: PromptRecord,
  meta: PromptMeta,
): PromptRecord {
  return {
    ...current,
    ...meta,
  };
}

async function resolveConflictRecord(
  meta: PromptMeta,
  fallback: PromptRecord | null,
): Promise<PromptRecord> {
  try {
    return await getPromptRecord(meta.id);
  } catch (error) {
    console.error('[promptit] Failed to load conflicted prompt body.', error);

    return {
      ...meta,
      content: fallback?.content ?? '',
    };
  }
}

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return LOAD_ERROR_MESSAGE;
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
  const [form, setForm] = useState<PromptFormState>(() =>
    createEmptyForm(PROMPT_ORDER_GAP),
  );
  const [errors, setErrors] = useState<PromptFormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
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
  const bodyLoadRequestIdRef = useRef(0);

  promptsRef.current = prompts;
  activePromptRef.current = activePrompt;
  modeRef.current = mode;
  formRef.current = form;
  conflictStateRef.current = conflictState;
  isDirtyRef.current = isDirty;

  function clearAlertMessage(): void {
    setAlertMessage(null);
  }

  function clearNotice(): void {
    setNotice(null);
  }

  function moveToCreateMode(nextPrompts: PromptMeta[]): void {
    bodyLoadRequestIdRef.current += 1;
    setMode({ kind: 'create' });
    setActivePrompt(null);
    setBodyLoadState({ status: 'idle' });
    setForm(createEmptyForm(getNextOrder(nextPrompts, false)));
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
    message: string,
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
    bodyLoadRequestIdRef.current = requestId;

    startTransition(() => {
      setMode({
        kind: 'edit',
        promptId: prompt.id,
        expectedUpdatedAt: prompt.updatedAt,
        expectedBodyUpdatedAt: prompt.bodyUpdatedAt,
      });
      setActivePrompt(null);
      setBodyLoadState({ status: 'loading', promptId: prompt.id });
      setForm(createLoadingFormFromMeta(prompt));
      setErrors({});
      setIsDirty(false);
      setConflictState({ status: 'idle' });
      setNotice(null);
      setAlertMessage(null);
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
        setAlertMessage(BODY_LOAD_ERROR_MESSAGE);
      });
    }
  }

  function applyIncomingPrompts(nextPrompts: PromptMeta[]): void {
    const currentMode = modeRef.current;
    const draftIsDirty = isDirtyRef.current;
    const sortedPrompts = sortPromptMetas(nextPrompts);

    startTransition(() => {
      setPrompts(sortedPrompts);
      setLoadState({ status: 'ready' });

      if (currentMode.kind === 'create') {
        if (!draftIsDirty) {
          moveToCreateMode(sortedPrompts);
        }
        return;
      }

      const currentPrompt =
        sortedPrompts.find((prompt) => prompt.id === currentMode.promptId) ??
        null;

      if (!currentPrompt) {
        moveToCreateMode(sortedPrompts);
        setNotice(DELETE_RECOVERY_MESSAGE);
        setAlertMessage(null);
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

    const syncPrompts = (nextPrompts: PromptMeta[]) => {
      if (cancelled) {
        return;
      }

      applyIncomingPrompts(nextPrompts);
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

  function startCreateMode(): void {
    startTransition(() => {
      moveToCreateMode(promptsRef.current);
      setNotice(null);
      setAlertMessage(null);
    });
  }

  async function selectPrompt(prompt: PromptMeta): Promise<void> {
    await loadPromptRecord(prompt);
  }

  function updateField(field: keyof PromptFormState, value: string | boolean): void {
    if (field === 'pinned') {
      const pinned = Boolean(value);
      const currentPrompt = activePromptRef.current;
      const nextOrder =
        modeRef.current.kind === 'edit' && currentPrompt
          ? pinned
            ? currentPrompt.pinnedOrder ?? getNextOrder(promptsRef.current, true)
            : currentPrompt.normalOrder
          : getNextOrder(promptsRef.current, pinned);

      setForm((current) => ({
        ...current,
        pinned,
        sortOrder: String(nextOrder),
      }));
    } else {
      setForm((current) => ({
        ...current,
        [field]: String(value),
      }));
    }

    setErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
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

    const parsedForm = parsePromptForm(formRef.current);

    if (!parsedForm.ok) {
      setErrors(parsedForm.errors);
      return;
    }

    setErrors({});
    setSaveState({ status: 'saving' });

    try {
      const currentMode = modeRef.current;

      if (currentMode.kind === 'edit') {
        const currentRecord = activePromptRef.current;
        const currentMeta =
          promptsRef.current.find((prompt) => prompt.id === currentMode.promptId) ??
          null;

        if (!currentMeta || !currentRecord) {
          const nextPrompts = removePrompt(promptsRef.current, currentMode.promptId);

          startTransition(() => {
            setPrompts(nextPrompts);
            moveToCreateMode(nextPrompts);
            setAlertMessage(UPDATE_NOT_FOUND_MESSAGE);
          });
          return;
        }

        let nextRecord = currentRecord;
        let nextPrompts = promptsRef.current;

        if (didPinnedChange(parsedForm.form, currentRecord)) {
          const pinnedResult = await setPromptPinned(
            currentMode.promptId,
            parsedForm.form.pinned,
            {
              expectedUpdatedAt: nextRecord.updatedAt,
            },
          );

          if (pinnedResult.ok) {
            nextRecord = mergeMetaIntoRecord(nextRecord, pinnedResult.meta);
            nextPrompts = upsertPromptMeta(nextPrompts, pinnedResult.meta);
          } else if (pinnedResult.status === 'conflict') {
            const conflictRecord = await resolveConflictRecord(
              pinnedResult.currentMeta,
              currentRecord,
            );
            const updatedPrompts = upsertPromptMeta(
              promptsRef.current,
              pinnedResult.currentMeta,
            );

            startTransition(() => {
              setPrompts(updatedPrompts);
              setAlertMessage(
                `${pinnedResult.message} 최신 저장본을 확인한 뒤 다시 시도해주세요.`,
              );
              syncConflictPrompt(
                conflictRecord,
                'save-conflict',
                pinnedResult.message,
              );
            });
            return;
          } else if (pinnedResult.status === 'not-found') {
            const updatedPrompts = removePrompt(
              promptsRef.current,
              currentMode.promptId,
            );

            startTransition(() => {
              setPrompts(updatedPrompts);
              moveToCreateMode(updatedPrompts);
              setAlertMessage(
                `${pinnedResult.message} 새 프롬프트 작성 모드로 전환했습니다.`,
              );
            });
            return;
          } else {
            throw new Error(pinnedResult.message);
          }
        }

        if (didMetaDraftChange(parsedForm.form, nextRecord)) {
          const metaResult = await updatePromptMeta(
            currentMode.promptId,
            buildMetaDraft(parsedForm.form, nextRecord),
            {
              expectedUpdatedAt: nextRecord.updatedAt,
            },
          );

          if (metaResult.ok) {
            nextRecord = mergeMetaIntoRecord(nextRecord, metaResult.meta);
            nextPrompts = upsertPromptMeta(nextPrompts, metaResult.meta);
          } else if (metaResult.status === 'conflict') {
            const conflictRecord = await resolveConflictRecord(
              metaResult.currentMeta,
              currentRecord,
            );
            const updatedPrompts = upsertPromptMeta(
              promptsRef.current,
              metaResult.currentMeta,
            );

            startTransition(() => {
              setPrompts(updatedPrompts);
              setAlertMessage(
                `${metaResult.message} 최신 저장본을 확인한 뒤 다시 시도해주세요.`,
              );
              syncConflictPrompt(
                conflictRecord,
                'save-conflict',
                metaResult.message,
              );
            });
            return;
          } else if (metaResult.status === 'not-found') {
            const updatedPrompts = removePrompt(
              promptsRef.current,
              currentMode.promptId,
            );

            startTransition(() => {
              setPrompts(updatedPrompts);
              moveToCreateMode(updatedPrompts);
              setAlertMessage(
                `${metaResult.message} 새 프롬프트 작성 모드로 전환했습니다.`,
              );
            });
            return;
          } else {
            throw new Error(metaResult.message);
          }
        }

        if (parsedForm.form.content !== currentRecord.content) {
          const bodyResult = await updatePromptBody(
            currentMode.promptId,
            parsedForm.form.content,
            {
              expectedBodyUpdatedAt: currentMode.expectedBodyUpdatedAt,
            },
          );

          if (bodyResult.ok) {
            nextRecord = bodyResult.prompt;
            nextPrompts = upsertPromptMeta(nextPrompts, nextRecord);
          } else if (bodyResult.status === 'conflict') {
            const conflictRecord =
              bodyResult.currentRecord ??
              await resolveConflictRecord(bodyResult.currentMeta, currentRecord);
            const updatedPrompts = upsertPromptMeta(
              nextPrompts,
              bodyResult.currentMeta,
            );

            startTransition(() => {
              setPrompts(updatedPrompts);
              setAlertMessage(
                `${bodyResult.message} 최신 저장본을 확인한 뒤 다시 시도해주세요.`,
              );
              syncConflictPrompt(
                conflictRecord,
                'save-conflict',
                bodyResult.message,
              );
            });
            return;
          } else if (bodyResult.status === 'not-found') {
            const updatedPrompts = removePrompt(
              nextPrompts,
              currentMode.promptId,
            );

            startTransition(() => {
              setPrompts(updatedPrompts);
              moveToCreateMode(updatedPrompts);
              setAlertMessage(
                `${bodyResult.message} 새 프롬프트 작성 모드로 전환했습니다.`,
              );
            });
            return;
          } else {
            throw new Error(bodyResult.message);
          }
        }

        startTransition(() => {
          setPrompts(nextPrompts);
          syncEditingPrompt(nextRecord);
          setNotice('프롬프트를 업데이트했습니다.');
          setAlertMessage(null);
        });
        return;
      }

      const createdPrompt = await createPrompt(
        buildCreateDraft(parsedForm.form),
      ) as PromptRecord;
      const nextPrompts = upsertPromptMeta(promptsRef.current, createdPrompt);

      startTransition(() => {
        setPrompts(nextPrompts);
        moveToCreateMode(nextPrompts);
        setNotice('프롬프트를 저장했습니다.');
        setAlertMessage(null);
      });
    } catch (error) {
      console.error('[promptit] Failed to save prompt.', error);
      setAlertMessage(
        error instanceof Error
          ? error.message
          : '프롬프트 저장 중 오류가 발생했습니다.',
      );
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
            moveToCreateMode(nextPrompts);
          }

          setNotice('프롬프트를 삭제했습니다.');
        });
        return;
      }

      if (result.status === 'conflict') {
        const conflictRecord = await resolveConflictRecord(
          result.currentMeta,
          'currentPrompt' in result
            ? {
                ...result.currentMeta,
                content: result.currentPrompt.content,
              }
            : activePromptRef.current,
        );
        const nextPrompts = upsertPromptMeta(promptsRef.current, result.currentMeta);

        startTransition(() => {
          setPrompts(nextPrompts);

          setAlertMessage(
            `${result.message} 최신 저장본을 확인한 뒤 다시 시도해주세요.`,
          );
          syncConflictPrompt(
            conflictRecord,
            'delete-conflict',
            result.message,
          );
        });
        return;
      }

      if (result.status === 'not-found') {
        const nextPrompts = removePrompt(promptsRef.current, id);

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            moveToCreateMode(nextPrompts);
            setAlertMessage(
              `${result.message} 새 프롬프트 작성 모드로 전환했습니다.`,
            );
            return;
          }

          setAlertMessage(result.message);
        });
        return;
      }

      throw new Error(result.message);
    } catch (error) {
      console.error('[promptit] Failed to delete prompt.', error);
      setAlertMessage(
        error instanceof Error
          ? error.message
          : '프롬프트 삭제 중 오류가 발생했습니다.',
      );
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
    selectPrompt,
    startCreateMode,
    submit,
    updateField,
  };
}
