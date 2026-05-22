import {
  hasPromptDraftErrors,
  normalizePromptDraft,
  sortPromptMetas,
  validatePromptDraft,
  type PromptDraft,
  type PromptMeta,
  type PromptMetaDraft,
  type PromptOrderGroup,
  type PromptRecord,
} from '../prompt/schema';

export const LOAD_ERROR_MESSAGE =
  '저장된 프롬프트를 읽지 못했습니다. 확장 프로그램을 다시 열어 확인해보세요.';
export const BODY_LOAD_ERROR_MESSAGE =
  '프롬프트 본문을 읽지 못했습니다. 잠시 후 다시 시도해주세요.';
export const UPDATE_NOT_FOUND_MESSAGE =
  '수정할 프롬프트를 찾지 못했습니다. 프롬프트 추가 모드로 전환했습니다.';
export const DELETE_RECOVERY_MESSAGE =
  '편집 중인 프롬프트가 삭제되어 프롬프트 추가 모드로 전환했습니다.';
export const EXTERNAL_CHANGE_MESSAGE =
  '다른 창의 변경이 먼저 저장되었습니다. 현재 입력은 유지되며 저장 시 충돌이 발생할 수 있습니다.';

export type PromptFormState = {
  title: string;
  content: string;
  pinned: boolean;
};

export type PromptFormErrors = Partial<
  Record<Exclude<keyof PromptFormState, 'pinned'>, string>
>;

export type PromptMovePlacement = 'before' | 'after';

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
  const draftErrors = validatePromptDraft(normalizedDraft);
  const errors: PromptFormErrors = {
    title: draftErrors.title,
    content: draftErrors.content,
  };

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

export function buildMetaDraft(
  form: NormalizedPromptForm,
): PromptMetaDraft {
  return {
    title: form.title,
  };
}

export function didMetaDraftChange(
  form: NormalizedPromptForm,
  activePrompt: PromptRecord,
): boolean {
  return form.title !== activePrompt.title;
}

export function didPinnedChange(
  form: NormalizedPromptForm,
  activePrompt: PromptRecord,
): boolean {
  return form.pinned !== activePrompt.pinned;
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

export function getLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return LOAD_ERROR_MESSAGE;
}

export function getConflictRetryAlertMessage(message: string): string {
  return `${message} 최신 저장본을 확인한 뒤 다시 시도해주세요.`;
}

export function getNotFoundCreateModeAlertMessage(message: string): string {
  return `${message} 프롬프트 추가 모드로 전환했습니다.`;
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
