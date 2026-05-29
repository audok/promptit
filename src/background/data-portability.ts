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
import { enqueueStorageRequest } from './storage-queue';

const DATA_PORTABILITY_FAILED_MESSAGE =
  '데이터를 백업하거나 가져오는 중 오류가 발생했습니다.';
const DATA_PORTABILITY_FAILED_DESCRIPTOR = {
  key: 'runtime.request.failed',
} satisfies RuntimeMessageDescriptor;

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
    return buildDataPortabilityErrorResponse(
      request.type,
      getErrorMessage(error, DATA_PORTABILITY_FAILED_MESSAGE),
      'data-portability-failed',
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
  let promptsWereReplaced = false;

  try {
    await replacePromptRecords(backup.data.prompts);
    promptsWereReplaced = true;
    await writeLanguagePreference(backup.data.settings.languagePreference);
    await publishPromptRevision({ reason: 'records-replaced' });
  } catch (error) {
    if (promptsWereReplaced) {
      await rollbackRestoreSnapshot(
        previousPrompts,
        previousLanguagePreference,
        error,
      );
    }

    throw error;
  }

  return buildRestoreBackupSuccessResponse(
    backup.data.prompts.length,
    backup.data.settings.languagePreference,
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
  originalError: unknown,
): Promise<void> {
  try {
    await replacePromptRecords(prompts);
    await writeLanguagePreference(languagePreference);
    await publishPromptRevision({ reason: 'records-replaced' });
  } catch (rollbackError) {
    console.error(
      '[promptit] Failed to roll back restore after data portability failure.',
      {
        originalError,
        rollbackError,
      },
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
