import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { type PromptMeta } from '../prompt/schema';
import { usePromptEditor } from './usePromptEditor';

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

type DropPlacement = 'before' | 'after';

type DropIndicatorState = {
  placement: DropPlacement;
  targetId: string;
} | null;

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

  const titleInputId = useId();
  const contentInputId = useId();
  const statusRegionId = useId();
  const alertRegionId = useId();
  const conflictHintId = useId();

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingInvalidFocusRef = useRef(false);
  const [draggingPromptId, setDraggingPromptId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState>(null);
  const [reorderMessage, setReorderMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingInvalidFocusRef.current) {
      return;
    }

    if (errors.title) {
      titleInputRef.current?.focus();
      pendingInvalidFocusRef.current = false;
      return;
    }

    if (errors.content) {
      contentInputRef.current?.focus();
      pendingInvalidFocusRef.current = false;
      return;
    }

    if (!isSaving) {
      pendingInvalidFocusRef.current = false;
    }
  }, [errors, isSaving]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    pendingInvalidFocusRef.current = true;
    await submit();
  }

  const activePromptId = mode.kind === 'edit' ? mode.promptId : null;
  const activePromptMeta =
    activePromptId !== null
      ? prompts.find((prompt) => prompt.id === activePromptId) ?? null
      : null;
  const editorDisabled = isSaving || isEditorLoading;
  const listActionDisabled =
    isSaving || isEditorLoading || loadState.status !== 'ready';
  const reorderDisabled =
    isSaving || isEditorLoading || loadState.status !== 'ready';

  function getPromptGroup(prompt: PromptMeta): 'pinned' | 'normal' {
    return prompt.pinned ? 'pinned' : 'normal';
  }

  function getPromptGroupLabel(prompt: PromptMeta): string {
    return prompt.pinned ? '고정됨' : '일반';
  }

  function getPromptGroupPrompts(prompt: PromptMeta): PromptMeta[] {
    return prompts.filter((item) => item.pinned === prompt.pinned);
  }

  function getDropPlacement(event: DragEvent<HTMLElement>): DropPlacement {
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    return event.clientY < midpoint ? 'before' : 'after';
  }

  function isSamePositionMove(
    draggedPrompt: PromptMeta,
    targetPrompt: PromptMeta,
    placement: DropPlacement,
  ): boolean {
    if (draggedPrompt.id === targetPrompt.id) {
      return true;
    }

    const groupPrompts = getPromptGroupPrompts(draggedPrompt);
    const draggedIndex = groupPrompts.findIndex(
      (prompt) => prompt.id === draggedPrompt.id,
    );
    const targetIndex = groupPrompts.findIndex(
      (prompt) => prompt.id === targetPrompt.id,
    );

    if (draggedIndex < 0 || targetIndex < 0) {
      return true;
    }

    return placement === 'before'
      ? draggedIndex === targetIndex - 1
      : draggedIndex === targetIndex + 1;
  }

  async function reorderPrompt(
    draggedPrompt: PromptMeta,
    targetPrompt: PromptMeta,
    placement: DropPlacement,
  ): Promise<void> {
    if (getPromptGroup(draggedPrompt) !== getPromptGroup(targetPrompt)) {
      setReorderMessage(
        '고정됨 목록과 일반 목록 사이에서는 끌어서 순서를 바꿀 수 없습니다.',
      );
      return;
    }

    if (isSamePositionMove(draggedPrompt, targetPrompt, placement)) {
      return;
    }

    setReorderMessage(null);

    try {
      const didMove = await movePromptWithinGroup(
        draggedPrompt.id,
        targetPrompt.id,
        placement,
      );

      if (didMove) {
        setReorderMessage(`${draggedPrompt.title} 순서를 변경했습니다.`);
      }
    } catch (error) {
      console.error('[promptit] Failed to reorder prompt in options page.', error);
      setReorderMessage('프롬프트 순서를 바꾸지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    prompt: PromptMeta,
  ): void {
    if (reorderDisabled) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', prompt.id);
    setDraggingPromptId(prompt.id);
    setDropIndicator(null);
    setReorderMessage(null);
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
    targetPrompt: PromptMeta,
  ): void {
    const draggedPrompt =
      draggingPromptId !== null
        ? prompts.find((prompt) => prompt.id === draggingPromptId) ?? null
        : null;

    if (reorderDisabled || draggedPrompt === null) {
      return;
    }

    event.preventDefault();

    if (getPromptGroup(draggedPrompt) !== getPromptGroup(targetPrompt)) {
      event.dataTransfer.dropEffect = 'none';
      setDropIndicator(null);
      return;
    }

    const placement = getDropPlacement(event);
    const isNoopMove = isSamePositionMove(
      draggedPrompt,
      targetPrompt,
      placement,
    );
    event.dataTransfer.dropEffect = isNoopMove ? 'none' : 'move';
    setDropIndicator(
      isNoopMove
        ? null
        : {
            targetId: targetPrompt.id,
            placement,
          },
    );
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>,
    prompt: PromptMeta,
  ): void {
    const relatedTarget = event.relatedTarget;

    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    setDropIndicator((current) =>
      current?.targetId === prompt.id ? null : current,
    );
  }

  async function handleDrop(
    event: DragEvent<HTMLDivElement>,
    targetPrompt: PromptMeta,
  ): Promise<void> {
    event.preventDefault();

    const draggedId =
      draggingPromptId ?? event.dataTransfer.getData('text/plain') ?? null;
    const draggedPrompt =
      draggedId !== null
        ? prompts.find((prompt) => prompt.id === draggedId) ?? null
        : null;

    setDropIndicator(null);
    setDraggingPromptId(null);

    if (reorderDisabled || draggedPrompt === null) {
      return;
    }

    await reorderPrompt(draggedPrompt, targetPrompt, getDropPlacement(event));
  }

  async function handleKeyboardReorder(
    prompt: PromptMeta,
    direction: 'up' | 'down',
  ): Promise<void> {
    if (reorderDisabled) {
      return;
    }

    const groupPrompts = getPromptGroupPrompts(prompt);
    const promptIndex = groupPrompts.findIndex((item) => item.id === prompt.id);
    const targetPrompt =
      promptIndex >= 0
        ? groupPrompts[promptIndex + (direction === 'up' ? -1 : 1)] ?? null
        : null;

    if (targetPrompt === null) {
      setReorderMessage(
        direction === 'up'
          ? `${prompt.title}은 이미 ${getPromptGroupLabel(prompt)} 목록의 첫 번째입니다.`
          : `${prompt.title}은 이미 ${getPromptGroupLabel(prompt)} 목록의 마지막입니다.`,
      );
      return;
    }

    await reorderPrompt(
      prompt,
      targetPrompt,
      direction === 'up' ? 'before' : 'after',
    );
  }

  async function handleTogglePinned(prompt: PromptMeta): Promise<void> {
    if (listActionDisabled) {
      return;
    }

    await togglePromptPinned(prompt.id, !prompt.pinned);
  }

  async function handleDelete(prompt: PromptMeta): Promise<void> {
    const shouldDelete = window.confirm(`"${prompt.title}" 프롬프트를 삭제할까요?`);

    if (!shouldDelete) {
      return;
    }

    await deletePromptById(prompt.id);
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <section className="rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_28px_70px_rgba(66,53,49,0.10)] backdrop-blur">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
                Promptit
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
                value={isEditing ? '수정 중' : '새로 작성'}
              />
              <MetricCard label="상태" value={loadStatusLabel} />
            </div>
          </div>
        </section>

        <div className="sr-only" aria-live="polite" aria-atomic="true" id={statusRegionId}>
          {loadState.status === 'loading'
            ? '저장된 프롬프트를 불러오는 중입니다.'
            : [notice, reorderMessage].filter(Boolean).join(' ')}
        </div>
        <div
          className="sr-only"
          aria-live="assertive"
          aria-atomic="true"
          id={alertRegionId}
        >
          {alertMessage}
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article
            className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]"
            aria-busy={loadState.status === 'loading' || isSaving}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  프롬프트 목록
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-900">
                  저장된 프롬프트
                </h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700 transition hover:border-stone-400 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={startCreateMode}
                disabled={isSaving}
              >
                새 프롬프트
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {listMessage ? <EmptyPanel message={listMessage} /> : null}

              {loadState.status === 'ready' && prompts.length > 0 ? (
                <div className="space-y-3" role="list">
                  {prompts.map((prompt) => {
                    const isActive = prompt.id === activePromptId;
                    const showBeforeIndicator =
                      dropIndicator?.targetId === prompt.id &&
                      dropIndicator.placement === 'before';
                    const showAfterIndicator =
                      dropIndicator?.targetId === prompt.id &&
                      dropIndicator.placement === 'after';

                    return (
                      <div
                        key={prompt.id}
                        role="listitem"
                        onDragOver={(event) => {
                          handleDragOver(event, prompt);
                        }}
                        onDragLeave={(event) => {
                          handleDragLeave(event, prompt);
                        }}
                        onDrop={(event) => {
                          void handleDrop(event, prompt);
                        }}
                      >
                        {showBeforeIndicator ? <InsertionIndicator /> : null}
                        <div
                          className={`rounded-[24px] border px-4 py-4 transition ${
                            isActive
                              ? 'border-[#2f2f2f] bg-[#2f2f2f] text-stone-50 shadow-[0_18px_34px_rgba(47,47,47,0.14)]'
                              : 'border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-300 hover:bg-stone-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="mt-1 flex shrink-0 flex-col items-center gap-2">
                              <button
                                type="button"
                                className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                                  isActive
                                    ? prompt.pinned
                                      ? 'border-white/20 bg-white/15 text-white hover:bg-white/20'
                                      : 'border-white/15 bg-white/10 text-stone-300 hover:bg-white/15'
                                    : prompt.pinned
                                      ? 'border-stone-900 bg-stone-900 text-white hover:bg-stone-800'
                                      : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-800'
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                                onClick={() => {
                                  void handleTogglePinned(prompt);
                                }}
                                disabled={listActionDisabled}
                                aria-label={
                                  prompt.pinned
                                    ? `${prompt.title} 고정 해제`
                                    : `${prompt.title} 고정`
                                }
                                aria-pressed={prompt.pinned}
                                title={prompt.pinned ? '고정 해제' : '고정'}
                                data-testid="prompt-pin-toggle"
                              >
                                <PinIcon filled={prompt.pinned} />
                              </button>

                              <button
                                type="button"
                                className={`flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-full border transition active:cursor-grabbing ${
                                  isActive
                                    ? 'border-white/15 bg-white/10 text-stone-200 hover:bg-white/15'
                                    : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-100'
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                                draggable={!reorderDisabled}
                                onDragStart={(event) => {
                                  handleDragStart(event, prompt);
                                }}
                                onDragEnd={() => {
                                  setDraggingPromptId(null);
                                  setDropIndicator(null);
                                }}
                                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                                  if (
                                    event.key !== 'ArrowUp' &&
                                    event.key !== 'ArrowDown'
                                  ) {
                                    return;
                                  }

                                  event.preventDefault();
                                  void handleKeyboardReorder(
                                    prompt,
                                    event.key === 'ArrowUp' ? 'up' : 'down',
                                  );
                                }}
                                disabled={reorderDisabled}
                                aria-label={`${prompt.title} 순서 변경`}
                                aria-describedby={statusRegionId}
                                title="순서 변경"
                                data-testid="prompt-drag-handle"
                              >
                                <DragHandleIcon />
                              </button>
                            </div>
                            <button
                              type="button"
                              className="min-w-0 flex-1 cursor-pointer text-left"
                              onClick={() => {
                                selectPrompt(prompt);
                              }}
                              disabled={isSaving}
                              aria-pressed={isActive}
                              aria-current={isActive ? 'true' : undefined}
                              data-testid="prompt-card"
                            >
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                              <span
                                className={`rounded-full px-2 py-1 tracking-[0.12em] ${
                                  isActive
                                    ? 'bg-white/10 text-stone-200'
                                    : prompt.pinned
                                      ? 'bg-stone-900 text-stone-50'
                                      : 'bg-white text-stone-500'
                                }`}
                              >
                                {prompt.pinned ? '고정됨' : '일반'}
                              </span>
                              <span
                                className={
                                  isActive ? 'text-stone-500' : 'text-stone-300'
                                }
                              >
                                •
                              </span>
                              <span
                                className={
                                  isActive ? 'text-stone-300' : 'text-stone-500'
                                }
                              >
                                {prompt.charCount.toLocaleString('ko-KR')}자
                              </span>
                            </div>
                            <p className="mt-3 text-lg font-semibold tracking-tight">
                              {prompt.title}
                            </p>
                            <dl
                              className={`mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-2 ${
                                isActive ? 'text-stone-300' : 'text-stone-600'
                              }`}
                            >
                              <MetaLine label="수정" value={formatTimestamp(prompt.updatedAt)} />
                              <MetaLine
                                label="추가"
                                value={formatTimestamp(prompt.createdAt)}
                              />
                            </dl>
                          </button>

                          <button
                            type="button"
                            className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
                              isActive
                                ? 'border-rose-200/20 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25'
                                : 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                            onClick={() => {
                              void handleDelete(prompt);
                            }}
                            disabled={isSaving}
                            aria-label="목록에서 프롬프트 삭제"
                          >
                            삭제
                          </button>
                          </div>
                        </div>
                        {showAfterIndicator ? <InsertionIndicator /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </article>

          <article
            className="rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,#fef8f5,#f7eee8)] p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]"
            aria-busy={isSaving}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  편집기
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-900">
                  {isEditing ? '프롬프트 수정' : '새 프롬프트 추가'}
                </h2>
              </div>
              {isEditing ? (
                <button
                  type="button"
                  className="rounded-full border border-stone-300 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={startCreateMode}
                  disabled={isSaving}
                >
                  편집 취소
                </button>
              ) : null}
            </div>

            {notice ? (
              <Banner
                tone="success"
                role="status"
                message={notice}
                onDismiss={clearNotice}
              />
            ) : null}

            {alertMessage ? (
              <Banner
                tone="danger"
                role="alert"
                message={alertMessage}
                onDismiss={clearAlertMessage}
              />
            ) : null}

            {conflictState.status === 'stale' ? (
              <div
                className="mt-5 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900"
                role="status"
                aria-live="polite"
                id={conflictHintId}
              >
                <p className="font-semibold">충돌 감지됨</p>
                <p className="mt-2 leading-6">{conflictState.message}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-amber-700">
                  최신 저장본 {formatTimestamp(conflictState.currentPrompt.updatedAt)}
                </p>
              </div>
            ) : null}

            {bodyLoadState.status === 'loading' ? (
              <div
                className="mt-5 rounded-[20px] border border-stone-200 bg-white/70 px-4 py-4 text-sm text-stone-600"
                role="status"
                aria-live="polite"
              >
                선택한 프롬프트 본문을 불러오는 중입니다.
              </div>
            ) : null}

            <form
              className="mt-5 space-y-5"
              onSubmit={(event) => void handleSubmit(event)}
              aria-busy={isEditorLoading || isSaving}
            >
              <Field
                inputId={titleInputId}
                label="제목"
                error={errors.title}
                hint="1자 이상 40자 이하"
              >
                <input
                  ref={titleInputRef}
                  id={titleInputId}
                  type="text"
                  value={form.title}
                  onChange={(event) => {
                    updateField('title', event.target.value);
                  }}
                  className="w-full rounded-[18px] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                  placeholder="예: 회의록 정리"
                  maxLength={40}
                  disabled={editorDisabled}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={getDescribedBy(titleInputId, {
                    hasError: Boolean(errors.title),
                    includeConflictHint: conflictState.status === 'stale',
                    conflictHintId,
                  })}
                />
              </Field>

              <Field
                inputId={contentInputId}
                label="본문"
                error={errors.content}
                hint="실제로 삽입할 프롬프트 본문"
              >
                <textarea
                  ref={contentInputRef}
                  id={contentInputId}
                  value={form.content}
                  onChange={(event) => {
                    updateField('content', event.target.value);
                  }}
                  className="min-h-[220px] w-full rounded-[22px] border border-stone-200 bg-white px-4 py-4 text-sm leading-6 text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
                  placeholder={
                    isEditorLoading
                      ? '본문을 불러오는 중입니다.'
                      : '프롬프트 내용을 입력하세요.'
                  }
                  disabled={editorDisabled}
                  aria-invalid={Boolean(errors.content)}
                  aria-describedby={getDescribedBy(contentInputId, {
                    hasError: Boolean(errors.content),
                    includeConflictHint: conflictState.status === 'stale',
                    conflictHintId,
                  })}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-[#2f2f2f] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-stone-50 transition hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:bg-stone-500"
                  disabled={editorDisabled || loadState.status === 'error'}
                >
                  {isSaving
                    ? '저장 중...'
                    : isEditorLoading
                      ? '본문 불러오는 중'
                      : isEditing
                        ? '프롬프트 수정'
                        : '프롬프트 추가'}
                </button>

                {isEditing ? (
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      if (activePromptMeta) {
                        void handleDelete(activePromptMeta);
                      }
                    }}
                    disabled={editorDisabled || !activePromptMeta}
                  >
                    프롬프트 삭제
                  </button>
                ) : null}
              </div>
            </form>
          </article>
        </section>
      </div>
    </main>
  );
}

function getDescribedBy(
  inputId: string,
  options: {
    hasError: boolean;
    includeConflictHint: boolean;
    conflictHintId: string;
  },
): string | undefined {
  const ids = [`${inputId}-hint`];

  if (options.hasError) {
    ids.push(`${inputId}-error`);
  }

  if (options.includeConflictHint) {
    ids.push(options.conflictHintId);
  }

  return ids.join(' ');
}

function InsertionIndicator() {
  return (
    <div
      className="my-2 flex items-center gap-3 text-xs font-semibold text-stone-700"
      aria-hidden="true"
    >
      <span className="h-0.5 flex-1 rounded-full bg-stone-900" />
      <span className="rounded-full border border-stone-300 bg-white px-2 py-1">
        여기에 놓기
      </span>
      <span className="h-0.5 flex-1 rounded-full bg-stone-900" />
    </div>
  );
}

function PinIcon(props: { filled: boolean }) {
  const pathData = props.filled
    ? 'M16 12l2 2v2h-5v6l-1 1-1-1v-6H6v-2l2-2V5H7V3h10v2h-1Z'
    : 'm16 12 2 2v2h-5v6l-1 1-1-1v-6H6v-2l2-2V5H7V3h10v2h-1Zm-7.15 2h6.3L14 12.85V5h-4v7.85ZM12 14Z';

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
      focusable="false"
    >
      <path d={pathData} fill="currentColor" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
      focusable="false"
    >
      {[5, 9, 13].map((cy) => (
        <g key={cy}>
          <circle cx="6.5" cy={cy} r="1.35" fill="currentColor" />
          <circle cx="11.5" cy={cy} r="1.35" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-stone-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
        {props.label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
        {props.value}
      </p>
    </div>
  );
}

function EmptyPanel(props: { message: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm leading-6 text-stone-600">
      {props.message}
    </div>
  );
}

function MetaLine(props: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="shrink-0 font-semibold">{props.label}</dt>
      <dd className="min-w-0 truncate">{props.value}</dd>
    </div>
  );
}

function Banner(props: {
  message: string;
  onDismiss: () => void;
  role: 'alert' | 'status';
  tone: 'danger' | 'success';
}) {
  const palette =
    props.tone === 'danger'
      ? 'mt-5 rounded-[18px] bg-rose-50 px-4 py-3 text-sm text-rose-700'
      : 'mt-5 rounded-[18px] bg-emerald-50 px-4 py-3 text-sm text-emerald-700';

  return (
    <div className={`${palette} flex items-start justify-between gap-3`} role={props.role}>
      <p className="leading-6">{props.message}</p>
      <button
        type="button"
        className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] hover:bg-black/5"
        onClick={props.onDismiss}
        aria-label="메시지 닫기"
      >
        닫기
      </button>
    </div>
  );
}

function Field(props: {
  inputId: string;
  label: string;
  hint: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={props.inputId} className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
          {props.label}
        </span>
        <span id={`${props.inputId}-hint`} className="text-[11px] text-stone-500">
          {props.hint}
        </span>
      </label>
      <div className="mt-3">{props.children}</div>
      {props.error ? (
        <p id={`${props.inputId}-error`} className="mt-2 text-sm text-rose-600">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
