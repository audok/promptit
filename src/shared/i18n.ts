export const SUPPORTED_LOCALES = ['ko', 'en'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
export type LanguagePreference = 'system' | Locale;
export type I18nValues = Record<string, string | number>;

export const FALLBACK_LOCALE: Locale = 'ko';
export const LANGUAGE_PREFERENCE_STORAGE_KEY = 'promptit:languagePreference';
export const PRODUCT_NAME = 'promptit';
export const SERVICE_CHATGPT = 'ChatGPT';
export const SERVICE_GEMINI = 'Gemini';
export const TRIGGER_SLASH = '/';
export const TRIGGER_SPACE = 'Space';

const koMessages = {
  'runtime.openOptions.failed': '설정 페이지를 열지 못했습니다.',
  'runtime.request.failed': 'promptit 요청 처리 중 오류가 발생했습니다.',
  'runtime.prompt.updateConflict':
    '다른 창의 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 시도해주세요.',
  'runtime.prompt.updateNotFound': '수정할 프롬프트를 찾지 못했습니다.',
  'runtime.prompt.deleteConflict':
    '다른 창의 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 시도해주세요.',
  'runtime.prompt.deleteNotFound': '삭제할 프롬프트를 찾지 못했습니다.',
  'runtime.prompt.readNotFound': '프롬프트를 찾지 못했습니다.',
  'runtime.prompt.readFailed': '프롬프트를 읽는 중 오류가 발생했습니다.',
  'runtime.prompt.saveFailed': '프롬프트 저장 중 오류가 발생했습니다.',
  'runtime.prompt.deleteFailed': '프롬프트 삭제 중 오류가 발생했습니다.',
  'runtime.prompt.pinConflict':
    '다른 창의 변경이 먼저 저장되었습니다. 최신 내용을 확인한 뒤 다시 시도해주세요.',
  'runtime.prompt.pinNotFound': '수정할 프롬프트를 찾지 못했습니다.',
  'runtime.prompt.pinFailed': '프롬프트 저장 중 오류가 발생했습니다.',

  'content.toast.openOptionsFailed': '설정 페이지를 열지 못했습니다.',
  'content.toast.promptListReadFailed': '프롬프트 목록을 읽지 못했습니다.',
  'content.toast.promptBodyReadFailed': '프롬프트 본문을 읽지 못했습니다.',
  'content.toast.insertFailed': '프롬프트 처리 중 오류가 발생했습니다.',
  'content.toast.copySuccess': '프롬프트를 복사했습니다.',
  'content.toast.copyFailed': '프롬프트 복사에 실패했습니다.',
  'content.toast.cleanupFailed': '입력창 정리에 실패했습니다.',
  'content.toast.pinSuccess': '프롬프트를 고정했습니다.',
  'content.toast.unpinSuccess': '프롬프트 고정을 해제했습니다.',
  'content.toast.pinConflict':
    '프롬프트가 다른 곳에서 변경되었습니다. 다시 시도해 주세요.',
  'content.toast.pinNotFound': '고정 상태를 변경할 프롬프트를 찾지 못했습니다.',
  'content.toast.pinFailed': '프롬프트 고정 상태를 변경하지 못했습니다.',
  'content.popup.regionLabel': '{product} 프롬프트 선택기',
  'content.popup.listLabel': '저장된 프롬프트',
  'content.popup.exitButton': '닫기',
  'content.popup.savedCount': '{count}개 저장됨',
  'content.popup.openSettingsAria': '설정 열기',
  'content.popup.pinAria': '{title} 고정',
  'content.popup.unpinAria': '{title} 고정 해제',
  'content.popup.insertAria': '{title} 삽입',
  'content.popup.copyAria': '{title} 복사',
  'content.popup.emptyTitle': '저장된 프롬프트가 없습니다.',
  'content.popup.emptyDescription': '설정에서 첫 프롬프트를 추가하세요.',
  'content.popup.emptyItemAria': '{title} {description}',

  'options.language.option.system': '시스템',
  'options.language.option.ko': '한국어',
  'options.language.option.en': 'English',
  'options.language.localeName.ko': '한국어',
  'options.language.localeName.en': '영어',
  'options.language.menuButtonAria':
    '언어 메뉴 열기: {preference}, 현재 {locale}',
  'options.language.menuLabel': '언어 선택',
  'options.theme.selectorLabel': '테마 선택',
  'options.theme.option.system': '시스템',
  'options.theme.option.light': '라이트',
  'options.theme.option.dark': '다크',
  'options.theme.saveFailed': '테마 설정을 저장하지 못했습니다.',
  'options.hero.title': '프롬프트를 저장하고 붙여 넣으세요.',
  'options.hero.copyBeforeShortcut':
    '이 페이지에서 프롬프트를 저장하고 수정하세요. {chatgpt}, {gemini} 사이트에서',
  'options.hero.copyAfterShortcut':
    '를 입력하여 쉽게 붙여넣으세요. 목록에서 프롬프트를 끌어 순서를 변경할 수 있습니다.',
  'options.metric.savedPrompts': '저장된 프롬프트',
  'options.metric.editState': '편집 상태',
  'options.metric.status': '상태',
  'options.metric.editing': '수정 중',
  'options.metric.creating': '추가 중',
  'options.status.loadFailed': '불러오기 실패',
  'options.status.loading': '불러오는 중',
  'options.status.loadingBody': '본문 불러오는 중',
  'options.status.saving': '저장 중',
  'options.status.idle': '대기 중',
  'options.list.loading': '저장된 프롬프트를 불러오는 중입니다.',
  'options.list.empty':
    '아직 저장된 프롬프트가 없습니다. 오른쪽 편집기에서 프롬프트를 추가하세요.',
  'options.list.eyebrow': '프롬프트 목록',
  'options.list.heading': '저장된 프롬프트',
  'options.list.addButton': '프롬프트 추가',
  'options.list.group.pinned': '고정됨',
  'options.list.group.normal': '일반',
  'options.list.pinAria': '{title} 고정',
  'options.list.unpinAria': '{title} 고정 해제',
  'options.list.pinTitle': '고정',
  'options.list.unpinTitle': '고정 해제',
  'options.list.reorderAria': '{title} 순서 변경',
  'options.list.reorderTitle': '순서 변경',
  'options.list.editAria': '{title} 편집',
  'options.list.deleteAria': '{title} 삭제',
  'options.list.deleteButton': '삭제',
  'options.list.charCount': '{count}자',
  'options.list.updatedLabel': '수정',
  'options.list.createdLabel': '추가',
  'options.list.dropHere': '여기에 놓기',
  'options.list.reorder.crossGroup':
    '고정됨 목록과 일반 목록 사이에서는 끌어서 순서를 바꿀 수 없습니다.',
  'options.list.reorder.success': '{title} 순서를 변경했습니다.',
  'options.list.reorder.first':
    '{title}은 이미 {group} 목록의 첫 번째입니다.',
  'options.list.reorder.last':
    '{title}은 이미 {group} 목록의 마지막입니다.',
  'options.editor.eyebrow': '편집기',
  'options.editor.heading.edit': '프롬프트 수정',
  'options.editor.heading.add': '프롬프트 추가',
  'options.editor.cancelEdit': '편집 취소',
  'options.editor.conflictHeading': '충돌 감지됨',
  'options.editor.latestSaved': '최신 저장본 {timestamp}',
  'options.editor.bodyLoading': '선택한 프롬프트 본문을 불러오는 중입니다.',
  'options.editor.titleLabel': '제목',
  'options.editor.titleHint': '1자 이상 40자 이하',
  'options.editor.titlePlaceholder': '예: 회의록 정리',
  'options.editor.contentLabel': '본문',
  'options.editor.contentHint': '실제로 삽입할 프롬프트 본문',
  'options.editor.contentPlaceholder': '프롬프트를 입력하세요.',
  'options.editor.contentLoadingPlaceholder': '본문을 불러오는 중입니다.',
  'options.editor.submitSaving': '저장 중...',
  'options.editor.submitLoadingBody': '본문 불러오는 중',
  'options.editor.submitEdit': '프롬프트 수정',
  'options.editor.submitAdd': '프롬프트 추가',
  'options.editor.deleteButton': '프롬프트 삭제',
  'options.editor.bannerDismissLabel': '메시지 닫기',
  'options.editor.bannerDismissText': '닫기',
  'options.confirm.discardDirty':
    '저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
  'options.confirm.deletePrompt': '"{title}" 프롬프트를 삭제할까요?',
  'options.toast.promptCreated': '프롬프트를 저장했습니다.',
  'options.toast.promptUpdated': '프롬프트를 업데이트했습니다.',
  'options.toast.promptDeleted': '프롬프트를 삭제했습니다.',
  'options.toast.promptPinned': '프롬프트를 고정했습니다.',
  'options.toast.promptUnpinned': '프롬프트 고정을 해제했습니다.',
  'options.error.loadPrompts':
    '저장된 프롬프트를 읽지 못했습니다. 확장 프로그램을 다시 열어 확인해보세요.',
  'options.error.loadPromptBody':
    '프롬프트 본문을 읽지 못했습니다. 잠시 후 다시 시도해주세요.',
  'options.error.savePrompt': '프롬프트 저장 중 오류가 발생했습니다.',
  'options.error.deletePrompt': '프롬프트 삭제 중 오류가 발생했습니다.',
  'options.error.reorderPrompt':
    '프롬프트 순서 변경 중 오류가 발생했습니다.',
  'options.error.pinPrompt':
    '프롬프트 고정 상태 변경 중 오류가 발생했습니다.',
  'options.error.languagePreference': '언어 설정을 저장하지 못했습니다.',
  'options.alert.updateNotFoundCreateMode':
    '수정할 프롬프트를 찾지 못했습니다. 프롬프트 추가 모드로 전환했습니다.',
  'options.alert.deleteNotFoundCreateMode':
    '삭제할 프롬프트를 찾지 못했습니다. 프롬프트 추가 모드로 전환했습니다.',
  'options.alert.pinNotFoundCreateMode':
    '수정할 프롬프트를 찾지 못했습니다. 프롬프트 추가 모드로 전환했습니다.',
  'options.notice.deleteRecoveryCreateMode':
    '편집 중인 프롬프트가 삭제되어 프롬프트 추가 모드로 전환했습니다.',
  'options.alert.externalChange':
    '다른 창의 변경이 먼저 저장되었습니다. 현재 입력은 유지되며 저장 시 충돌이 발생할 수 있습니다.',
  'options.alert.conflictRetry':
    '{message} 최신 저장본을 확인한 뒤 다시 시도해주세요.',
  'options.alert.notFoundCreateMode':
    '{message} 프롬프트 추가 모드로 전환했습니다.',

  'prompt.validation.titleLength':
    '제목은 1자 이상 40자 이하로 입력해주세요.',
  'prompt.validation.contentRequired': '본문은 비워둘 수 없습니다.',
  'prompt.validation.contentMaxBytes': '본문은 500KB 이하로 입력해주세요.',
  'prompt.validation.normalOrderInvalid':
    '정렬 순서는 0 이상의 정수여야 합니다.',
  'prompt.validation.pinnedOrderInvalid':
    '고정 정렬 순서는 0 이상의 정수여야 합니다.',
} as const;

export type I18nKey = keyof typeof koMessages;

const enMessages: Record<I18nKey, string> = {
  'runtime.openOptions.failed': 'Could not open the settings page.',
  'runtime.request.failed': 'The promptit runtime request failed.',
  'runtime.prompt.updateConflict':
    'Changes from another window were saved first. Review the latest version and try again.',
  'runtime.prompt.updateNotFound': 'Could not find the prompt to update.',
  'runtime.prompt.deleteConflict':
    'Changes from another window were saved first. Review the latest version and try again.',
  'runtime.prompt.deleteNotFound': 'Could not find the prompt to delete.',
  'runtime.prompt.readNotFound': 'Could not find the prompt.',
  'runtime.prompt.readFailed': 'An error occurred while reading prompts.',
  'runtime.prompt.saveFailed': 'An error occurred while saving the prompt.',
  'runtime.prompt.deleteFailed': 'An error occurred while deleting the prompt.',
  'runtime.prompt.pinConflict':
    'The prompt was changed elsewhere. Review the latest version and try again.',
  'runtime.prompt.pinNotFound': 'Could not find the prompt to change pin state.',
  'runtime.prompt.pinFailed': 'Could not change the prompt pin state.',

  'content.toast.openOptionsFailed': 'Could not open the settings page.',
  'content.toast.promptListReadFailed': 'Could not read the prompt list.',
  'content.toast.promptBodyReadFailed': 'Could not read the prompt body.',
  'content.toast.insertFailed': 'Could not insert the prompt.',
  'content.toast.copySuccess': 'Prompt copied.',
  'content.toast.copyFailed': 'Could not copy the prompt.',
  'content.toast.cleanupFailed': 'Could not clean up the input field.',
  'content.toast.pinSuccess': 'Prompt pinned.',
  'content.toast.unpinSuccess': 'Prompt unpinned.',
  'content.toast.pinConflict':
    'The prompt was changed elsewhere. Try again.',
  'content.toast.pinNotFound': 'Could not find the prompt to change pin state.',
  'content.toast.pinFailed': 'Could not change the prompt pin state.',
  'content.popup.regionLabel': '{product} prompt picker',
  'content.popup.listLabel': 'Saved prompts',
  'content.popup.exitButton': 'Exit',
  'content.popup.savedCount': '{count} saved',
  'content.popup.openSettingsAria': 'Open settings',
  'content.popup.pinAria': 'Pin prompt: {title}',
  'content.popup.unpinAria': 'Unpin prompt: {title}',
  'content.popup.insertAria': 'Insert prompt: {title}',
  'content.popup.copyAria': 'Copy prompt: {title}',
  'content.popup.emptyTitle': 'No saved prompts.',
  'content.popup.emptyDescription': 'Add your first prompt in settings.',
  'content.popup.emptyItemAria': '{title} {description}',

  'options.language.option.system': 'System',
  'options.language.option.ko': '한국어',
  'options.language.option.en': 'English',
  'options.language.localeName.ko': 'Korean',
  'options.language.localeName.en': 'English',
  'options.language.menuButtonAria':
    'Open language menu: {preference}, current {locale}',
  'options.language.menuLabel': 'Language selection',
  'options.theme.selectorLabel': 'Theme selection',
  'options.theme.option.system': 'System',
  'options.theme.option.light': 'Light',
  'options.theme.option.dark': 'Dark',
  'options.theme.saveFailed': 'Could not save the theme setting.',
  'options.hero.title': 'Save and paste prompts.',
  'options.hero.copyBeforeShortcut':
    'Save and edit prompts here. On {chatgpt} and {gemini}, type',
  'options.hero.copyAfterShortcut':
    'to paste them quickly. Drag prompts in the list to reorder them.',
  'options.metric.savedPrompts': 'Saved prompts',
  'options.metric.editState': 'Editor',
  'options.metric.status': 'Status',
  'options.metric.editing': 'Editing',
  'options.metric.creating': 'Adding',
  'options.status.loadFailed': 'Load failed',
  'options.status.loading': 'Loading',
  'options.status.loadingBody': 'Loading body',
  'options.status.saving': 'Saving',
  'options.status.idle': 'Idle',
  'options.list.loading': 'Loading saved prompts.',
  'options.list.empty':
    'No saved prompts yet. Add a prompt in the editor on the right.',
  'options.list.eyebrow': 'Prompt list',
  'options.list.heading': 'Saved prompts',
  'options.list.addButton': 'Add prompt',
  'options.list.group.pinned': 'Pinned',
  'options.list.group.normal': 'Normal',
  'options.list.pinAria': 'Pin {title}',
  'options.list.unpinAria': 'Unpin {title}',
  'options.list.pinTitle': 'Pin',
  'options.list.unpinTitle': 'Unpin',
  'options.list.reorderAria': 'Reorder {title}',
  'options.list.reorderTitle': 'Reorder',
  'options.list.editAria': 'Edit {title}',
  'options.list.deleteAria': 'Delete {title}',
  'options.list.deleteButton': 'Delete',
  'options.list.charCount': '{count} chars',
  'options.list.updatedLabel': 'Updated',
  'options.list.createdLabel': 'Created',
  'options.list.dropHere': 'Drop here',
  'options.list.reorder.crossGroup':
    'Pinned and normal prompts cannot be reordered across lists.',
  'options.list.reorder.success': 'Reordered {title}.',
  'options.list.reorder.first':
    '{title} is already first in the {group} list.',
  'options.list.reorder.last':
    '{title} is already last in the {group} list.',
  'options.editor.eyebrow': 'Editor',
  'options.editor.heading.edit': 'Edit prompt',
  'options.editor.heading.add': 'Add prompt',
  'options.editor.cancelEdit': 'Cancel edit',
  'options.editor.conflictHeading': 'Conflict detected',
  'options.editor.latestSaved': 'Latest saved {timestamp}',
  'options.editor.bodyLoading': 'Loading the selected prompt body.',
  'options.editor.titleLabel': 'Title',
  'options.editor.titleHint': '1 to 40 characters',
  'options.editor.titlePlaceholder': 'Example: Summarize meeting notes',
  'options.editor.contentLabel': 'Body',
  'options.editor.contentHint': 'Prompt body to insert',
  'options.editor.contentPlaceholder': 'Enter a prompt.',
  'options.editor.contentLoadingPlaceholder': 'Loading body.',
  'options.editor.submitSaving': 'Saving...',
  'options.editor.submitLoadingBody': 'Loading body',
  'options.editor.submitEdit': 'Update prompt',
  'options.editor.submitAdd': 'Add prompt',
  'options.editor.deleteButton': 'Delete prompt',
  'options.editor.bannerDismissLabel': 'Dismiss message',
  'options.editor.bannerDismissText': 'Dismiss',
  'options.confirm.discardDirty':
    'You have unsaved changes. Discard them and continue?',
  'options.confirm.deletePrompt': 'Delete "{title}" prompt?',
  'options.toast.promptCreated': 'Prompt saved.',
  'options.toast.promptUpdated': 'Prompt updated.',
  'options.toast.promptDeleted': 'Prompt deleted.',
  'options.toast.promptPinned': 'Prompt pinned.',
  'options.toast.promptUnpinned': 'Prompt unpinned.',
  'options.error.loadPrompts':
    'Could not read saved prompts. Reopen the extension and check again.',
  'options.error.loadPromptBody':
    'Could not read the prompt body. Try again shortly.',
  'options.error.savePrompt': 'An error occurred while saving the prompt.',
  'options.error.deletePrompt': 'An error occurred while deleting the prompt.',
  'options.error.reorderPrompt':
    'An error occurred while reordering the prompt.',
  'options.error.pinPrompt':
    'An error occurred while changing the prompt pin state.',
  'options.error.languagePreference': 'Could not save the language setting.',
  'options.alert.updateNotFoundCreateMode':
    'Could not find the prompt to update. Switched to add prompt mode.',
  'options.alert.deleteNotFoundCreateMode':
    'Could not find the prompt to delete. Switched to add prompt mode.',
  'options.alert.pinNotFoundCreateMode':
    'Could not find the prompt to change pin state. Switched to add prompt mode.',
  'options.notice.deleteRecoveryCreateMode':
    'The prompt you were editing was deleted, so the editor switched to add prompt mode.',
  'options.alert.externalChange':
    'Changes from another window were saved first. Your current input is kept, but saving may conflict.',
  'options.alert.conflictRetry':
    '{message} Review the latest saved version and try again.',
  'options.alert.notFoundCreateMode':
    '{message} Switched to add prompt mode.',

  'prompt.validation.titleLength':
    'Enter a title between 1 and 40 characters.',
  'prompt.validation.contentRequired': 'Body cannot be empty.',
  'prompt.validation.contentMaxBytes': 'Body must be 500KB or less.',
  'prompt.validation.normalOrderInvalid':
    'Sort order must be an integer of 0 or greater.',
  'prompt.validation.pinnedOrderInvalid':
    'Pinned sort order must be an integer of 0 or greater.',
};

export const I18N_MESSAGES: Record<Locale, Record<I18nKey, string>> = {
  ko: koMessages,
  en: enMessages,
};

export type RuntimeMessageDescriptor = {
  key: I18nKey;
  values?: I18nValues;
};

export type LocalizedMessageDescriptor = RuntimeMessageDescriptor & {
  fallback: string;
};

export function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  return value === 'system' || isLocale(value);
}

export function isI18nKey(value: unknown): value is I18nKey {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(koMessages, value)
  );
}

export function resolveLocale(input: {
  preference: LanguagePreference;
  uiLanguage: string | undefined;
}): Locale {
  if (input.preference !== 'system') {
    return input.preference;
  }

  const normalizedUiLanguage = input.uiLanguage?.toLowerCase().trim();

  if (!normalizedUiLanguage) {
    return FALLBACK_LOCALE;
  }

  const primaryLanguage = normalizedUiLanguage.split(/[-_]/)[0];
  return isLocale(primaryLanguage) ? primaryLanguage : FALLBACK_LOCALE;
}

export function getBrowserUiLanguage(): string | undefined {
  if (typeof chrome === 'undefined' || !chrome.i18n?.getUILanguage) {
    return undefined;
  }

  return chrome.i18n.getUILanguage();
}

export async function readLanguagePreference(): Promise<LanguagePreference> {
  if (!hasStorageApi()) {
    return 'system';
  }

  const result = await chrome.storage.local.get(LANGUAGE_PREFERENCE_STORAGE_KEY);
  const value = result[LANGUAGE_PREFERENCE_STORAGE_KEY];

  return isLanguagePreference(value) ? value : 'system';
}

export async function writeLanguagePreference(
  preference: LanguagePreference,
): Promise<void> {
  if (!hasStorageApi()) {
    return;
  }

  await chrome.storage.local.set({
    [LANGUAGE_PREFERENCE_STORAGE_KEY]: preference,
  });
}

export function subscribeToLanguagePreference(
  listener: (preference: LanguagePreference) => void,
): () => void {
  if (!hasStorageApi()) {
    return () => {};
  }

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !(LANGUAGE_PREFERENCE_STORAGE_KEY in changes)) {
      return;
    }

    const nextPreference = changes[LANGUAGE_PREFERENCE_STORAGE_KEY].newValue;
    listener(
      isLanguagePreference(nextPreference) ? nextPreference : 'system',
    );
  };

  chrome.storage.onChanged.addListener(handleChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleChange);
  };
}

export function translate(
  locale: Locale,
  key: I18nKey,
  values?: I18nValues,
): string {
  return interpolate(I18N_MESSAGES[locale][key] ?? koMessages[key], values);
}

export function describeMessage(
  key: I18nKey,
  values?: I18nValues,
): LocalizedMessageDescriptor {
  return {
    key,
    values,
    fallback: translate(FALLBACK_LOCALE, key, values),
  };
}

export function translateLocalizedMessage(
  locale: Locale,
  message: LocalizedMessageDescriptor,
): string {
  return translateRuntimeMessage(
    locale,
    { key: message.key, values: message.values },
    message.fallback,
  );
}

export function translateRuntimeMessage(
  locale: Locale,
  descriptor: RuntimeMessageDescriptor | undefined,
  fallback: string,
): string {
  if (!descriptor || !isI18nKey(descriptor.key)) {
    return fallback;
  }

  return translate(locale, descriptor.key, descriptor.values);
}

function interpolate(template: string, values?: I18nValues): string {
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, name: string) => {
    if (!values || !Object.prototype.hasOwnProperty.call(values, name)) {
      return match;
    }

    return String(values[name]);
  });
}

export function getIntlLocale(locale: Locale): 'ko-KR' | 'en-US' {
  return locale === 'ko' ? 'ko-KR' : 'en-US';
}

function hasStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
