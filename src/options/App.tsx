import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { type PromptMeta } from '../prompt/schema';
import { BUTTON_FOCUS_CLASS, MetricCard } from './components';
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

type LanguageCode = 'en' | 'ko';
type ThemeIcon = 'moon' | 'sun';

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  ko: '한국어',
};

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

  const statusRegionId = useId();
  const alertRegionId = useId();
  const languageMenuId = useId();
  const toastIdRef = useRef(0);
  const toastHideTimerRef = useRef<number | null>(null);
  const [toastMessage, setToastMessage] = useState<OptionsToastMessage | null>(
    null,
  );
  const [language, setLanguage] = useState<LanguageCode>('ko');
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [themeIcon, setThemeIcon] = useState<ThemeIcon>('sun');

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
          ? '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 프롬프트를 추가하세요.'
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
  const selectedLanguageLabel = LANGUAGE_LABELS[language];
  const heroSectionClassName =
    'rounded-[32px] border border-stone-200/80 bg-white/90 px-7 py-7 text-stone-950 shadow-[0_28px_70px_rgba(66,53,49,0.08)] backdrop-blur sm:px-8 lg:px-10 lg:py-8';
  const heroCopyClassName = 'max-w-3xl text-base leading-6 text-stone-600';
  const keyboardTokenClassName =
    'inline-flex min-w-7 items-center justify-center rounded-md border border-stone-300 bg-stone-50 px-2 py-1 font-mono text-[0.82em] font-semibold leading-none text-stone-900 shadow-[inset_0_-1px_0_rgba(68,64,59,0.14)]';
  const controlButtonClassName = `inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 text-[13px] font-semibold text-stone-950 shadow-[0_10px_22px_rgba(28,25,23,0.05)] transition hover:bg-stone-50 ${BUTTON_FOCUS_CLASS}`;
  const themeButtonClassName = `inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-950 shadow-[0_10px_22px_rgba(28,25,23,0.05)] transition hover:bg-stone-50 ${BUTTON_FOCUS_CLASS}`;

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

  function getLanguageOptionClassName(option: LanguageCode): string {
    return language === option
      ? `flex w-full items-center justify-between rounded-full bg-stone-950 px-4 py-2.5 text-left text-sm font-semibold text-white ${BUTTON_FOCUS_CLASS}`
      : `flex w-full items-center justify-between rounded-full px-4 py-2.5 text-left text-sm font-semibold text-stone-700 transition hover:bg-stone-100 ${BUTTON_FOCUS_CLASS}`;
  }

  function handleToggleLanguageMenu(): void {
    setIsLanguageMenuOpen((isOpen) => !isOpen);
  }

  function handleSelectLanguage(nextLanguage: LanguageCode): void {
    setLanguage(nextLanguage);
    setIsLanguageMenuOpen(false);
  }

  function handleLanguageMenuKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ): void {
    if (event.key === 'Escape') {
      setIsLanguageMenuOpen(false);
    }
  }

  function handleToggleTheme(): void {
    setThemeIcon((currentIcon) => (currentIcon === 'sun' ? 'moon' : 'sun'));
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <section className={heroSectionClassName}>
          <div className="flex flex-col gap-[27px]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-[30px] font-black leading-none">
                promptit
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
                    aria-label={`언어 메뉴 열기: 현재 ${selectedLanguageLabel}`}
                  >
                    <GlobeIcon className="h-[18px] w-[18px]" />
                    <span>{selectedLanguageLabel}</span>
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  </button>
                  {isLanguageMenuOpen ? (
                    <div
                      id={languageMenuId}
                      role="menu"
                      className="absolute right-0 top-[calc(100%+8px)] z-20 w-36 rounded-[20px] border border-stone-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(28,25,23,0.12)]"
                    >
                      {(['ko', 'en'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="menuitemradio"
                          aria-checked={language === option}
                          className={getLanguageOptionClassName(option)}
                          onClick={() => {
                            handleSelectLanguage(option);
                          }}
                        >
                          <span>{LANGUAGE_LABELS[option]}</span>
                          {language === option ? <span aria-hidden="true">✓</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={themeButtonClassName}
                  onClick={handleToggleTheme}
                  aria-label={
                    themeIcon === 'sun'
                      ? '테마 아이콘을 달로 전환'
                      : '테마 아이콘을 해로 전환'
                  }
                >
                  {themeIcon === 'moon' ? (
                    <MoonIcon className="h-5 w-5" />
                  ) : (
                    <SunIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-5">
                <h1 className="text-[28px] font-extrabold leading-tight">
                  프롬프트를 저장하고 붙여 넣으세요.
                </h1>
                <p className={heroCopyClassName}>
                  이 페이지에서 프롬프트를 저장하고 수정하세요. ChatGPT, Gemini
                  사이트에서{' '}
                  <span className="inline-flex items-center gap-1 align-middle" aria-label="/ space">
                    <kbd className={keyboardTokenClassName}>
                      /
                    </kbd>
                    <kbd className={keyboardTokenClassName}>
                      Space
                    </kbd>
                  </span>
                  를 입력하여 쉽게 붙여넣으세요. 목록에서 프롬프트를 끌어 순서를
                  변경할 수 있습니다.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:min-w-[490px]">
                <MetricCard
                  label="저장된 프롬프트"
                  value={`${prompts.length}`}
                />
                <MetricCard
                  label="편집 상태"
                  value={isEditing ? '수정 중' : '추가 중'}
                />
                <MetricCard
                  label="상태"
                  value={loadStatusLabel}
                />
              </div>
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
