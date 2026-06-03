import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
} from 'react';

import { type PromptMeta } from '../prompt/schema';
import {
  Banner,
  BUTTON_FOCUS_CLASS,
  Field,
  SECONDARY_BUTTON_FOCUS_ACTIVE_CLASS,
  formatTimestamp,
  getDescribedBy,
} from './components';
import {
  translate,
  translateLocalizedMessage,
  type I18nKey,
  type Locale,
  type LocalizedMessageDescriptor,
} from '../shared/i18n';
import { type UsePromptEditorResult } from './usePromptEditor';

type PromptFormErrorText = Partial<
  Record<'title' | 'content', LocalizedMessageDescriptor>
>;

type PromptEditorPanelProps = {
  activePromptMeta: PromptMeta | null;
  alertMessage: UsePromptEditorResult['alertMessage'];
  bodyLoadState: UsePromptEditorResult['bodyLoadState'];
  clearAlertMessage: UsePromptEditorResult['clearAlertMessage'];
  clearNotice: UsePromptEditorResult['clearNotice'];
  conflictState: UsePromptEditorResult['conflictState'];
  editorDisabled: boolean;
  errors: PromptFormErrorText;
  form: UsePromptEditorResult['form'];
  isEditing: boolean;
  isEditorLoading: boolean;
  isSaving: boolean;
  locale: Locale;
  loadStateStatus: UsePromptEditorResult['loadState']['status'];
  notice: UsePromptEditorResult['notice'];
  onCancelEdit: () => void;
  onDeletePrompt: (prompt: PromptMeta) => Promise<void>;
  onSubmit: UsePromptEditorResult['submit'];
  updateField: UsePromptEditorResult['updateField'];
};

export function PromptEditorPanel(props: PromptEditorPanelProps) {
  const titleInputId = useId();
  const contentInputId = useId();
  const conflictHintId = useId();

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingInvalidFocusRef = useRef(false);
  const t = (key: I18nKey, values?: Record<string, string | number>) =>
    translate(props.locale, key, values);
  const formatMessage = (message: LocalizedMessageDescriptor) =>
    translateLocalizedMessage(props.locale, message);

  useEffect(() => {
    if (!pendingInvalidFocusRef.current) {
      return;
    }

    if (props.errors.title) {
      titleInputRef.current?.focus();
      pendingInvalidFocusRef.current = false;
      return;
    }

    if (props.errors.content) {
      contentInputRef.current?.focus();
      pendingInvalidFocusRef.current = false;
      return;
    }

    if (!props.isSaving) {
      pendingInvalidFocusRef.current = false;
    }
  }, [props.errors, props.isSaving]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    pendingInvalidFocusRef.current = true;
    await props.onSubmit();
  }

  return (
    <article
      className="rounded-[28px] border border-[var(--promptit-options-border)] bg-[var(--promptit-options-editor-surface-idle)] p-6 shadow-[var(--promptit-options-shadow-panel)] focus-within:bg-[var(--promptit-options-editor-surface-active)]"
      aria-busy={props.isEditorLoading || props.isSaving}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium leading-[17px] text-[var(--promptit-options-text-muted)]">
            {t('options.editor.eyebrow')}
          </p>
          <h2 className="mt-1.5 text-[22px] font-extrabold leading-tight text-[var(--promptit-options-text-primary)]">
            {props.isEditing
              ? t('options.editor.heading.edit')
              : t('options.editor.heading.add')}
          </h2>
        </div>
        {props.isEditing ? (
          <button
            type="button"
            className={`inline-flex h-[38px] shrink-0 items-center justify-center rounded-full border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] px-[19px] text-[14px] font-bold leading-none text-[var(--promptit-options-text-primary)] shadow-[var(--promptit-options-shadow-small)] transition hover:border-[var(--promptit-options-border-hover)] hover:bg-[var(--promptit-options-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50 ${SECONDARY_BUTTON_FOCUS_ACTIVE_CLASS} ${BUTTON_FOCUS_CLASS}`}
            onClick={props.onCancelEdit}
            disabled={props.isSaving}
          >
            {t('options.editor.cancelEdit')}
          </button>
        ) : null}
      </div>

      {props.notice ? (
        <Banner
          tone="success"
          role="status"
          message={formatMessage(props.notice)}
          onDismiss={props.clearNotice}
          dismissLabel={t('options.editor.bannerDismissLabel')}
          dismissText={t('options.editor.bannerDismissText')}
        />
      ) : null}

      {props.alertMessage ? (
        <Banner
          tone="danger"
          role="alert"
          message={formatMessage(props.alertMessage)}
          onDismiss={props.clearAlertMessage}
          dismissLabel={t('options.editor.bannerDismissLabel')}
          dismissText={t('options.editor.bannerDismissText')}
        />
      ) : null}

      {props.conflictState.status === 'stale' ? (
        <div
          className="mt-5 rounded-[20px] border border-[var(--promptit-options-warning-border)] bg-[var(--promptit-options-warning-surface)] px-4 py-4 text-sm text-[var(--promptit-options-warning-text)]"
          role="status"
          aria-live="polite"
          id={conflictHintId}
        >
          <p className="font-semibold">{t('options.editor.conflictHeading')}</p>
          <p className="mt-2 leading-6">
            {formatMessage(props.conflictState.message)}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--promptit-options-warning-muted)]">
            {t('options.editor.latestSaved', {
              timestamp: formatTimestamp(
                props.conflictState.currentPrompt.updatedAt,
                props.locale,
              ),
            })}
          </p>
        </div>
      ) : null}

      {props.bodyLoadState.status === 'loading' ? (
        <div
          className="mt-5 rounded-[20px] border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface-70)] px-4 py-4 text-sm text-[var(--promptit-options-text-muted)]"
          role="status"
          aria-live="polite"
        >
          {t('options.editor.bodyLoading')}
        </div>
      ) : null}

      {props.bodyLoadState.status === 'error' ? (
        <div
          className="mt-5 rounded-[20px] border border-[var(--promptit-options-danger-border)] bg-[var(--promptit-options-danger-surface)] px-4 py-4 text-sm text-[var(--promptit-options-danger-strong)]"
          role="status"
          aria-live="polite"
        >
          {formatMessage(props.bodyLoadState.message)}
        </div>
      ) : null}

      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => void handleSubmit(event)}
        aria-busy={props.isEditorLoading || props.isSaving}
      >
        <Field
          inputId={titleInputId}
          label={t('options.editor.titleLabel')}
          error={
            props.errors.title ? formatMessage(props.errors.title) : undefined
          }
          hint={t('options.editor.titleHint')}
        >
          <input
            ref={titleInputRef}
            id={titleInputId}
            type="text"
            value={props.form.title}
            onChange={(event) => {
              props.updateField('title', event.target.value);
            }}
            className="w-full rounded-[18px] border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] px-4 py-3 text-sm text-[var(--promptit-options-text-body)] shadow-[var(--promptit-options-shadow-input)] outline-none transition focus:border-[var(--promptit-options-border-hover)] focus:ring-2 focus:ring-[var(--promptit-options-border)]"
            placeholder={t('options.editor.titlePlaceholder')}
            maxLength={40}
            disabled={props.editorDisabled}
            aria-invalid={Boolean(props.errors.title)}
            aria-describedby={getDescribedBy(titleInputId, {
              hasError: Boolean(props.errors.title),
              includeConflictHint: props.conflictState.status === 'stale',
              conflictHintId,
            })}
          />
        </Field>

        <Field
          inputId={contentInputId}
          label={t('options.editor.contentLabel')}
          error={
            props.errors.content
              ? formatMessage(props.errors.content)
              : undefined
          }
          hint={t('options.editor.contentHint')}
        >
          <textarea
            ref={contentInputRef}
            id={contentInputId}
            value={props.form.content}
            onChange={(event) => {
              props.updateField('content', event.target.value);
            }}
            className="min-h-[220px] w-full rounded-[22px] border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] px-4 py-4 text-sm leading-6 text-[var(--promptit-options-text-body)] shadow-[var(--promptit-options-shadow-input)] outline-none transition focus:border-[var(--promptit-options-border-hover)] focus:ring-2 focus:ring-[var(--promptit-options-border)]"
            placeholder={
              props.isEditorLoading
                ? t('options.editor.contentLoadingPlaceholder')
                : t('options.editor.contentPlaceholder')
            }
            disabled={props.editorDisabled}
            aria-invalid={Boolean(props.errors.content)}
            aria-describedby={getDescribedBy(contentInputId, {
              hasError: Boolean(props.errors.content),
              includeConflictHint: props.conflictState.status === 'stale',
              conflictHintId,
            })}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={`inline-flex h-10 min-w-32 items-center justify-center rounded-[20px] bg-[var(--promptit-options-primary-button)] px-5 text-[14px] font-bold leading-none text-[var(--promptit-options-text-inverse)] shadow-[var(--promptit-options-shadow-button)] transition hover:bg-[var(--promptit-options-primary-button-hover)] disabled:cursor-not-allowed disabled:bg-[var(--promptit-options-primary-button-disabled)] ${BUTTON_FOCUS_CLASS}`}
            disabled={props.editorDisabled || props.loadStateStatus === 'error'}
          >
            {props.isSaving
              ? t('options.editor.submitSaving')
              : props.isEditorLoading
                ? t('options.editor.submitLoadingBody')
                : props.isEditing
                  ? t('options.editor.submitEdit')
                  : t('options.editor.submitAdd')}
          </button>

          {props.isEditing ? (
            <button
              type="button"
              className={`inline-flex h-10 items-center justify-center rounded-[20px] border border-[var(--promptit-options-danger-border)] bg-[var(--promptit-options-danger-surface)] px-5 text-[14px] font-bold leading-none text-[var(--promptit-options-danger-text)] transition hover:border-[var(--promptit-options-danger-border-hover)] hover:bg-[var(--promptit-options-danger-surface-hover)] hover:text-[var(--promptit-options-danger-text-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
              onClick={() => {
                if (props.activePromptMeta) {
                  void props.onDeletePrompt(props.activePromptMeta);
                }
              }}
              disabled={
                props.isSaving || props.isEditorLoading || !props.activePromptMeta
              }
            >
              {t('options.editor.deleteButton')}
            </button>
          ) : null}
        </div>
      </form>
    </article>
  );
}
