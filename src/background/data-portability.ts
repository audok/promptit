import {
  PROMPTIT_BACKUP_FILE_TYPE,
  PROMPTIT_SHARED_PROMPTS_FILE_TYPE,
  parsePromptitBackupFileOrThrow,
  parsePromptitSharedPromptsFileOrThrow,
  sharedPromptsToDrafts,
  type PromptitBackupFile,
  type PromptitSharedPromptsFile,
} from '../backup/schema';
import {
  appendPromptDrafts,
  listPromptRecords,
  publishPromptRevision,
  replacePromptRecords,
} from '../prompt/repository';
import {
  EXPORT_BACKUP_MESSAGE,
  EXPORT_PROMPTS_MESSAGE,
  IMPORT_PROMPTS_MESSAGE,
  RESTORE_BACKUP_MESSAGE,
  assertNever,
  buildDataPortabilityErrorResponse,
  buildExportBackupSuccessResponse,
  buildExportPromptsSuccessResponse,
  buildImportPromptsSuccessResponse,
  buildRestoreBackupSuccessResponse,
  type DataPortabilityRequest,
  type DataPortabilityResponse,
  type ExportBackupRequest,
  type ExportBackupResponse,
  type ExportPromptsRequest,
  type ExportPromptsResponse,
  type ImportPromptsRequest,
  type ImportPromptsResponse,
  type RestoreBackupRequest,
  type RestoreBackupResponse,
} from '../runtime/messages';
import {
  readLanguagePreference,
  writeLanguagePreference,
} from '../shared/i18n';
import type { RuntimeMessageDescriptor } from '../shared/i18n';
import {
  readThemePreference,
  writeThemePreference,
} from '../shared/theme';
import { enqueueStorageRequest } from './storage-queue';

const DATA_PORTABILITY_FAILED_MESSAGE =
  '데이터를 백업하거나 가져오는 중 오류가 발생했습니다.';
const DATA_PORTABILITY_ROLLBACK_FAILED_MESSAGE =
  '데이터 변경을 되돌리는 중 오류가 발생했습니다.';
const DATA_PORTABILITY_FAILED_DESCRIPTOR = {
  key: 'runtime.request.failed',
} satisfies RuntimeMessageDescriptor;

class DataPortabilityRollbackFailedError extends Error {
  readonly originalError: unknown;
  readonly rollbackError: unknown;

  constructor(originalError: unknown, rollbackError: unknown) {
    super(DATA_PORTABILITY_ROLLBACK_FAILED_MESSAGE);
    this.name = 'DataPortabilityRollbackFailedError';
    this.originalError = originalError;
    this.rollbackError = rollbackError;
    Object.setPrototypeOf(this, DataPortabilityRollbackFailedError.prototype);
  }
}

export function handleDataPortabilityRequest(
  request: DataPortabilityRequest,
): Promise<DataPortabilityResponse> {
  return enqueueStorageRequest(() => executeDataPortabilityRequest(request));
}

async function executeDataPortabilityRequest(
  request: DataPortabilityRequest,
): Promise<DataPortabilityResponse> {
  try {
    switch (request.type) {
      case EXPORT_BACKUP_MESSAGE:
        return await handleExportBackupRequest(request);
      case RESTORE_BACKUP_MESSAGE:
        return await handleRestoreBackupRequest(request);
      case EXPORT_PROMPTS_MESSAGE:
        return await handleExportPromptsRequest(request);
      case IMPORT_PROMPTS_MESSAGE:
        return await handleImportPromptsRequest(request);
    }
  } catch (error) {
    console.error('[promptit] Data portability request failed.', error);
    const rollbackFailed = error instanceof DataPortabilityRollbackFailedError;

    return buildDataPortabilityErrorResponse(
      request.type,
      getErrorMessage(
        error,
        rollbackFailed
          ? DATA_PORTABILITY_ROLLBACK_FAILED_MESSAGE
          : DATA_PORTABILITY_FAILED_MESSAGE,
      ),
      rollbackFailed
        ? 'data-portability-rollback-failed'
        : 'data-portability-failed',
      DATA_PORTABILITY_FAILED_DESCRIPTOR,
    );
  }

  return assertNever(request);
}

async function handleExportBackupRequest(
  _request: ExportBackupRequest,
): Promise<ExportBackupResponse> {
  const backup: PromptitBackupFile = {
    type: PROMPTIT_BACKUP_FILE_TYPE,
    appVersion: getAppVersion(),
    exportedAt: new Date().toISOString(),
    data: {
      prompts: await listPromptRecords(),
      settings: {
        languagePreference: await readLanguagePreference(),
        themePreference: await readThemePreference(),
      },
    },
  };

  return buildExportBackupSuccessResponse(backup);
}

async function handleRestoreBackupRequest(
  request: RestoreBackupRequest,
): Promise<RestoreBackupResponse> {
  const backup = parsePromptitBackupFileOrThrow(request.backup);
  const previousPrompts = await listPromptRecords();
  const previousLanguagePreference = await readLanguagePreference();
  const previousThemePreference = await readThemePreference();

  try {
    await replacePromptRecords(backup.data.prompts);
    await writeLanguagePreference(backup.data.settings.languagePreference);
    await writeThemePreference(backup.data.settings.themePreference);
    await publishPromptRevision({ reason: 'records-replaced' });
  } catch (error) {
    await rollbackRestoreSnapshot(
      previousPrompts,
      previousLanguagePreference,
      previousThemePreference,
      error,
    );

    throw error;
  }

  return buildRestoreBackupSuccessResponse(
    backup.data.prompts.length,
    backup.data.settings.languagePreference,
    backup.data.settings.themePreference,
  );
}

async function handleExportPromptsRequest(
  _request: ExportPromptsRequest,
): Promise<ExportPromptsResponse> {
  const records = await listPromptRecords();
  const prompts: PromptitSharedPromptsFile = {
    type: PROMPTIT_SHARED_PROMPTS_FILE_TYPE,
    appVersion: getAppVersion(),
    exportedAt: new Date().toISOString(),
    data: {
      prompts: records.map((record) => ({
        title: record.title,
        content: record.content,
      })),
    },
  };

  return buildExportPromptsSuccessResponse(prompts);
}

async function handleImportPromptsRequest(
  request: ImportPromptsRequest,
): Promise<ImportPromptsResponse> {
  const prompts = parsePromptitSharedPromptsFileOrThrow(request.prompts);
  const previousPrompts = await listPromptRecords();
  let promptsWereAppended = false;

  try {
    const createdRecords = await appendPromptDrafts(
      sharedPromptsToDrafts(prompts.data.prompts),
    );
    promptsWereAppended = createdRecords.length > 0;
    await publishPromptRevision();

    return buildImportPromptsSuccessResponse(createdRecords.length);
  } catch (error) {
    if (promptsWereAppended) {
      await rollbackImportedPrompts(previousPrompts, error);
    }

    throw error;
  }
}

async function rollbackRestoreSnapshot(
  prompts: Awaited<ReturnType<typeof listPromptRecords>>,
  languagePreference: Awaited<ReturnType<typeof readLanguagePreference>>,
  themePreference: Awaited<ReturnType<typeof readThemePreference>>,
  originalError: unknown,
): Promise<void> {
  try {
    await replacePromptRecords(prompts);
    await writeLanguagePreference(languagePreference);
    await writeThemePreference(themePreference);
    await publishPromptRevision({ reason: 'records-replaced' });
  } catch (rollbackError) {
    console.error(
      '[promptit] Failed to roll back restore after data portability failure.',
      {
        originalError,
        rollbackError,
      },
    );
    throw new DataPortabilityRollbackFailedError(
      originalError,
      rollbackError,
    );
  }
}

async function rollbackImportedPrompts(
  prompts: Awaited<ReturnType<typeof listPromptRecords>>,
  originalError: unknown,
): Promise<void> {
  try {
    await replacePromptRecords(prompts);
    await publishPromptRevision();
  } catch (rollbackError) {
    console.error(
      '[promptit] Failed to roll back imported prompts after revision failure.',
      {
        originalError,
        rollbackError,
      },
    );
    throw new DataPortabilityRollbackFailedError(
      originalError,
      rollbackError,
    );
  }
}

function getAppVersion(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.getManifest
    ? chrome.runtime.getManifest().version
    : '0.0.0';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
