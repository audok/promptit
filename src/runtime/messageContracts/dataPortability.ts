import {
  parsePromptitBackupFile,
  parsePromptitSharedPromptsFile,
  type PromptitBackupFile,
  type PromptitSharedPromptsFile,
} from '../../backup/schema';
import {
  isLanguagePreference,
  type LanguagePreference,
  type RuntimeMessageDescriptor,
} from '../../shared/i18n';
import {
  isThemePreference,
  type ThemePreference,
} from '../../shared/theme';
import { parseRuntimeMessageDescriptor } from './shared';

export const EXPORT_BACKUP_MESSAGE = 'promptit/export-backup';
export const RESTORE_BACKUP_MESSAGE = 'promptit/restore-backup';
export const EXPORT_PROMPTS_MESSAGE = 'promptit/export-prompts';
export const IMPORT_PROMPTS_MESSAGE = 'promptit/import-prompts';

type DataPortabilityMessageType =
  | typeof EXPORT_BACKUP_MESSAGE
  | typeof RESTORE_BACKUP_MESSAGE
  | typeof EXPORT_PROMPTS_MESSAGE
  | typeof IMPORT_PROMPTS_MESSAGE;

export type ExportBackupRequest = {
  type: typeof EXPORT_BACKUP_MESSAGE;
};

export type RestoreBackupRequest = {
  type: typeof RESTORE_BACKUP_MESSAGE;
  backup: PromptitBackupFile;
};

export type ExportPromptsRequest = {
  type: typeof EXPORT_PROMPTS_MESSAGE;
};

export type ImportPromptsRequest = {
  type: typeof IMPORT_PROMPTS_MESSAGE;
  prompts: PromptitSharedPromptsFile;
};

export type DataPortabilityRequest =
  | ExportBackupRequest
  | RestoreBackupRequest
  | ExportPromptsRequest
  | ImportPromptsRequest;

export type DataPortabilityErrorCode = 'data-portability-failed';

export type ExportBackupSuccessResponse = {
  type: typeof EXPORT_BACKUP_MESSAGE;
  ok: true;
  status: 'success';
  backup: PromptitBackupFile;
};

export type RestoreBackupSuccessResponse = {
  type: typeof RESTORE_BACKUP_MESSAGE;
  ok: true;
  status: 'success';
  restoredPromptCount: number;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
};

export type ExportPromptsSuccessResponse = {
  type: typeof EXPORT_PROMPTS_MESSAGE;
  ok: true;
  status: 'success';
  prompts: PromptitSharedPromptsFile;
};

export type ImportPromptsSuccessResponse = {
  type: typeof IMPORT_PROMPTS_MESSAGE;
  ok: true;
  status: 'success';
  importedPromptCount: number;
};

type DataPortabilityErrorResponse<T extends DataPortabilityMessageType> = {
  type: T;
  ok: false;
  status: 'error';
  code: DataPortabilityErrorCode;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
};

export type ExportBackupResponse =
  | ExportBackupSuccessResponse
  | DataPortabilityErrorResponse<typeof EXPORT_BACKUP_MESSAGE>;

export type RestoreBackupResponse =
  | RestoreBackupSuccessResponse
  | DataPortabilityErrorResponse<typeof RESTORE_BACKUP_MESSAGE>;

export type ExportPromptsResponse =
  | ExportPromptsSuccessResponse
  | DataPortabilityErrorResponse<typeof EXPORT_PROMPTS_MESSAGE>;

export type ImportPromptsResponse =
  | ImportPromptsSuccessResponse
  | DataPortabilityErrorResponse<typeof IMPORT_PROMPTS_MESSAGE>;

export type DataPortabilityResponse =
  | ExportBackupResponse
  | RestoreBackupResponse
  | ExportPromptsResponse
  | ImportPromptsResponse;

export function buildExportBackupRequest(): ExportBackupRequest {
  return {
    type: EXPORT_BACKUP_MESSAGE,
  };
}

export function buildRestoreBackupRequest(
  backup: PromptitBackupFile,
): RestoreBackupRequest {
  return {
    type: RESTORE_BACKUP_MESSAGE,
    backup,
  };
}

export function buildExportPromptsRequest(): ExportPromptsRequest {
  return {
    type: EXPORT_PROMPTS_MESSAGE,
  };
}

export function buildImportPromptsRequest(
  prompts: PromptitSharedPromptsFile,
): ImportPromptsRequest {
  return {
    type: IMPORT_PROMPTS_MESSAGE,
    prompts,
  };
}

export function buildExportBackupSuccessResponse(
  backup: PromptitBackupFile,
): ExportBackupSuccessResponse {
  return {
    type: EXPORT_BACKUP_MESSAGE,
    ok: true,
    status: 'success',
    backup,
  };
}

export function buildRestoreBackupSuccessResponse(
  restoredPromptCount: number,
  languagePreference: LanguagePreference,
  themePreference: ThemePreference,
): RestoreBackupSuccessResponse {
  return {
    type: RESTORE_BACKUP_MESSAGE,
    ok: true,
    status: 'success',
    restoredPromptCount,
    languagePreference,
    themePreference,
  };
}

export function buildExportPromptsSuccessResponse(
  prompts: PromptitSharedPromptsFile,
): ExportPromptsSuccessResponse {
  return {
    type: EXPORT_PROMPTS_MESSAGE,
    ok: true,
    status: 'success',
    prompts,
  };
}

export function buildImportPromptsSuccessResponse(
  importedPromptCount: number,
): ImportPromptsSuccessResponse {
  return {
    type: IMPORT_PROMPTS_MESSAGE,
    ok: true,
    status: 'success',
    importedPromptCount,
  };
}

export function buildDataPortabilityErrorResponse<
  T extends DataPortabilityMessageType,
>(
  type: T,
  message: string,
  code: DataPortabilityErrorCode = 'data-portability-failed',
  messageDescriptor?: RuntimeMessageDescriptor,
): DataPortabilityErrorResponse<T> {
  return {
    type,
    ok: false,
    status: 'error',
    code,
    message,
    messageDescriptor,
  };
}

export function parseDataPortabilityRuntimeRequest(
  value: Record<string, unknown>,
): DataPortabilityRequest | null {
  switch (value.type) {
    case EXPORT_BACKUP_MESSAGE:
      return buildExportBackupRequest();
    case RESTORE_BACKUP_MESSAGE:
      return parseRestoreBackupRequest(value);
    case EXPORT_PROMPTS_MESSAGE:
      return buildExportPromptsRequest();
    case IMPORT_PROMPTS_MESSAGE:
      return parseImportPromptsRequest(value);
    default:
      return null;
  }
}

export function parseDataPortabilityRuntimeResponse(
  value: Record<string, unknown>,
): DataPortabilityResponse | null {
  switch (value.type) {
    case EXPORT_BACKUP_MESSAGE:
      return parseExportBackupResponse(value);
    case RESTORE_BACKUP_MESSAGE:
      return parseRestoreBackupResponse(value);
    case EXPORT_PROMPTS_MESSAGE:
      return parseExportPromptsResponse(value);
    case IMPORT_PROMPTS_MESSAGE:
      return parseImportPromptsResponse(value);
    default:
      return null;
  }
}

function parseRestoreBackupRequest(
  value: Record<string, unknown>,
): RestoreBackupRequest | null {
  const backup = parsePromptitBackupFile(value.backup);

  return backup ? buildRestoreBackupRequest(backup) : null;
}

function parseImportPromptsRequest(
  value: Record<string, unknown>,
): ImportPromptsRequest | null {
  const prompts = parsePromptitSharedPromptsFile(value.prompts);

  return prompts ? buildImportPromptsRequest(prompts) : null;
}

function parseExportBackupResponse(
  value: Record<string, unknown>,
): ExportBackupResponse | null {
  if (value.ok === true && value.status === 'success') {
    const backup = parsePromptitBackupFile(value.backup);
    return backup ? buildExportBackupSuccessResponse(backup) : null;
  }

  return parseDataPortabilityErrorResponse(value, EXPORT_BACKUP_MESSAGE);
}

function parseRestoreBackupResponse(
  value: Record<string, unknown>,
): RestoreBackupResponse | null {
  if (
    value.ok === true &&
    value.status === 'success' &&
    typeof value.restoredPromptCount === 'number' &&
    Number.isInteger(value.restoredPromptCount) &&
    value.restoredPromptCount >= 0 &&
    isLanguagePreference(value.languagePreference) &&
    isThemePreference(value.themePreference)
  ) {
    return buildRestoreBackupSuccessResponse(
      value.restoredPromptCount,
      value.languagePreference,
      value.themePreference,
    );
  }

  return parseDataPortabilityErrorResponse(value, RESTORE_BACKUP_MESSAGE);
}

function parseExportPromptsResponse(
  value: Record<string, unknown>,
): ExportPromptsResponse | null {
  if (value.ok === true && value.status === 'success') {
    const prompts = parsePromptitSharedPromptsFile(value.prompts);
    return prompts ? buildExportPromptsSuccessResponse(prompts) : null;
  }

  return parseDataPortabilityErrorResponse(value, EXPORT_PROMPTS_MESSAGE);
}

function parseImportPromptsResponse(
  value: Record<string, unknown>,
): ImportPromptsResponse | null {
  if (
    value.ok === true &&
    value.status === 'success' &&
    typeof value.importedPromptCount === 'number' &&
    Number.isInteger(value.importedPromptCount) &&
    value.importedPromptCount >= 0
  ) {
    return buildImportPromptsSuccessResponse(value.importedPromptCount);
  }

  return parseDataPortabilityErrorResponse(value, IMPORT_PROMPTS_MESSAGE);
}

function parseDataPortabilityErrorResponse<
  T extends DataPortabilityMessageType,
>(
  value: Record<string, unknown>,
  type: T,
): DataPortabilityErrorResponse<T> | null {
  if (
    value.ok === false &&
    value.status === 'error' &&
    value.code === 'data-portability-failed' &&
    typeof value.message === 'string'
  ) {
    return buildDataPortabilityErrorResponse(
      type,
      value.message,
      value.code,
      parseRuntimeMessageDescriptor(value.messageDescriptor),
    );
  }

  return null;
}
