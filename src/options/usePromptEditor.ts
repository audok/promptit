import { startTransition, useEffect, useRef, useState } from 'react';

import {
  PROMPTS_STORAGE_KEY,
  hasPromptDraftErrors,
  normalizePromptDraft,
  sortPrompts,
  validatePromptDraft,
  type PromptDraft,
  type PromptItem,
} from '../prompt/schema';
import {
  createPrompt,
  deletePrompt,
  getUserPrompts,
  subscribeToPrompts,
  updatePrompt,
} from '../prompt/storage';

const LOAD_ERROR_MESSAGE =
  '저장된 프롬프트를 읽지 못했습니다. 확장 프로그램을 다시 열어 확인해보세요.';
const UPDATE_NOT_FOUND_MESSAGE =
  '수정할 프롬프트를 찾지 못했습니다. 새 프롬프트 작성 모드로 전환했습니다.';
const DELETE_RECOVERY_MESSAGE =
  '편집 중인 프롬프트가 삭제되어 새 프롬프트 작성 모드로 전환했습니다.';
const EMPTY_SORT_ORDER_MESSAGE = '정렬 순서를 입력해주세요.';
const EXTERNAL_CHANGE_MESSAGE =
  '다른 창의 변경이 먼저 저장되었습니다. 현재 입력은 유지되며 저장 시 충돌이 발생할 수 있습니다.';

export type PromptFormState = {
  title: string;
  content: string;
  sortOrder: string;
};

export type PromptFormErrors = Partial<Record<keyof PromptFormState, string>>;

export type PromptEditorLoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export type PromptEditorSaveState =
  | { status: 'idle' }
  | { status: 'saving' };

export type PromptEditorMode =
  | { kind: 'create' }
  | { kind: 'edit'; promptId: string; expectedUpdatedAt: string };

export type PromptEditorConflictState =
  | { status: 'idle' }
  | {
      status: 'stale';
      reason: 'external-update' | 'save-conflict' | 'delete-conflict';
      promptId: string;
      message: string;
      currentPrompt: PromptItem;
    };

export type UsePromptEditorResult = {
  activePrompt: PromptItem | null;
  alertMessage: string | null;
  conflictState: PromptEditorConflictState;
  errors: PromptFormErrors;
  form: PromptFormState;
  isDirty: boolean;
  isEditing: boolean;
  isSaving: boolean;
  loadState: PromptEditorLoadState;
  mode: PromptEditorMode;
  notice: string | null;
  prompts: PromptItem[];
  saveState: PromptEditorSaveState;
  clearAlertMessage: () => void;
  clearNotice: () => void;
  deletePromptById: (id: string) => Promise<void>;
  selectPrompt: (prompt: PromptItem) => void;
  startCreateMode: () => void;
  submit: () => Promise<void>;
  updateField: (field: keyof PromptFormState, value: string) => void;
};

type ParsedPromptForm =
  | { ok: true; draft: PromptDraft }
  | { ok: false; errors: PromptFormErrors };

function getNextSortOrder(prompts: PromptItem[]): number {
  if (prompts.length === 0) {
    return 0;
  }

  return Math.max(...prompts.map((prompt) => prompt.sortOrder)) + 1;
}

function createEmptyForm(sortOrder: number): PromptFormState {
  return {
    title: '',
    content: '',
    sortOrder: String(sortOrder),
  };
}

function createFormFromPrompt(prompt: PromptItem): PromptFormState {
  return {
    title: prompt.title,
    content: prompt.content,
    sortOrder: String(prompt.sortOrder),
  };
}

function upsertPrompt(prompts: PromptItem[], prompt: PromptItem): PromptItem[] {
  return sortPrompts([
    ...prompts.filter((item) => item.id !== prompt.id),
    prompt,
  ]);
}

function removePrompt(prompts: PromptItem[], id: string): PromptItem[] {
  return prompts.filter((prompt) => prompt.id !== id);
}

function parsePromptForm(form: PromptFormState): ParsedPromptForm {
  const hasEmptySortOrder = form.sortOrder.trim().length === 0;
  const normalizedDraft = normalizePromptDraft({
    title: form.title,
    content: form.content,
    sortOrder: hasEmptySortOrder ? Number.NaN : Number(form.sortOrder),
  });
  const errors: PromptFormErrors = {
    ...validatePromptDraft(normalizedDraft),
  };

  if (hasEmptySortOrder) {
    errors.sortOrder = EMPTY_SORT_ORDER_MESSAGE;
  }

  if (hasPromptDraftErrors(errors)) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    draft: normalizedDraft,
  };
}

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return LOAD_ERROR_MESSAGE;
}

function ensurePromptStorageReadable(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return Promise.resolve();
  }

  return chrome.storage.local
    .get(PROMPTS_STORAGE_KEY)
    .then(() => undefined);
}

export function usePromptEditor(): UsePromptEditorResult {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [loadState, setLoadState] = useState<PromptEditorLoadState>({
    status: 'loading',
  });
  const [saveState, setSaveState] = useState<PromptEditorSaveState>({
    status: 'idle',
  });
  const [mode, setMode] = useState<PromptEditorMode>({ kind: 'create' });
  const [form, setForm] = useState<PromptFormState>(() => createEmptyForm(0));
  const [errors, setErrors] = useState<PromptFormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<PromptEditorConflictState>({
    status: 'idle',
  });
  const [isDirty, setIsDirty] = useState(false);

  const promptsRef = useRef(prompts);
  const modeRef = useRef(mode);
  const formRef = useRef(form);
  const conflictStateRef = useRef(conflictState);
  const isDirtyRef = useRef(isDirty);

  promptsRef.current = prompts;
  modeRef.current = mode;
  formRef.current = form;
  conflictStateRef.current = conflictState;
  isDirtyRef.current = isDirty;

  const activePrompt =
    mode.kind === 'edit'
      ? prompts.find((prompt) => prompt.id === mode.promptId) ?? null
      : null;

  function clearAlertMessage(): void {
    setAlertMessage(null);
  }

  function clearNotice(): void {
    setNotice(null);
  }

  function moveToCreateMode(nextPrompts: PromptItem[]): void {
    setMode({ kind: 'create' });
    setForm(createEmptyForm(getNextSortOrder(nextPrompts)));
    setErrors({});
    setIsDirty(false);
    setConflictState({ status: 'idle' });
  }

  function syncEditingPrompt(prompt: PromptItem): void {
    setMode({
      kind: 'edit',
      promptId: prompt.id,
      expectedUpdatedAt: prompt.updatedAt,
    });
    setForm(createFormFromPrompt(prompt));
    setErrors({});
    setIsDirty(false);
    setConflictState({ status: 'idle' });
  }

  function applyIncomingPrompts(nextPrompts: PromptItem[]): void {
    const currentMode = modeRef.current;
    const draftIsDirty = isDirtyRef.current;
    const sortedPrompts = sortPrompts(nextPrompts);

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

      if (!draftIsDirty) {
        syncEditingPrompt(currentPrompt);
        return;
      }

      if (currentPrompt.updatedAt !== currentMode.expectedUpdatedAt) {
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

    const syncPrompts = (nextPrompts: PromptItem[]) => {
      if (cancelled) {
        return;
      }

      applyIncomingPrompts(nextPrompts);
    };

    void ensurePromptStorageReadable()
      .then(() => getUserPrompts())
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

    const unsubscribe = subscribeToPrompts(syncPrompts);

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

  function selectPrompt(prompt: PromptItem): void {
    startTransition(() => {
      syncEditingPrompt(prompt);
      setNotice(null);
      setAlertMessage(null);
    });
  }

  function updateField(field: keyof PromptFormState, value: string): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
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
        const currentPrompt =
          promptsRef.current.find((prompt) => prompt.id === currentMode.promptId) ??
          null;

        if (!currentPrompt) {
          const nextPrompts = removePrompt(promptsRef.current, currentMode.promptId);

          startTransition(() => {
            setPrompts(nextPrompts);
            moveToCreateMode(nextPrompts);
            setAlertMessage(UPDATE_NOT_FOUND_MESSAGE);
          });
          return;
        }

        const result = await updatePrompt(currentMode.promptId, parsedForm.draft, {
          expectedUpdatedAt: currentMode.expectedUpdatedAt,
        });

        if (result.ok) {
          const nextPrompts = upsertPrompt(promptsRef.current, result.prompt);

          startTransition(() => {
            setPrompts(nextPrompts);
            syncEditingPrompt(result.prompt);
            setNotice('프롬프트를 업데이트했습니다.');
            setAlertMessage(null);
          });
          return;
        }

        if (result.status === 'conflict') {
          const nextPrompts = upsertPrompt(promptsRef.current, result.currentPrompt);

          startTransition(() => {
            setPrompts(nextPrompts);
            syncEditingPrompt(result.currentPrompt);
            setAlertMessage(
              `${result.message} 최신 저장본을 편집기에 반영했습니다.`,
            );
            setConflictState({
              status: 'stale',
              reason: 'save-conflict',
              promptId: result.currentPrompt.id,
              message: result.message,
              currentPrompt: result.currentPrompt,
            });
          });
          return;
        }

        if (result.status === 'not-found') {
          const nextPrompts = removePrompt(promptsRef.current, currentMode.promptId);

          startTransition(() => {
            setPrompts(nextPrompts);
            moveToCreateMode(nextPrompts);
            setAlertMessage(
              `${result.message} 새 프롬프트 작성 모드로 전환했습니다.`,
            );
          });
          return;
        }

        throw new Error(result.message);
      }

      const createdPrompt = await createPrompt(parsedForm.draft);
      const nextPrompts = upsertPrompt(promptsRef.current, createdPrompt);

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
      const result = await deletePrompt(id, {
        expectedUpdatedAt,
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
        const nextPrompts = upsertPrompt(promptsRef.current, result.currentPrompt);

        startTransition(() => {
          setPrompts(nextPrompts);

          if (currentMode.kind === 'edit' && currentMode.promptId === id) {
            syncEditingPrompt(result.currentPrompt);
          }

          setAlertMessage(
            `${result.message} 최신 저장본을 확인한 뒤 다시 시도해주세요.`,
          );
          setConflictState({
            status: 'stale',
            reason: 'delete-conflict',
            promptId: result.currentPrompt.id,
            message: result.message,
            currentPrompt: result.currentPrompt,
          });
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
    conflictState,
    errors,
    form,
    isDirty,
    isEditing: mode.kind === 'edit' && activePrompt !== null,
    isSaving: saveState.status === 'saving',
    loadState,
    mode,
    notice,
    prompts,
    saveState,
    clearAlertMessage,
    clearNotice,
    deletePromptById,
    selectPrompt,
    startCreateMode,
    submit,
    updateField,
  };
}
