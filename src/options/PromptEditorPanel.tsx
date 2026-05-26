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
      className="rounded-[28px] border border-stone-200 bg-[#F6F8F5] p-6 shadow-[0_18px_42px_rgba(66,53,49,0.06)]"
      aria-busy={props.isEditorLoading || props.isSaving}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium leading-[17px] text-stone-600">
            {t('options.editor.eyebrow')}
          </p>
          <h2 className="mt-1.5 text-[22px] font-extrabold leading-tight text-stone-950">
            {props.isEditing
              ? t('options.editor.heading.edit')
              : t('options.editor.heading.add')}
          </h2>
        </div>
        {props.isEditing ? (
          <button
            type="button"
            className={`rounded-full border border-stone-300 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
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
          className="mt-5 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900"
          role="status"
          aria-live="polite"
          id={conflictHintId}
        >
          <p className="font-semibold">{t('options.editor.conflictHeading')}</p>
          <p className="mt-2 leading-6">
            {formatMessage(props.conflictState.message)}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-amber-700">
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
          className="mt-5 rounded-[20px] border border-stone-200 bg-white/70 px-4 py-4 text-sm text-stone-600"
          role="status"
          aria-live="polite"
        >
          {t('options.editor.bodyLoading')}
        </div>
      ) : null}

      {props.bodyLoadState.status === 'error' ? (
        <div
          className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900"
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
            className="w-full rounded-[18px] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
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
            className="min-h-[220px] w-full rounded-[22px] border border-stone-200 bg-white px-4 py-4 text-sm leading-6 text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200"
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
            className={`inline-flex h-[38px] min-w-[127px] items-center justify-center rounded-full bg-[#161616] px-[19px] text-[14px] font-bold leading-none text-stone-50 shadow-[0_12px_24px_rgba(22,22,22,0.16)] transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:bg-stone-500 ${BUTTON_FOCUS_CLASS}`}
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
              className={`rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
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
