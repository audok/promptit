import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { type PromptMeta } from '../prompt/schema';
import {
  PRODUCT_NAME,
  SERVICE_CHATGPT,
  SERVICE_GEMINI,
  TRIGGER_SLASH,
  TRIGGER_SPACE,
  describeMessage,
  getIntlLocale,
  translate,
  translateLocalizedMessage,
  type I18nKey,
  type LanguagePreference,
  type LocalizedMessageDescriptor,
} from '../shared/i18n';
import { type ThemePreference } from '../shared/theme';
import { BUTTON_FOCUS_CLASS, MetricCard } from './components';
import { OptionsToast, type OptionsToastMessage, type OptionsToastTone } from './OptionsToast';
import { PromptEditorPanel } from './PromptEditorPanel';
import { PromptList } from './PromptList';
import { useLanguagePreference } from './useLanguagePreference';
import { usePromptEditor } from './usePromptEditor';
import { useThemePreference } from './useThemePreference';

const LANGUAGE_OPTIONS: readonly LanguagePreference[] = [
  'system',
  'ko',
  'en',
];

const THEME_OPTIONS: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

const TOAST_NOTICE_KEYS = new Set<I18nKey>([
  'options.toast.promptCreated',
  'options.toast.promptUpdated',
  'options.toast.promptDeleted',
  'options.toast.promptPinned',
  'options.toast.promptUnpinned',
]);

const INFO_TOAST_ALERT_KEYS = new Set<I18nKey>([
  'options.alert.updateNotFoundCreateMode',
  'options.alert.deleteNotFoundCreateMode',
  'options.alert.pinNotFoundCreateMode',
]);

const ERROR_TOAST_ALERT_KEYS = new Set<I18nKey>([
  'options.error.savePrompt',
  'options.error.deletePrompt',
  'options.error.reorderPrompt',
  'options.error.pinPrompt',
  'runtime.prompt.saveFailed',
  'runtime.prompt.deleteFailed',
  'runtime.prompt.pinFailed',
]);

function isToastNotice(message: LocalizedMessageDescriptor): boolean {
  return TOAST_NOTICE_KEYS.has(message.key);
}

function isToastAlert(message: LocalizedMessageDescriptor): boolean {
  return (
    INFO_TOAST_ALERT_KEYS.has(message.key) ||
    ERROR_TOAST_ALERT_KEYS.has(message.key)
  );
}

function getToastToneForAlert(
  message: LocalizedMessageDescriptor,
): OptionsToastTone {
  return INFO_TOAST_ALERT_KEYS.has(message.key) ? 'info' : 'error';
}

function ChevronDownIcon(props: { className: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={props.className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5.75 8.25 10 12.5l4.25-4.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function GlobeIcon(props: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={props.className}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3.5 12h17M12 3.5c2.15 2.25 3.25 5.08 3.25 8.5S14.15 18.25 12 20.5M12 3.5C9.85 5.75 8.75 8.58 8.75 12s1.1 6.25 3.25 8.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MoonIcon(props: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={props.className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 14.35A7.65 7.65 0 0 1 9.65 4a8.5 8.5 0 1 0 10.35 10.35Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SunIcon(props: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={props.className}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 2.75v2.4M12 18.85v2.4M4.15 4.15l1.7 1.7M18.15 18.15l1.7 1.7M2.75 12h2.4M18.85 12h2.4M4.15 19.85l1.7-1.7M18.15 5.85l1.7-1.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
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
  const {
    locale,
    preference: languagePreference,
    setPreference: setLanguagePreference,
  } = useLanguagePreference();
  const {
    preference: themePreference,
    setPreference: setThemePreference,
  } = useThemePreference();

  const statusRegionId = useId();
  const alertRegionId = useId();
  const languageMenuId = useId();
  const toastIdRef = useRef(0);
  const toastHideTimerRef = useRef<number | null>(null);
  const [toastMessage, setToastMessage] = useState<OptionsToastMessage | null>(
    null,
  );
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const t = useCallback(
    (key: I18nKey, values?: Record<string, string | number>): string =>
      translate(locale, key, values),
    [locale],
  );
  const formatMessage = useCallback(
    (message: LocalizedMessageDescriptor): string =>
      translateLocalizedMessage(locale, message),
    [locale],
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
  const showLocalizedOptionsToast = useCallback(
    (message: LocalizedMessageDescriptor, tone: OptionsToastTone): void => {
      showOptionsToast(formatMessage(message), tone);
    },
    [formatMessage, showOptionsToast],
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

    showOptionsToast(formatMessage(notice), 'success');
    clearNotice();
  }, [clearNotice, formatMessage, notice, showOptionsToast]);

  useEffect(() => {
    if (!alertMessage || !isToastAlert(alertMessage)) {
      return;
    }

    showOptionsToast(
      formatMessage(alertMessage),
      getToastToneForAlert(alertMessage),
    );
    clearAlertMessage();
  }, [alertMessage, clearAlertMessage, formatMessage, showOptionsToast]);

  const loadStatusLabel =
    loadState.status === 'error'
      ? t('options.status.loadFailed')
      : loadState.status === 'loading'
        ? t('options.status.loading')
        : isEditorLoading
          ? t('options.status.loadingBody')
        : isSaving
          ? t('options.status.saving')
          : t('options.status.idle');

  const listMessage =
    loadState.status === 'loading'
      ? t('options.list.loading')
      : loadState.status === 'error'
        ? formatMessage(loadState.message)
        : prompts.length === 0
          ? t('options.list.empty')
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
  const inlineNoticeText = inlineNotice ? formatMessage(inlineNotice) : null;
  const inlineAlertMessageText = inlineAlertMessage
    ? formatMessage(inlineAlertMessage)
    : null;
  const selectedLanguageLabel = getLanguagePreferenceLabel(
    languagePreference,
  );
  const resolvedLocaleLabel = t(
    locale === 'ko'
      ? 'options.language.localeName.ko'
      : 'options.language.localeName.en',
  );
  const heroSectionClassName =
    'rounded-[32px] border border-[var(--promptit-options-border-80)] bg-[var(--promptit-options-surface-90)] px-7 py-7 text-[var(--promptit-options-text-primary)] shadow-[var(--promptit-options-shadow-hero)] backdrop-blur sm:px-8 lg:px-10 lg:py-8';
  const heroCopyClassName = 'max-w-3xl text-base leading-6 text-[var(--promptit-options-text-muted)]';
  const keyboardTokenClassName =
    'inline-flex min-w-7 items-center justify-center rounded-md border border-[var(--promptit-options-border-strong)] bg-[var(--promptit-options-surface-muted)] px-2 py-1 font-mono text-[0.82em] font-semibold leading-none text-[var(--promptit-options-text-body)] shadow-[var(--promptit-options-kbd-shadow)]';
  const controlButtonClassName = `inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] px-4 text-[13px] font-semibold text-[var(--promptit-options-text-primary)] shadow-[var(--promptit-options-shadow-control)] transition hover:bg-[var(--promptit-options-control-hover)] ${BUTTON_FOCUS_CLASS}`;
  const themeOptionBaseClassName = `inline-flex h-8 items-center justify-center rounded-full px-3 text-[12px] font-semibold transition ${BUTTON_FOCUS_CLASS}`;

  function confirmDiscardDirtyForm(): boolean {
    return (
      !isDirty ||
      window.confirm(t('options.confirm.discardDirty'))
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
    const shouldDelete = window.confirm(
      t('options.confirm.deletePrompt', {
        title: prompt.title,
      }),
    );

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
      const message = describeMessage(
        pinned ? 'options.toast.promptPinned' : 'options.toast.promptUnpinned',
      );
      showOptionsToast(
        formatMessage(message),
        'success',
      );
      clearNotice();
    }

    return didToggle;
  }

  function getLanguagePreferenceLabel(preference: LanguagePreference): string {
    switch (preference) {
      case 'system':
        return t('options.language.option.system');
      case 'ko':
        return t('options.language.option.ko');
      case 'en':
        return t('options.language.option.en');
    }
  }

  function getLanguageOptionClassName(option: LanguagePreference): string {
    return languagePreference === option
      ? `flex w-full items-center justify-between rounded-full bg-[var(--promptit-options-text-primary)] px-4 py-2.5 text-left text-sm font-semibold text-[var(--promptit-options-surface)] ${BUTTON_FOCUS_CLASS}`
      : `flex w-full items-center justify-between rounded-full px-4 py-2.5 text-left text-sm font-semibold text-[var(--promptit-options-text-body)] transition hover:bg-[var(--promptit-options-menu-hover)] ${BUTTON_FOCUS_CLASS}`;
  }

  function getThemePreferenceLabel(preference: ThemePreference): string {
    switch (preference) {
      case 'system':
        return t('options.theme.option.system');
      case 'light':
        return t('options.theme.option.light');
      case 'dark':
        return t('options.theme.option.dark');
    }
  }

  function getThemeOptionClassName(option: ThemePreference): string {
    return themePreference === option
      ? `${themeOptionBaseClassName} bg-[var(--promptit-options-text-primary)] text-[var(--promptit-options-surface)]`
      : `${themeOptionBaseClassName} text-[var(--promptit-options-text-muted)] hover:bg-[var(--promptit-options-control-hover)] hover:text-[var(--promptit-options-text-primary)]`;
  }

  function handleToggleLanguageMenu(): void {
    setIsLanguageMenuOpen((isOpen) => !isOpen);
  }

  function handleSelectLanguage(nextLanguage: LanguagePreference): void {
    void setLanguagePreference(nextLanguage).catch((error) => {
      console.error('[promptit] Failed to save language preference.', error);
      showOptionsToast(t('options.error.languagePreference'), 'error');
    });
    setIsLanguageMenuOpen(false);
  }

  function handleLanguageMenuKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ): void {
    if (event.key === 'Escape') {
      setIsLanguageMenuOpen(false);
    }
  }

  function handleSelectTheme(nextTheme: ThemePreference): void {
    void setThemePreference(nextTheme).catch((error) => {
      console.error('[promptit] Failed to save theme preference.', error);
      showOptionsToast(t('options.theme.saveFailed'), 'error');
    });
  }

  return (
    <main className="min-h-screen bg-[var(--promptit-options-app-background)] text-[var(--promptit-options-text-body)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <section className={heroSectionClassName}>
          <div className="flex flex-col gap-[27px]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-[30px] font-black leading-none">
                {PRODUCT_NAME}
              </p>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <div
                  className="relative"
                  onKeyDown={handleLanguageMenuKeyDown}
                >
                  <button
                    type="button"
                    className={controlButtonClassName}
                    onClick={handleToggleLanguageMenu}
                    aria-controls={languageMenuId}
                    aria-expanded={isLanguageMenuOpen}
                    aria-haspopup="menu"
                      aria-label={t('options.language.menuButtonAria', {
                      preference: selectedLanguageLabel,
                      locale: resolvedLocaleLabel,
                    })}
                  >
                    <GlobeIcon className="h-[18px] w-[18px]" />
                    <span>{selectedLanguageLabel}</span>
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  </button>
                  {isLanguageMenuOpen ? (
                    <div
                      id={languageMenuId}
                      role="menu"
                      aria-label={t('options.language.menuLabel')}
                      className="absolute right-0 top-[calc(100%+8px)] z-20 w-36 rounded-[20px] border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] p-1.5 shadow-[var(--promptit-options-shadow-menu)]"
                    >
                      {LANGUAGE_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="menuitemradio"
                          aria-checked={languagePreference === option}
                          className={getLanguageOptionClassName(option)}
                          onClick={() => {
                            handleSelectLanguage(option);
                          }}
                        >
                          <span>{getLanguagePreferenceLabel(option)}</span>
                          {languagePreference === option ? (
                            <span aria-hidden="true">✓</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div
                  className="inline-flex h-10 items-center gap-1 rounded-full border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] p-1 shadow-[var(--promptit-options-shadow-control)]"
                  role="group"
                  aria-label={t('options.theme.selectorLabel')}
                >
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={getThemeOptionClassName(option)}
                      onClick={() => {
                        handleSelectTheme(option);
                      }}
                      aria-pressed={themePreference === option}
                    >
                      {option === 'system' ? (
                        <GlobeIcon className="h-[15px] w-[15px]" />
                      ) : option === 'light' ? (
                        <SunIcon className="h-[15px] w-[15px]" />
                      ) : (
                        <MoonIcon className="h-[15px] w-[15px]" />
                      )}
                      <span className="ml-1.5">{getThemePreferenceLabel(option)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-5">
                <h1 className="text-[28px] font-extrabold leading-tight">
                  {t('options.hero.title')}
                </h1>
                <p className={heroCopyClassName}>
                  {t('options.hero.copyBeforeShortcut', {
                    chatgpt: SERVICE_CHATGPT,
                    gemini: SERVICE_GEMINI,
                  })}{' '}
                  <span
                    className="inline-flex items-center gap-1 align-middle"
                    aria-label={`${TRIGGER_SLASH} ${TRIGGER_SPACE}`}
                  >
                    <kbd className={keyboardTokenClassName}>
                      {TRIGGER_SLASH}
                    </kbd>
                    <kbd className={keyboardTokenClassName}>
                      {TRIGGER_SPACE}
                    </kbd>
                  </span>
                  {locale === 'en' ? ' ' : ''}
                  {t('options.hero.copyAfterShortcut')}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:min-w-[490px]">
                <MetricCard
                  label={t('options.metric.savedPrompts')}
                  value={prompts.length.toLocaleString(getIntlLocale(locale))}
                />
                <MetricCard
                  label={t('options.metric.editState')}
                  value={
                    isEditing
                      ? t('options.metric.editing')
                      : t('options.metric.creating')
                  }
                />
                <MetricCard
                  label={t('options.metric.status')}
                  value={loadStatusLabel}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="sr-only" aria-live="polite" aria-atomic="true" id={statusRegionId}>
          {loadState.status === 'loading'
            ? t('options.list.loading')
            : inlineNoticeText}
        </div>
        <div
          className="sr-only"
          aria-live="assertive"
          aria-atomic="true"
          id={alertRegionId}
        >
          {inlineAlertMessageText}
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <PromptList
            activePromptId={activePromptId}
            isSaving={isSaving}
            listActionDisabled={listActionDisabled}
            listMessage={listMessage}
            locale={locale}
            loadStateStatus={loadState.status}
            movePromptWithinGroup={movePromptWithinGroup}
            onCreatePrompt={handleStartCreateMode}
            onDeletePrompt={handleDelete}
            onReorderFeedback={showLocalizedOptionsToast}
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
            locale={locale}
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
