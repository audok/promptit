import {
  buildExportBackupRequest,
  buildExportPromptsRequest,
  buildImportPromptsRequest,
  buildRestoreBackupRequest,
  sendPromptitRuntimeRequest,
  type DataPortabilityErrorCode,
  type DataPortabilityRequest,
  type DataPortabilityResponse,
} from '../runtime/messages';
import type {
  LanguagePreference,
  RuntimeMessageDescriptor,
} from '../shared/i18n';
import type { ThemePreference } from '../shared/theme';
import type {
  PromptitBackupFile,
  PromptitSharedPromptsFile,
} from './schema';

type RuntimeFailureResponse = {
  code: DataPortabilityErrorCode;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
};

export class PromptitDataPortabilityError extends Error {
  readonly code: DataPortabilityErrorCode;
  readonly messageDescriptor?: RuntimeMessageDescriptor;

  constructor(
    code: DataPortabilityErrorCode,
    message: string,
    messageDescriptor?: RuntimeMessageDescriptor,
  ) {
    super(message);
    this.name = 'PromptitDataPortabilityError';
    this.code = code;
    this.messageDescriptor = messageDescriptor;
    Object.setPrototypeOf(this, PromptitDataPortabilityError.prototype);
  }
}

export async function exportBackup(): Promise<PromptitBackupFile> {
  const response = await sendRuntimeRequest(buildExportBackupRequest());

  if (response.type !== 'promptit/export-backup') {
    throw new Error('Received mismatched backup export response.');
  }

  if (!response.ok) {
    throwRuntimeResponseError(response);
  }

  return response.backup;
}

export async function restoreBackup(
  backup: PromptitBackupFile,
): Promise<{
  restoredPromptCount: number;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
}> {
  const response = await sendRuntimeRequest(buildRestoreBackupRequest(backup));

  if (response.type !== 'promptit/restore-backup') {
    throw new Error('Received mismatched backup restore response.');
  }

  if (!response.ok) {
    throwRuntimeResponseError(response);
  }

  return {
    restoredPromptCount: response.restoredPromptCount,
    languagePreference: response.languagePreference,
    themePreference: response.themePreference,
  };
}

export async function exportSharedPrompts(): Promise<PromptitSharedPromptsFile> {
  const response = await sendRuntimeRequest(buildExportPromptsRequest());

  if (response.type !== 'promptit/export-prompts') {
    throw new Error('Received mismatched prompt export response.');
  }

  if (!response.ok) {
    throwRuntimeResponseError(response);
  }

  return response.prompts;
}

export async function importSharedPrompts(
  prompts: PromptitSharedPromptsFile,
): Promise<{ importedPromptCount: number }> {
  const response = await sendRuntimeRequest(buildImportPromptsRequest(prompts));

  if (response.type !== 'promptit/import-prompts') {
    throw new Error('Received mismatched prompt import response.');
  }

  if (!response.ok) {
    throwRuntimeResponseError(response);
  }

  return {
    importedPromptCount: response.importedPromptCount,
  };
}

function hasRuntimeApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);
}

function sendRuntimeRequest(
  request: DataPortabilityRequest,
): Promise<DataPortabilityResponse> {
  if (!hasRuntimeApi()) {
    throw new Error('promptit runtime is unavailable.');
  }

  return sendPromptitRuntimeRequest(
    (nextRequest) => chrome.runtime.sendMessage(nextRequest) as Promise<unknown>,
    request,
  ) as Promise<DataPortabilityResponse>;
}

function throwRuntimeResponseError(response: RuntimeFailureResponse): never {
  throw new PromptitDataPortabilityError(
    response.code,
    response.message,
    response.messageDescriptor,
  );
}
