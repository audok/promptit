import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  exportBackup,
  exportSharedPrompts,
  importSharedPrompts,
  restoreBackup,
} from '../backup/runtimeClient';
import {
  type PromptitBackupFile,
  type PromptitSharedPromptsFile,
} from '../backup/schema';
import { type PromptMeta } from '../prompt/schema';
import {
  translate,
  translateLocalizedMessage,
  type I18nKey,
  type LanguagePreference,
  type Locale,
  type LocalizedMessageDescriptor,
} from '../shared/i18n';
import { type ThemePreference } from '../shared/theme';
import {
  type OptionsToastMessage,
  type OptionsToastTone,
} from './OptionsToast';
import {
  type UseLanguagePreferenceResult,
  useLanguagePreference,
} from './useLanguagePreference';
import {
  type UsePromptEditorResult,
  usePromptEditor,
} from './usePromptEditor';
import {
  type UseThemePreferenceResult,
  useThemePreference,
} from './useThemePreference';

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

type OptionsPageEditorState = {
  activePromptId: string | null;
  activePromptMeta: PromptMeta | null;
  alertMessage: UsePromptEditorResult['alertMessage'];
  bodyLoadState: UsePromptEditorResult['bodyLoadState'];
  conflictState: UsePromptEditorResult['conflictState'];
  editorDisabled: boolean;
  errors: UsePromptEditorResult['errors'];
  form: UsePromptEditorResult['form'];
  inlineAlertMessageText: string | null;
  inlineNoticeText: string | null;
  isEditing: boolean;
  isEditorLoading: boolean;
  isSaving: boolean;
  listActionDisabled: boolean;
  listMessage: string | null;
  loadState: UsePromptEditorResult['loadState'];
  loadStatusLabel: string;
  notice: UsePromptEditorResult['notice'];
  prompts: PromptMeta[];
  reorderDisabled: boolean;
};

type OptionsPageEditorActions = {
  clearAlertMessage: UsePromptEditorResult['clearAlertMessage'];
  clearNotice: UsePromptEditorResult['clearNotice'];
  deletePrompt: (prompt: PromptMeta) => Promise<void>;
  movePromptWithinGroup: UsePromptEditorResult['movePromptWithinGroup'];
  selectPrompt: (prompt: PromptMeta) => Promise<void>;
  startCreateMode: () => void;
  submit: UsePromptEditorResult['submit'];
  togglePromptPinned: (id: string, pinned: boolean) => Promise<boolean>;
  updateField: UsePromptEditorResult['updateField'];
};

type OptionsPagePreferences = {
  language: {
    preference: UseLanguagePreferenceResult['preference'];
    select: (preference: UseLanguagePreferenceResult['preference']) => void;
  };
  theme: {
    preference: UseThemePreferenceResult['preference'];
    select: (preference: ThemePreference) => void;
  };
};

type OptionsPageBackupShare = {
  actions: {
    close: () => void;
    exportBackup: () => Promise<void>;
    exportSharedPrompts: () => Promise<void>;
    importSharedPrompts: (file: PromptitSharedPromptsFile) => Promise<void>;
    importSharedPromptsFailure: () => void;
    open: () => void;
    restoreBackup: (
      file: PromptitBackupFile,
      fileName: string,
    ) => Promise<boolean>;
    restoreBackupFailure: () => void;
  };
  state: {
    isBusy: boolean;
    isOpen: boolean;
  };
};

type OptionsPageToast = {
  actions: {
    showLocalizedMessage: (
      message: LocalizedMessageDescriptor,
      tone: OptionsToastTone,
    ) => void;
  };
  state: {
    message: OptionsToastMessage | null;
  };
};

export type OptionsPageController = {
  backupShare: OptionsPageBackupShare;
  editor: {
    actions: OptionsPageEditorActions;
    state: OptionsPageEditorState;
  };
  locale: Locale;
  preferences: OptionsPagePreferences;
  toast: OptionsPageToast;
};

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

function getJsonFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
}

function downloadJson(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export function useOptionsPageController(): OptionsPageController {
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

  const toastIdRef = useRef(0);
  const toastHideTimerRef = useRef<number | null>(null);
  const [toastMessage, setToastMessage] = useState<OptionsToastMessage | null>(
    null,
  );
  const [isBackupShareModalOpen, setIsBackupShareModalOpen] = useState(false);
  const [isBackupShareBusy, setIsBackupShareBusy] = useState(false);
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
    return await togglePromptPinned(id, pinned);
  }

  function handleSelectLanguage(nextLanguage: LanguagePreference): void {
    void setLanguagePreference(nextLanguage).catch((error) => {
      console.error('[promptit] Failed to save language preference.', error);
      showOptionsToast(t('options.error.languagePreference'), 'error');
    });
  }

  function handleSelectTheme(nextTheme: ThemePreference): void {
    void setThemePreference(nextTheme).catch((error) => {
      console.error('[promptit] Failed to save theme preference.', error);
      showOptionsToast(t('options.theme.saveFailed'), 'error');
    });
  }

  function handleOpenBackupShare(): void {
    setIsBackupShareModalOpen(true);
  }

  function handleCloseBackupShare(): void {
    if (!isBackupShareBusy) {
      setIsBackupShareModalOpen(false);
    }
  }

  async function handleExportBackup(): Promise<void> {
    setIsBackupShareBusy(true);

    try {
      const backupFile = await exportBackup();
      downloadJson(backupFile, getJsonFilename('promptit-backup'));
      showOptionsToast(t('options.toast.backupExported'), 'success');
    } catch (error) {
      console.error('[promptit] Failed to export backup.', error);
      showOptionsToast(t('options.toast.backupExportFailed'), 'error');
    } finally {
      setIsBackupShareBusy(false);
    }
  }

  async function handleExportSharedPrompts(): Promise<void> {
    setIsBackupShareBusy(true);

    try {
      const sharedPromptsFile = await exportSharedPrompts();
      downloadJson(sharedPromptsFile, getJsonFilename('promptit-prompts'));
      showOptionsToast(t('options.toast.promptsShared'), 'success');
    } catch (error) {
      console.error('[promptit] Failed to export shared prompts.', error);
      showOptionsToast(t('options.toast.promptsShareFailed'), 'error');
    } finally {
      setIsBackupShareBusy(false);
    }
  }

  async function handleRestoreBackup(
    file: PromptitBackupFile,
    fileName: string,
  ): Promise<boolean> {
    if (!confirmDiscardDirtyForm()) {
      return false;
    }

    setIsBackupShareBusy(true);

    try {
      await restoreBackup(file);
      showOptionsToast(
        t('options.toast.backupRestored', { fileName }),
        'success',
      );
      setIsBackupShareModalOpen(false);
      return true;
    } catch (error) {
      console.error('[promptit] Failed to restore backup.', error);
      showOptionsToast(t('options.toast.backupRestoreFailed'), 'error');
      return false;
    } finally {
      setIsBackupShareBusy(false);
    }
  }

  async function handleImportSharedPrompts(
    file: PromptitSharedPromptsFile,
  ): Promise<void> {
    setIsBackupShareBusy(true);

    try {
      const response = await importSharedPrompts(file);
      showOptionsToast(
        t('options.toast.promptsImported', {
          count: response.importedPromptCount,
        }),
        'success',
      );
      setIsBackupShareModalOpen(false);
    } catch (error) {
      console.error('[promptit] Failed to import shared prompts.', error);
      showOptionsToast(t('options.toast.promptsImportFailed'), 'error');
    } finally {
      setIsBackupShareBusy(false);
    }
  }

  function handleRestoreBackupFailure(): void {
    showOptionsToast(t('options.toast.backupRestoreFailed'), 'error');
  }

  function handleImportSharedPromptsFailure(): void {
    showOptionsToast(t('options.toast.promptsImportFailed'), 'error');
  }

  return {
    backupShare: {
      actions: {
        close: handleCloseBackupShare,
        exportBackup: handleExportBackup,
        exportSharedPrompts: handleExportSharedPrompts,
        importSharedPrompts: handleImportSharedPrompts,
        importSharedPromptsFailure: handleImportSharedPromptsFailure,
        open: handleOpenBackupShare,
        restoreBackup: handleRestoreBackup,
        restoreBackupFailure: handleRestoreBackupFailure,
      },
      state: {
        isBusy: isBackupShareBusy,
        isOpen: isBackupShareModalOpen,
      },
    },
    editor: {
      actions: {
        clearAlertMessage,
        clearNotice,
        deletePrompt: handleDelete,
        movePromptWithinGroup,
        selectPrompt: handleSelectPrompt,
        startCreateMode: handleStartCreateMode,
        submit,
        togglePromptPinned: handleTogglePromptPinned,
        updateField,
      },
      state: {
        activePromptId,
        activePromptMeta,
        alertMessage: inlineAlertMessage,
        bodyLoadState,
        conflictState,
        editorDisabled,
        errors,
        form,
        inlineAlertMessageText,
        inlineNoticeText,
        isEditing,
        isEditorLoading,
        isSaving,
        listActionDisabled,
        listMessage,
        loadState,
        loadStatusLabel,
        notice: inlineNotice,
        prompts,
        reorderDisabled,
      },
    },
    locale,
    preferences: {
      language: {
        preference: languagePreference,
        select: handleSelectLanguage,
      },
      theme: {
        preference: themePreference,
        select: handleSelectTheme,
      },
    },
    toast: {
      actions: {
        showLocalizedMessage: showLocalizedOptionsToast,
      },
      state: {
        message: toastMessage,
      },
    },
  };
}
