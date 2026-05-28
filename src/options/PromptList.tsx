import {
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

import { type PromptMeta } from '../prompt/schema';
import {
  describeMessage,
  getIntlLocale,
  translate,
  type I18nKey,
  type Locale,
  type LocalizedMessageDescriptor,
} from '../shared/i18n';
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
  locale: Locale;
  onCreatePrompt: () => void;
  onDeletePrompt: (prompt: PromptMeta) => Promise<void>;
  onReorderFeedback: (
    message: LocalizedMessageDescriptor,
    tone: OptionsToastTone,
  ) => void;
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
  const t = (key: I18nKey, values?: Record<string, string | number>) =>
    translate(props.locale, key, values);
  const compactLabelClassName =
    props.locale === 'ko'
      ? 'font-extrabold tracking-[0.22em] uppercase'
      : 'font-semibold tracking-[0.18em] uppercase';
  const metaLabelClassName =
    props.locale === 'ko' ? 'font-extrabold' : 'font-semibold';

  function updateDropIndicator(nextDropIndicator: DropIndicatorState): void {
    dropIndicatorRef.current = nextDropIndicator;
    setDropIndicator(nextDropIndicator);
  }

  function getPromptGroup(prompt: PromptMeta): 'pinned' | 'normal' {
    return prompt.pinned ? 'pinned' : 'normal';
  }

  function getPromptGroupLabel(prompt: PromptMeta): string {
    return prompt.pinned
      ? t('options.list.group.pinned')
      : t('options.list.group.normal');
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
      props.onReorderFeedback(
        describeMessage('options.list.reorder.crossGroup'),
        'info',
      );
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
          describeMessage('options.list.reorder.success', {
            title: draggedPrompt.title,
          }),
          'success',
        );
      }
    } catch (error) {
      console.error('[promptit] Failed to reorder prompt in options page.', error);
      props.onReorderFeedback(
        describeMessage('options.error.reorderPrompt'),
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
      props.onReorderFeedback(
        describeMessage('options.list.reorder.crossGroup'),
        'info',
      );
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
        describeMessage(
          direction === 'up'
            ? 'options.list.reorder.first'
            : 'options.list.reorder.last',
          {
            title: prompt.title,
            group: getPromptGroupLabel(prompt),
          },
        ),
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
      className="rounded-[28px] border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] p-6 shadow-[var(--promptit-options-shadow-panel)]"
      aria-busy={props.loadStateStatus === 'loading' || props.isSaving}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-[17px] text-[var(--promptit-options-text-muted)]">
            {t('options.list.eyebrow')}
          </p>
          <h2 className="mt-1.5 text-[22px] font-extrabold leading-tight text-[var(--promptit-options-text-primary)]">
            {t('options.list.heading')}
          </h2>
        </div>
        <button
          type="button"
          className={`inline-flex h-[38px] shrink-0 items-center justify-center gap-1.5 self-center rounded-full border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] px-[19px] text-[14px] font-bold leading-none text-[var(--promptit-options-text-primary)] shadow-[var(--promptit-options-shadow-small)] transition hover:border-[var(--promptit-options-border-hover)] hover:bg-[var(--promptit-options-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
          onClick={props.onCreatePrompt}
          disabled={props.isSaving}
        >
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              focusable="false"
            >
              <path
                d="M8 3v10M3 8h10"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2.3"
              />
            </svg>
          </span>
          <span>{t('options.list.addButton')}</span>
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
                  {showBeforeIndicator ? (
                    <InsertionIndicator label={t('options.list.dropHere')} />
                  ) : null}
                  <div
                    className={`rounded-[24px] border px-4 py-4 transition ${
                      isActive
                        ? 'border-[var(--promptit-options-border-active)] bg-[var(--promptit-options-active-surface)] text-[var(--promptit-options-active-text)] shadow-[var(--promptit-options-shadow-active)]'
                        : 'border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface-muted)] text-[var(--promptit-options-text-body)] hover:border-[var(--promptit-options-border-hover)] hover:bg-[var(--promptit-options-menu-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="mt-1 flex shrink-0 flex-col items-center gap-2">
                        <button
                          type="button"
                          className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                            isActive
                              ? prompt.pinned
                                ? 'border-[var(--promptit-options-active-inner-border-strong)] bg-[var(--promptit-options-active-inner-bg-strong)] text-[var(--promptit-options-active-text)] hover:bg-[var(--promptit-options-active-inner-bg-hover)]'
                                : 'border-[var(--promptit-options-active-inner-border)] bg-[var(--promptit-options-active-inner-bg)] text-[var(--promptit-options-active-muted)] hover:bg-[var(--promptit-options-active-inner-bg-strong)]'
                              : prompt.pinned
                                ? 'border-[var(--promptit-options-label-pinned-background)] bg-[var(--promptit-options-label-pinned-background)] text-[var(--promptit-options-label-pinned-text)] hover:bg-[var(--promptit-options-active-hover)]'
                                : 'border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] text-[var(--promptit-options-text-subtle)] hover:border-[var(--promptit-options-border-hover)] hover:bg-[var(--promptit-options-menu-hover)] hover:text-[var(--promptit-options-text-body)]'
                          } disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
                          onClick={() => {
                            void handleTogglePinned(prompt);
                          }}
                          disabled={props.listActionDisabled}
                          aria-label={
                            prompt.pinned
                              ? t('options.list.unpinAria', {
                                  title: prompt.title,
                                })
                              : t('options.list.pinAria', {
                                  title: prompt.title,
                                })
                          }
                          aria-pressed={prompt.pinned}
                          title={
                            prompt.pinned
                              ? t('options.list.unpinTitle')
                              : t('options.list.pinTitle')
                          }
                          data-testid="prompt-pin-toggle"
                        >
                          <PinIcon filled={prompt.pinned} />
                        </button>

                        <button
                          type="button"
                          className={`flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-full border transition active:cursor-grabbing ${
                            isActive
                              ? 'border-[var(--promptit-options-active-inner-border)] bg-[var(--promptit-options-active-inner-bg)] text-[var(--promptit-options-active-subtle)] hover:bg-[var(--promptit-options-active-inner-bg-strong)]'
                              : 'border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] text-[var(--promptit-options-text-subtle)] hover:border-[var(--promptit-options-border-hover)] hover:bg-[var(--promptit-options-menu-hover)]'
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
                          aria-label={t('options.list.reorderAria', {
                            title: prompt.title,
                          })}
                          aria-describedby={props.statusRegionId}
                          title={t('options.list.reorderTitle')}
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
                        aria-label={t('options.list.editAria', {
                          title: prompt.title,
                        })}
                        aria-current={isActive ? 'true' : undefined}
                        data-testid="prompt-card"
                      >
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`rounded-full px-2 py-1 ${compactLabelClassName} ${
                              isActive
                                ? 'bg-[var(--promptit-options-active-inner-bg)] text-[var(--promptit-options-active-subtle)]'
                                : prompt.pinned
                                  ? 'bg-[var(--promptit-options-label-pinned-background)] text-[var(--promptit-options-label-pinned-text)]'
                                  : 'bg-[var(--promptit-options-surface)] text-[var(--promptit-options-text-subtle)]'
                            }`}
                            data-testid="prompt-group-label"
                          >
                            {getPromptGroupLabel(prompt)}
                          </span>
                          <span
                            className={
                              isActive ? 'text-[var(--promptit-options-active-faint)]' : 'text-[var(--promptit-options-text-faint)]'
                            }
                          >
                            •
                          </span>
                          <span
                            className={`${compactLabelClassName} ${
                              isActive ? 'text-[var(--promptit-options-active-muted)]' : 'text-[var(--promptit-options-text-subtle)]'
                            }`}
                            data-testid="prompt-char-count"
                          >
                            {t('options.list.charCount', {
                              count: prompt.charCount.toLocaleString(
                                getIntlLocale(props.locale),
                              ),
                            })}
                          </span>
                        </span>
                        <span className="mt-3 block text-lg font-semibold tracking-tight">
                          {prompt.title}
                        </span>
                        <span
                          className={`mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-2 ${
                            isActive ? 'text-[var(--promptit-options-active-muted)]' : 'text-[var(--promptit-options-text-muted)]'
                          }`}
                        >
                          <MetaLine
                            label={t('options.list.updatedLabel')}
                            labelClassName={metaLabelClassName}
                            value={formatTimestamp(
                              prompt.updatedAt,
                              props.locale,
                            )}
                          />
                          <MetaLine
                            label={t('options.list.createdLabel')}
                            labelClassName={metaLabelClassName}
                            value={formatTimestamp(
                              prompt.createdAt,
                              props.locale,
                            )}
                          />
                        </span>
                      </button>

                      <button
                        type="button"
                        className={`rounded-full border px-3 py-2 text-xs transition ${compactLabelClassName} ${
                          isActive
                            ? 'border-[var(--promptit-options-active-danger-border)] bg-[var(--promptit-options-active-danger-bg)] text-[var(--promptit-options-active-danger-text)] hover:bg-[var(--promptit-options-active-danger-bg-hover)]'
                            : 'border-[var(--promptit-options-danger-border)] bg-[var(--promptit-options-danger-surface)] text-[var(--promptit-options-danger-text)] hover:border-[var(--promptit-options-danger-border-hover)] hover:bg-[var(--promptit-options-danger-surface-hover)] hover:text-[var(--promptit-options-danger-text-hover)]'
                        } disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
                        onClick={() => {
                          void props.onDeletePrompt(prompt);
                        }}
                        disabled={props.isSaving}
                        aria-label={t('options.list.deleteAria', {
                          title: prompt.title,
                        })}
                        data-testid="prompt-delete-button"
                      >
                        {t('options.list.deleteButton')}
                      </button>
                    </div>
                  </div>
                  {showAfterIndicator ? (
                    <InsertionIndicator label={t('options.list.dropHere')} />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </article>
  );
}
