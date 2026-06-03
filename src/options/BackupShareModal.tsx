import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import {
  isPromptitPortabilityFileSizeAllowed,
  isPromptitPortabilityUiFileSizeAllowed,
  parsePromptitBackupFile,
  parsePromptitSharedPromptsFile,
  type PromptitBackupFile,
  type PromptitSharedPromptsFile,
} from '../backup/schema';
import {
  getIntlLocale,
  translate,
  type I18nKey,
  type Locale,
} from '../shared/i18n';
import {
  BUTTON_FOCUS_CLASS,
  SECONDARY_BUTTON_FOCUS_ACTIVE_CLASS,
} from './components';

type RestorePreview = {
  file: PromptitBackupFile;
  fileName: string;
};

type BackupShareModalProps = {
  isBusy: boolean;
  locale: Locale;
  onClose: () => void;
  onExportBackup: () => Promise<void>;
  onExportSharedPrompts: () => Promise<void>;
  onImportSharedPromptsFailure: () => Promise<void> | void;
  onImportSharedPrompts: (file: PromptitSharedPromptsFile) => Promise<void>;
  onRestoreBackupFailure: () => Promise<void> | void;
  onRestoreBackup: (
    file: PromptitBackupFile,
    fileName: string,
  ) => Promise<boolean>;
  openerRef: RefObject<HTMLButtonElement | null>;
  promptCount: number;
};

export function BackupShareModal(props: BackupShareModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const shareDisabledReasonId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(
    null,
  );
  const t = (key: I18nKey, values?: Record<string, string | number>) =>
    translate(props.locale, key, values);
  const hasPrompts = props.promptCount > 0;

  useEffect(() => {
    closeButtonRef.current?.focus();

    return () => {
      props.openerRef.current?.focus();
    };
  }, [props.openerRef]);

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !props.isBusy) {
      props.onClose();
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();

      if (!props.isBusy) {
        props.onClose();
      }

      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.tabIndex >= 0 && !element.hasAttribute('aria-hidden'),
    );

    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  async function handleRestoreFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const selectedFile = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';

    if (!selectedFile) {
      return;
    }

    try {
      if (!isPromptitPortabilityFileSizeAllowed(selectedFile)) {
        throw new Error('Promptit backup file is too large.');
      }

      if (!isPromptitPortabilityUiFileSizeAllowed(selectedFile)) {
        throw new Error('Promptit backup file is too large to parse in the UI.');
      }

      const parsedJson = JSON.parse(await selectedFile.text()) as unknown;
      const backupFile = parsePromptitBackupFile(parsedJson, {
        enforceSizeLimits: true,
      });

      if (!backupFile) {
        throw new Error('Invalid promptit backup file.');
      }

      setRestorePreview({
        file: backupFile,
        fileName: selectedFile.name,
      });
    } catch (error) {
      console.error('[promptit] Failed to parse backup file.', error);
      await props.onRestoreBackupFailure();
    }
  }

  async function handleImportFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const selectedFile = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';

    if (!selectedFile) {
      return;
    }

    try {
      if (!isPromptitPortabilityFileSizeAllowed(selectedFile)) {
        throw new Error('Promptit shared prompts file is too large.');
      }

      if (!isPromptitPortabilityUiFileSizeAllowed(selectedFile)) {
        throw new Error(
          'Promptit shared prompts file is too large to parse in the UI.',
        );
      }

      const parsedJson = JSON.parse(await selectedFile.text()) as unknown;
      const sharedPromptsFile = parsePromptitSharedPromptsFile(parsedJson, {
        enforceSizeLimits: true,
      });

      if (!sharedPromptsFile) {
        throw new Error('Invalid promptit shared prompts file.');
      }

      await props.onImportSharedPrompts(sharedPromptsFile);
    } catch (error) {
      console.error('[promptit] Failed to import shared prompts.', error);
      await props.onImportSharedPromptsFailure();
    }
  }

  async function handleConfirmRestore(): Promise<void> {
    if (!restorePreview) {
      return;
    }

    const didRestore = await props.onRestoreBackup(
      restorePreview.file,
      restorePreview.fileName,
    );

    if (didRestore) {
      setRestorePreview(null);
    }
  }

  function formatDateTime(value: string): string {
    return new Date(value).toLocaleString(getIntlLocale(props.locale), {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
  }

  function formatLanguagePreference(
    preference: PromptitBackupFile['data']['settings']['languagePreference'],
  ): string {
    switch (preference) {
      case 'system':
        return t('options.language.option.system');
      case 'ko':
        return t('options.language.option.ko');
      case 'en':
        return t('options.language.option.en');
      default: {
        const _exhaustive: never = preference;
        return _exhaustive;
      }
    }
  }

  function formatThemePreference(
    preference: PromptitBackupFile['data']['settings']['themePreference'],
  ): string {
    switch (preference) {
      case 'system':
        return t('options.theme.option.system');
      case 'light':
        return t('options.theme.option.light');
      case 'dark':
        return t('options.theme.option.dark');
      default: {
        const _exhaustive: never = preference;
        return _exhaustive;
      }
    }
  }

  function formatIncludedSettings(
    settings: PromptitBackupFile['data']['settings'],
  ): string {
    return t('options.backupShare.includedSettingsValue', {
      language: formatLanguagePreference(settings.languagePreference),
      theme: formatThemePreference(settings.themePreference),
    });
  }

  const secondaryButtonClassName = `inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] px-4 py-2 text-sm font-bold text-[var(--promptit-options-text-primary)] shadow-[var(--promptit-options-shadow-small)] transition hover:border-[var(--promptit-options-border-hover)] hover:bg-[var(--promptit-options-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50 ${SECONDARY_BUTTON_FOCUS_ACTIVE_CLASS} ${BUTTON_FOCUS_CLASS}`;
  const primaryButtonClassName = `inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--promptit-options-primary-button)] bg-[var(--promptit-options-primary-button)] px-4 py-2 text-sm font-bold text-[var(--promptit-options-text-inverse)] shadow-[var(--promptit-options-shadow-button)] transition hover:bg-[var(--promptit-options-primary-button-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`;
  const groupClassName =
    'rounded-[20px] border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface-muted)] px-4 py-4';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/32 px-4 py-6 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      data-testid="backup-share-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[calc(100vh-3rem)] w-full max-w-xl overflow-y-auto rounded-[28px] border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] p-6 text-[var(--promptit-options-text-primary)] shadow-[0_30px_80px_rgba(28,25,23,0.22)]"
        onKeyDown={handleDialogKeyDown}
        data-testid="backup-share-modal"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[22px] font-extrabold leading-tight">
              {t('options.backupShare.title')}
            </h2>
            <p
              id={descriptionId}
              className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--promptit-options-text-muted)]"
            >
              {t('options.backupShare.description')}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--promptit-options-border)] bg-[var(--promptit-options-surface)] text-[var(--promptit-options-text-body)] transition hover:border-[var(--promptit-options-border-hover)] hover:bg-[var(--promptit-options-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_FOCUS_CLASS}`}
            onClick={props.onClose}
            disabled={props.isBusy}
            aria-label={t('options.backupShare.close')}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        </div>

        {restorePreview ? (
          <div className="mt-6 space-y-4">
            <div className={groupClassName}>
              <h3 className="text-sm font-extrabold text-[var(--promptit-options-text-primary)]">
                {t('options.backupShare.restorePreviewTitle')}
              </h3>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <PreviewItem
                  label={t('options.backupShare.restoreFileName')}
                  value={restorePreview.fileName}
                />
                <PreviewItem
                  label={t('options.backupShare.restoreCreatedAt')}
                  value={formatDateTime(restorePreview.file.exportedAt)}
                />
                <PreviewItem
                  label={t('options.backupShare.restorePromptCount')}
                  value={restorePreview.file.data.prompts.length.toLocaleString(
                    getIntlLocale(props.locale),
                  )}
                />
                <PreviewItem
                  label={t('options.backupShare.restoreIncludedSettings')}
                  value={formatIncludedSettings(
                    restorePreview.file.data.settings,
                  )}
                />
                <PreviewItem
                  label={t('options.backupShare.restoreAppVersion')}
                  value={restorePreview.file.appVersion}
                />
              </dl>
            </div>
            <p className="rounded-[18px] border border-[var(--promptit-options-warning-border)] bg-[var(--promptit-options-warning-surface)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--promptit-options-warning-text)]">
              {t('options.backupShare.restoreWarning')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => {
                  setRestorePreview(null);
                }}
                disabled={props.isBusy}
                data-testid="backup-restore-cancel-button"
              >
                {t('options.backupShare.cancelRestore')}
              </button>
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={() => {
                  void handleConfirmRestore();
                }}
                disabled={props.isBusy}
                data-testid="backup-restore-confirm-button"
              >
                {props.isBusy
                  ? t('options.backupShare.restoring')
                  : t('options.backupShare.confirmRestore')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            <section className={groupClassName}>
              <h3 className="text-sm font-extrabold text-[var(--promptit-options-text-primary)]">
                {t('options.backupShare.dataGroupTitle')}
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => {
                    void props.onExportBackup();
                  }}
                  disabled={props.isBusy}
                  data-testid="backup-export-button"
                >
                  {t('options.backupShare.backupButton')}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => restoreInputRef.current?.click()}
                  disabled={props.isBusy}
                  data-testid="backup-restore-file-button"
                >
                  {t('options.backupShare.restoreButton')}
                </button>
              </div>
            </section>

            <section className={groupClassName}>
              <h3 className="text-sm font-extrabold text-[var(--promptit-options-text-primary)]">
                {t('options.backupShare.promptGroupTitle')}
              </h3>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => {
                    void props.onExportSharedPrompts();
                  }}
                  disabled={props.isBusy || !hasPrompts}
                  aria-describedby={
                    hasPrompts ? undefined : shareDisabledReasonId
                  }
                  data-testid="prompts-share-button"
                >
                  {t('options.backupShare.shareButton')}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => importInputRef.current?.click()}
                  disabled={props.isBusy}
                  data-testid="prompts-import-file-button"
                >
                  {t('options.backupShare.importButton')}
                </button>
              </div>
              {!hasPrompts ? (
                <p
                  id={shareDisabledReasonId}
                  className="mt-3 text-sm leading-5 text-[var(--promptit-options-text-muted)]"
                >
                  {t('options.backupShare.shareDisabledEmpty')}
                </p>
              ) : null}
            </section>
          </div>
        )}

        <input
          ref={restoreInputRef}
          type="file"
          className="sr-only"
          accept="application/json,.json"
          aria-label={t('options.backupShare.restoreButton')}
          onChange={(event) => {
            void handleRestoreFileChange(event);
          }}
          tabIndex={-1}
          data-testid="backup-restore-file-input"
        />
        <input
          ref={importInputRef}
          type="file"
          className="sr-only"
          accept="application/json,.json"
          aria-label={t('options.backupShare.importButton')}
          onChange={(event) => {
            void handleImportFileChange(event);
          }}
          tabIndex={-1}
          data-testid="prompts-import-file-input"
        />
      </div>
    </div>
  );
}

function PreviewItem(props: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--promptit-options-text-subtle)]">
        {props.label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[var(--promptit-options-text-primary)]">
        {props.value}
      </dd>
    </div>
  );
}
