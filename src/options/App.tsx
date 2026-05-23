import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { type PromptMeta } from '../prompt/schema';
import { MetricCard } from './components';
import { OptionsToast, type OptionsToastMessage, type OptionsToastTone } from './OptionsToast';
import { PromptEditorPanel } from './PromptEditorPanel';
import { PromptList } from './PromptList';
import { UPDATE_NOT_FOUND_MESSAGE } from './promptEditorState';
import { usePromptEditor } from './usePromptEditor';

const DELETE_NOT_FOUND_CREATE_MODE_MESSAGE =
  '삭제할 프롬프트를 찾지 못했습니다. 프롬프트 추가 모드로 전환했습니다.';

const TOAST_NOTICE_MESSAGES = new Set([
  '프롬프트를 저장했습니다.',
  '프롬프트를 업데이트했습니다.',
  '프롬프트를 삭제했습니다.',
  '프롬프트를 고정했습니다.',
  '프롬프트 고정을 해제했습니다.',
]);

const INFO_TOAST_ALERT_MESSAGES = new Set([
  UPDATE_NOT_FOUND_MESSAGE,
  DELETE_NOT_FOUND_CREATE_MODE_MESSAGE,
]);

const ERROR_TOAST_ALERT_MESSAGES = new Set([
  '프롬프트 저장 중 오류가 발생했습니다.',
  '프롬프트 삭제 중 오류가 발생했습니다.',
  '프롬프트 순서 변경 중 오류가 발생했습니다.',
  '프롬프트 고정 상태 변경 중 오류가 발생했습니다.',
]);

function isToastNotice(message: string): boolean {
  return TOAST_NOTICE_MESSAGES.has(message);
}

function isToastAlert(message: string): boolean {
  return (
    INFO_TOAST_ALERT_MESSAGES.has(message) ||
    ERROR_TOAST_ALERT_MESSAGES.has(message)
  );
}

function getToastToneForAlert(message: string): OptionsToastTone {
  return INFO_TOAST_ALERT_MESSAGES.has(message) ? 'info' : 'error';
}

export default function App() {
  const {
    form,
    errors,
    notice,
    alertMessage,
    bodyLoadState,
    conflictState,
    loadState,
    isSaving,
    isDirty,
    isEditing,
    isEditorLoading,
    prompts,
    mode,
    startCreateMode,
    selectPrompt,
    updateField,
    submit,
    deletePromptById,
    movePromptWithinGroup,
    togglePromptPinned,
    clearNotice,
    clearAlertMessage,
  } = usePromptEditor();

  const statusRegionId = useId();
  const alertRegionId = useId();
  const toastIdRef = useRef(0);
  const toastHideTimerRef = useRef<number | null>(null);
  const [toastMessage, setToastMessage] = useState<OptionsToastMessage | null>(
    null,
  );

  const showOptionsToast = useCallback(
    (message: string, tone: OptionsToastTone): void => {
      if (toastHideTimerRef.current !== null) {
        window.clearTimeout(toastHideTimerRef.current);
      }

      const id = toastIdRef.current + 1;
      toastIdRef.current = id;
      setToastMessage({ id, message, tone });

      const duration = tone === 'error' ? 4000 : 2000;
      toastHideTimerRef.current = window.setTimeout(() => {
        setToastMessage((current) => (current?.id === id ? null : current));
        toastHideTimerRef.current = null;
      }, duration);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (toastHideTimerRef.current !== null) {
        window.clearTimeout(toastHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!notice || !isToastNotice(notice)) {
      return;
    }

    showOptionsToast(notice, 'success');
    clearNotice();
  }, [clearNotice, notice, showOptionsToast]);

  useEffect(() => {
    if (!alertMessage || !isToastAlert(alertMessage)) {
      return;
    }

    showOptionsToast(alertMessage, getToastToneForAlert(alertMessage));
    clearAlertMessage();
  }, [alertMessage, clearAlertMessage, showOptionsToast]);

  const loadStatusLabel =
    loadState.status === 'error'
      ? '불러오기 실패'
      : loadState.status === 'loading'
        ? '불러오는 중'
        : isEditorLoading
          ? '본문 불러오는 중'
        : isSaving
          ? '저장 중'
          : '대기 중';

  const listMessage =
    loadState.status === 'loading'
      ? '저장된 프롬프트를 불러오는 중입니다.'
      : loadState.status === 'error'
        ? loadState.message
        : prompts.length === 0
          ? '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 첫 프롬프트를 추가하세요.'
          : null;

  const activePromptId = mode.kind === 'edit' ? mode.promptId : null;
  const activePromptMeta =
    activePromptId !== null
      ? prompts.find((prompt) => prompt.id === activePromptId) ?? null
      : null;
  const bodyLoadErrorBlocksEditor =
    bodyLoadState.status === 'error' &&
    mode.kind === 'edit' &&
    bodyLoadState.promptId === mode.promptId;
  const editorUnavailable = isEditorLoading || bodyLoadErrorBlocksEditor;
  const editorDisabled = isSaving || editorUnavailable;
  const listActionDisabled =
    isSaving || isEditorLoading || loadState.status !== 'ready';
  const reorderDisabled =
    isSaving || isEditorLoading || loadState.status !== 'ready';
  const inlineNotice = notice && !isToastNotice(notice) ? notice : null;
  const inlineAlertMessage =
    alertMessage && !isToastAlert(alertMessage) ? alertMessage : null;

  function confirmDiscardDirtyForm(): boolean {
    return (
      !isDirty ||
      window.confirm(
        '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
      )
    );
  }

  function handleStartCreateMode(): void {
    if (!confirmDiscardDirtyForm()) {
      return;
    }

    startCreateMode();
  }

  async function handleSelectPrompt(prompt: PromptMeta): Promise<void> {
    if (!confirmDiscardDirtyForm()) {
      return;
    }

    await selectPrompt(prompt);
  }

  async function handleDelete(prompt: PromptMeta): Promise<void> {
    const shouldDelete = window.confirm(`"${prompt.title}" 프롬프트를 삭제할까요?`);

    if (!shouldDelete) {
      return;
    }

    await deletePromptById(prompt.id);
  }

  async function handleTogglePromptPinned(
    id: string,
    pinned: boolean,
  ): Promise<boolean> {
    const didToggle = await togglePromptPinned(id, pinned);

    if (didToggle) {
      showOptionsToast(
        pinned ? '프롬프트를 고정했습니다.' : '프롬프트 고정을 해제했습니다.',
        'success',
      );
      clearNotice();
    }

    return didToggle;
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <section className="rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_28px_70px_rgba(66,53,49,0.10)] backdrop-blur">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <p className="text-base font-semibold tracking-[0.3em] text-stone-500">
                promptit
              </p>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
                  프롬프트를 저장하고 붙여 넣으세요.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-stone-600">
                  이 페이지에서 프롬프트를 저장하고 수정하세요. ChatGPT, Gemini
                  사이트에서{' '}
                  <span className="inline-flex items-center gap-1 align-middle" aria-label="/ space">
                    <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-stone-300 bg-stone-50 px-2 py-1 font-mono text-[0.82em] font-semibold leading-none text-stone-900 shadow-[inset_0_-1px_0_rgba(68,64,59,0.14)]">
                      /
                    </kbd>
                    <kbd className="inline-flex items-center justify-center rounded-md border border-stone-300 bg-stone-50 px-2 py-1 font-mono text-[0.82em] font-semibold leading-none text-stone-900 shadow-[inset_0_-1px_0_rgba(68,64,59,0.14)]">
                      Space
                    </kbd>
                  </span>
                  를 입력하여 쉽게 붙여넣으세요. 목록에서 프롬프트를 끌어 순서를
                  변경할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="저장된 프롬프트" value={`${prompts.length}`} />
              <MetricCard
                label="편집 상태"
                value={isEditing ? '수정 중' : '추가 중'}
              />
              <MetricCard label="상태" value={loadStatusLabel} />
            </div>
          </div>
        </section>

        <div className="sr-only" aria-live="polite" aria-atomic="true" id={statusRegionId}>
          {loadState.status === 'loading'
            ? '저장된 프롬프트를 불러오는 중입니다.'
            : inlineNotice}
        </div>
        <div
          className="sr-only"
          aria-live="assertive"
          aria-atomic="true"
          id={alertRegionId}
        >
          {inlineAlertMessage}
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <PromptList
            activePromptId={activePromptId}
            isSaving={isSaving}
            listActionDisabled={listActionDisabled}
            listMessage={listMessage}
            loadStateStatus={loadState.status}
            movePromptWithinGroup={movePromptWithinGroup}
            onCreatePrompt={handleStartCreateMode}
            onDeletePrompt={handleDelete}
            onReorderFeedback={showOptionsToast}
            onSelectPrompt={handleSelectPrompt}
            prompts={prompts}
            reorderDisabled={reorderDisabled}
            statusRegionId={statusRegionId}
            togglePromptPinned={handleTogglePromptPinned}
          />

          <PromptEditorPanel
            activePromptMeta={activePromptMeta}
            alertMessage={inlineAlertMessage}
            bodyLoadState={bodyLoadState}
            clearAlertMessage={clearAlertMessage}
            clearNotice={clearNotice}
            conflictState={conflictState}
            editorDisabled={editorDisabled}
            errors={errors}
            form={form}
            isEditing={isEditing}
            isEditorLoading={isEditorLoading}
            isSaving={isSaving}
            loadStateStatus={loadState.status}
            notice={inlineNotice}
            onCancelEdit={handleStartCreateMode}
            onDeletePrompt={handleDelete}
            onSubmit={submit}
            updateField={updateField}
          />
        </section>
      </div>
      <OptionsToast toast={toastMessage} />
    </main>
  );
}
