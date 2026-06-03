import {
  PROMPT_BODY_MAX_BYTES,
  getPromptCharCount,
  parsePromptRecord,
  validatePromptDraft,
  type PromptDraft,
  type PromptRecord,
} from '../prompt/schema';
import {
  isLanguagePreference,
  type LanguagePreference,
} from '../shared/i18n';
import {
  isThemePreference,
  type ThemePreference,
} from '../shared/theme';

export const PROMPTIT_BACKUP_FILE_TYPE = 'promptit.backup';
export const PROMPTIT_SHARED_PROMPTS_FILE_TYPE = 'promptit.prompts';
export const PROMPTIT_PORTABILITY_MAX_PROMPTS = 2_000;
export const PROMPTIT_PORTABILITY_METADATA_FILE_BYTES = 20 * 1024 * 1024;
export const PROMPTIT_PORTABILITY_MAX_FILE_BYTES =
  PROMPTIT_PORTABILITY_MAX_PROMPTS * PROMPT_BODY_MAX_BYTES +
  PROMPTIT_PORTABILITY_METADATA_FILE_BYTES;
export const PROMPTIT_PORTABILITY_UI_MAX_FILE_BYTES = 25 * 1024 * 1024;

type PromptitPortabilityParseOptions = {
  enforceSizeLimits?: boolean;
};

export type PromptitBackupSettings = {
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
};

export type PromptitBackupFile = {
  type: typeof PROMPTIT_BACKUP_FILE_TYPE;
  appVersion: string;
  exportedAt: string;
  data: {
    prompts: PromptRecord[];
    settings: PromptitBackupSettings;
  };
};

export type PromptitSharedPrompt = {
  title: string;
  content: string;
};

export type PromptitSharedPromptsFile = {
  type: typeof PROMPTIT_SHARED_PROMPTS_FILE_TYPE;
  appVersion: string;
  exportedAt: string;
  data: {
    prompts: PromptitSharedPrompt[];
  };
};

export function parsePromptitBackupFile(
  value: unknown,
  options: PromptitPortabilityParseOptions = {},
): PromptitBackupFile | null {
  if (!isObjectRecord(value) || !hasExactKeys(value, [
    'type',
    'appVersion',
    'exportedAt',
    'data',
  ])) {
    return null;
  }

  if (
    value.type !== PROMPTIT_BACKUP_FILE_TYPE ||
    typeof value.appVersion !== 'string' ||
    value.appVersion.trim().length < 1 ||
    !isValidTimestamp(value.exportedAt) ||
    !isObjectRecord(value.data) ||
    !hasExactKeys(value.data, ['prompts', 'settings']) ||
    !Array.isArray(value.data.prompts)
  ) {
    return null;
  }

  const settings = parseBackupSettings(value.data.settings);

  if (!settings) {
    return null;
  }

  if (
    shouldEnforceSizeLimits(options) &&
    !isPromptitPortabilityPromptCountAllowed(value.data.prompts.length)
  ) {
    return null;
  }

  const prompts: PromptRecord[] = [];
  const ids = new Set<string>();

  for (const entry of value.data.prompts) {
    const prompt = parseBackupPromptRecord(entry);

    if (!prompt || ids.has(prompt.id)) {
      return null;
    }

    ids.add(prompt.id);
    prompts.push(prompt);
  }

  return {
    type: PROMPTIT_BACKUP_FILE_TYPE,
    appVersion: value.appVersion,
    exportedAt: value.exportedAt,
    data: {
      prompts,
      settings,
    },
  };
}

export function parsePromptitSharedPromptsFile(
  value: unknown,
  options: PromptitPortabilityParseOptions = {},
): PromptitSharedPromptsFile | null {
  if (!isObjectRecord(value) || !hasExactKeys(value, [
    'type',
    'appVersion',
    'exportedAt',
    'data',
  ])) {
    return null;
  }

  if (
    value.type !== PROMPTIT_SHARED_PROMPTS_FILE_TYPE ||
    typeof value.appVersion !== 'string' ||
    value.appVersion.trim().length < 1 ||
    !isValidTimestamp(value.exportedAt) ||
    !isObjectRecord(value.data) ||
    !hasExactKeys(value.data, ['prompts']) ||
    !Array.isArray(value.data.prompts)
  ) {
    return null;
  }

  if (
    shouldEnforceSizeLimits(options) &&
    !isPromptitPortabilityPromptCountAllowed(value.data.prompts.length)
  ) {
    return null;
  }

  const prompts: PromptitSharedPrompt[] = [];

  for (const entry of value.data.prompts) {
    const prompt = parseSharedPrompt(entry);

    if (!prompt) {
      return null;
    }

    prompts.push(prompt);
  }

  return {
    type: PROMPTIT_SHARED_PROMPTS_FILE_TYPE,
    appVersion: value.appVersion,
    exportedAt: value.exportedAt,
    data: {
      prompts,
    },
  };
}

export function parsePromptitBackupFileOrThrow(
  value: unknown,
): PromptitBackupFile {
  const parsed = parsePromptitBackupFile(value, {
    enforceSizeLimits: true,
  });

  if (!parsed) {
    throw new Error('Invalid promptit backup file.');
  }

  return parsed;
}

export function parsePromptitSharedPromptsFileOrThrow(
  value: unknown,
): PromptitSharedPromptsFile {
  const parsed = parsePromptitSharedPromptsFile(value, {
    enforceSizeLimits: true,
  });

  if (!parsed) {
    throw new Error('Invalid promptit shared prompts file.');
  }

  return parsed;
}

export function sharedPromptsToDrafts(
  prompts: PromptitSharedPrompt[],
): PromptDraft[] {
  return prompts.map((prompt) => ({
    title: prompt.title,
    content: prompt.content,
    pinned: false,
  }));
}

export function isPromptitPortabilityFileSizeAllowed(file: {
  size: number;
}): boolean {
  return (
    Number.isFinite(file.size) &&
    file.size >= 0 &&
    file.size <= PROMPTIT_PORTABILITY_MAX_FILE_BYTES
  );
}

export function isPromptitPortabilityUiFileSizeAllowed(file: {
  size: number;
}): boolean {
  return (
    Number.isFinite(file.size) &&
    file.size >= 0 &&
    file.size <= PROMPTIT_PORTABILITY_UI_MAX_FILE_BYTES
  );
}

export function isPromptitPortabilityPromptCountAllowed(
  promptCount: number,
): boolean {
  return (
    Number.isInteger(promptCount) &&
    promptCount >= 0 &&
    promptCount <= PROMPTIT_PORTABILITY_MAX_PROMPTS
  );
}

function shouldEnforceSizeLimits(
  options: PromptitPortabilityParseOptions,
): boolean {
  return options.enforceSizeLimits === true;
}

function parseBackupSettings(value: unknown): PromptitBackupSettings | null {
  if (
    !isObjectRecord(value) ||
    !hasExactKeys(value, ['languagePreference', 'themePreference']) ||
    !isLanguagePreference(value.languagePreference) ||
    !isThemePreference(value.themePreference)
  ) {
    return null;
  }

  return {
    languagePreference: value.languagePreference,
    themePreference: value.themePreference,
  };
}

function parseBackupPromptRecord(value: unknown): PromptRecord | null {
  if (
    !isObjectRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'title',
      'content',
      'pinned',
      'normalOrder',
      'pinnedOrder',
      'createdAt',
      'updatedAt',
      'bodyUpdatedAt',
      'charCount',
    ])
  ) {
    return null;
  }

  const record = parsePromptRecord({
    ...value,
    charCount:
      typeof value.content === 'string'
        ? getPromptCharCount(value.content)
        : value.charCount,
  });

  if (!record) {
    return null;
  }

  return {
    ...record,
    charCount: getPromptCharCount(record.content),
  };
}

function parseSharedPrompt(value: unknown): PromptitSharedPrompt | null {
  if (
    !isObjectRecord(value) ||
    !hasExactKeys(value, ['title', 'content']) ||
    typeof value.title !== 'string' ||
    typeof value.content !== 'string'
  ) {
    return null;
  }

  const prompt = {
    title: value.title.trim(),
    content: value.content,
  };

  if (Object.keys(validatePromptDraft(prompt)).length > 0) {
    return null;
  }

  return prompt;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value);

  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
