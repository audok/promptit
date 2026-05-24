import {
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

import { type PromptMeta } from '../prompt/schema';
import {
  BUTTON_FOCUS_CLASS,
  DragHandleIcon,
  EmptyPanel,
  InsertionIndicator,
  MetaLine,
  PinIcon,
  formatTimestamp,
} from './components';
import { type OptionsToastTone } from './OptionsToast';
import { type PromptEditorLoadState } from './usePromptEditor';

type DropPlacement = 'before' | 'after';

type DropIndicatorState = {
  placement: DropPlacement;
  targetId: string;
} | null;

const CROSS_GROUP_REORDER_MESSAGE =
  '고정됨 목록과 일반 목록 사이에서는 끌어서 순서를 바꿀 수 없습니다.';

type PromptListProps = {
  activePromptId: string | null;
  isSaving: boolean;
  listActionDisabled: boolean;
  listMessage: string | null;
  loadStateStatus: PromptEditorLoadState['status'];
  movePromptWithinGroup: (
    id: string,
    targetId: string,
    placement: DropPlacement,
  ) => Promise<boolean>;
  onCreatePrompt: () => void;
  onDeletePrompt: (prompt: PromptMeta) => Promise<void>;
  onReorderFeedback: (message: string, tone: OptionsToastTone) => void;
  onSelectPrompt: (prompt: PromptMeta) => Promise<void>;
  prompts: PromptMeta[];
  reorderDisabled: boolean;
  statusRegionId: string;
  togglePromptPinned: (id: string, pinned: boolean) => Promise<boolean>;
};

export function PromptList(props: PromptListProps) {
  const [draggingPromptId, setDraggingPromptId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState>(null);
  const crossGroupDropRef = useRef(false);
  const dropIndicatorRef = useRef<DropIndicatorState>(null);

  function updateDropIndicator(nextDropIndicator: DropIndicatorState): void {
    dropIndicatorRef.current = nextDropIndicator;
    setDropIndicator(nextDropIndicator);
  }

  function getPromptGroup(prompt: PromptMeta): 'pinned' | 'normal' {
    return prompt.pinned ? 'pinned' : 'normal';
  }

  function getPromptGroupLabel(prompt: PromptMeta): string {
    return prompt.pinned ? '고정됨' : '일반';
  }

  function getPromptGroupPrompts(prompt: PromptMeta): PromptMeta[] {
    return props.prompts.filter((item) => item.pinned === prompt.pinned);
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
      props.onReorderFeedback(CROSS_GROUP_REORDER_MESSAGE, 'info');
      return;
    }

    if (isSamePositionMove(draggedPrompt, targetPrompt, placement)) {
      return;
    }

    try {
      const didMove = await props.movePromptWithinGroup(
        draggedPrompt.id,
        targetPrompt.id,
        placement,
      );

      if (didMove) {
        props.onReorderFeedback(
          `${draggedPrompt.title} 순서를 변경했습니다.`,
          'success',
        );
      }
    } catch (error) {
      console.error('[promptit] Failed to reorder prompt in options page.', error);
      props.onReorderFeedback(
        '프롬프트 순서를 바꾸지 못했습니다. 잠시 후 다시 시도해주세요.',
        'error',
      );
    }
  }

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    prompt: PromptMeta,
  ): void {
    if (props.reorderDisabled) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', prompt.id);
    crossGroupDropRef.current = false;
    setDraggingPromptId(prompt.id);
    updateDropIndicator(null);
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
    targetPrompt: PromptMeta,
  ): void {
    const draggedPrompt =
      draggingPromptId !== null
        ? props.prompts.find((prompt) => prompt.id === draggingPromptId) ?? null
        : null;

    if (props.reorderDisabled || draggedPrompt === null) {
      return;
    }

    event.preventDefault();

    if (getPromptGroup(draggedPrompt) !== getPromptGroup(targetPrompt)) {
      crossGroupDropRef.current = true;
      event.dataTransfer.dropEffect = 'none';
      updateDropIndicator(null);
      return;
    }

    crossGroupDropRef.current = false;
    const placement = getDropPlacement(event);
    const isNoopMove = isSamePositionMove(
      draggedPrompt,
      targetPrompt,
      placement,
    );
    event.dataTransfer.dropEffect = isNoopMove ? 'none' : 'move';
    updateDropIndicator(
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

    if (dropIndicatorRef.current?.targetId === prompt.id) {
      updateDropIndicator(null);
    }
  }

  async function handleDrop(
    event: DragEvent<HTMLDivElement>,
    targetPrompt: PromptMeta,
  ): Promise<void> {
    event.preventDefault();

    const pendingDropIndicator = dropIndicatorRef.current;
    const draggedId =
      draggingPromptId ?? event.dataTransfer.getData('text/plain') ?? null;
    const draggedPrompt =
      draggedId !== null
        ? props.prompts.find((prompt) => prompt.id === draggedId) ?? null
        : null;
    const dropTargetPrompt =
      pendingDropIndicator !== null
        ? props.prompts.find(
            (prompt) => prompt.id === pendingDropIndicator.targetId,
          ) ?? null
        : targetPrompt;
    const dropPlacement =
      pendingDropIndicator?.placement ?? getDropPlacement(event);

    crossGroupDropRef.current = false;
    updateDropIndicator(null);
    setDraggingPromptId(null);

    if (
      props.reorderDisabled ||
      draggedPrompt === null ||
      dropTargetPrompt === null
    ) {
      return;
    }

    await reorderPrompt(draggedPrompt, dropTargetPrompt, dropPlacement);
  }

  function handleDragEnd(): void {
    const didAttemptCrossGroupDrop = crossGroupDropRef.current;

    crossGroupDropRef.current = false;
    setDraggingPromptId(null);
    updateDropIndicator(null);

    if (didAttemptCrossGroupDrop) {
      props.onReorderFeedback(CROSS_GROUP_REORDER_MESSAGE, 'info');
    }
  }

  async function handleKeyboardReorder(
    prompt: PromptMeta,
    direction: 'up' | 'down',
  ): Promise<void> {
    if (props.reorderDisabled) {
      return;
    }

    const groupPrompts = getPromptGroupPrompts(prompt);
    const promptIndex = groupPrompts.findIndex((item) => item.id === prompt.id);
    const targetPrompt =
      promptIndex >= 0
        ? groupPrompts[promptIndex + (direction === 'up' ? -1 : 1)] ?? null
        : null;

    if (targetPrompt === null) {
      props.onReorderFeedback(
        direction === 'up'
          ? `${prompt.title}은 이미 ${getPromptGroupLabel(prompt)} 목록의 첫 번째입니다.`
          : `${prompt.title}은 이미 ${getPromptGroupLabel(prompt)} 목록의 마지막입니다.`,
        'info',
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
    if (props.listActionDisabled) {
      return;
    }

    await props.togglePromptPinned(prompt.id, !prompt.pinned);
  }

  return (
    <article
      className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]"
      aria-busy={props.loadStateStatus === 'loading' || props.isSaving}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-[17px] text-stone-600">
            프롬프트 목록
          </p>
          <h2 className="mt-1.5 text-[22px] font-extrabold leading-tight text-stone-950">
            저장된 프롬프트
          </h2>
        </div>
        <button
          type="button"
          className={`inline-flex h-[38px] shrink-0 items-center justify-center gap-1.5 self-center rounded-full border border-stone-200 bg-white px-[19px] text-[13px] font-bold leading-none text-stone-950 shadow-[0_8px_18px_rgba(68,58,48,0.05)] transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
          onClick={props.onCreatePrompt}
          disabled={props.isSaving}
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
          <span>프롬프트 추가</span>
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {props.listMessage ? <EmptyPanel message={props.listMessage} /> : null}

        {props.loadStateStatus === 'ready' && props.prompts.length > 0 ? (
          <div className="space-y-3" role="list">
            {props.prompts.map((prompt) => {
              const isActive = prompt.id === props.activePromptId;
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
                          } disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
                          onClick={() => {
                            void handleTogglePinned(prompt);
                          }}
                          disabled={props.listActionDisabled}
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
                          } disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
                          draggable={!props.reorderDisabled}
                          onDragStart={(event) => {
                            handleDragStart(event, prompt);
                          }}
                          onDragEnd={() => {
                            handleDragEnd();
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
                          disabled={props.reorderDisabled}
                          aria-label={`${prompt.title} 순서 변경`}
                          aria-describedby={props.statusRegionId}
                          title="순서 변경"
                          data-testid="prompt-drag-handle"
                        >
                          <DragHandleIcon />
                        </button>
                      </div>
                      <button
                        type="button"
                        className={`min-w-0 flex-1 cursor-pointer rounded-[18px] text-left ${BUTTON_FOCUS_CLASS}`}
                        onClick={() => {
                          void props.onSelectPrompt(prompt);
                        }}
                        disabled={props.isSaving}
                        aria-label={`${prompt.title} 편집`}
                        aria-current={isActive ? 'true' : undefined}
                        data-testid="prompt-card"
                      >
                        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
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
                        </span>
                        <span className="mt-3 block text-lg font-semibold tracking-tight">
                          {prompt.title}
                        </span>
                        <span
                          className={`mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-2 ${
                            isActive ? 'text-stone-300' : 'text-stone-600'
                          }`}
                        >
                          <MetaLine label="수정" value={formatTimestamp(prompt.updatedAt)} />
                          <MetaLine
                            label="추가"
                            value={formatTimestamp(prompt.createdAt)}
                          />
                        </span>
                      </button>

                      <button
                        type="button"
                        className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
                          isActive
                            ? 'border-rose-200/20 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25'
                            : 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800'
                        } disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
                        onClick={() => {
                          void props.onDeletePrompt(prompt);
                        }}
                        disabled={props.isSaving}
                        aria-label={`${prompt.title} 삭제`}
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
  );
}
