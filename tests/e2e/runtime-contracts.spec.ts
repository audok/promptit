import { expect, test } from '@playwright/test';

import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  EXPORT_BACKUP_MESSAGE,
  EXPORT_PROMPTS_MESSAGE,
  GET_PROMPT_BODY_MESSAGE,
  GET_PROMPT_RECORD_MESSAGE,
  IMPORT_PROMPTS_MESSAGE,
  LIST_PROMPT_METAS_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  OPEN_OPTIONS_PAGE_MESSAGE,
  RESTORE_BACKUP_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  UPDATE_PROMPT_RECORD_MESSAGE,
  buildCreatePromptRequest,
  buildCreatePromptSuccessResponse,
  buildDataPortabilityErrorResponse,
  buildDeletePromptRequest,
  buildDeletePromptSuccessResponse,
  buildExportBackupRequest,
  buildExportBackupSuccessResponse,
  buildExportPromptsRequest,
  buildExportPromptsSuccessResponse,
  buildGetPromptBodyRequest,
  buildGetPromptBodySuccessResponse,
  buildGetPromptRecordRequest,
  buildGetPromptRecordSuccessResponse,
  buildImportPromptsRequest,
  buildImportPromptsSuccessResponse,
  buildListPromptMetasRequest,
  buildListPromptMetasSuccessResponse,
  buildMovePromptRequest,
  buildOpenOptionsPageErrorResponse,
  buildOpenOptionsPageRequest,
  buildOpenOptionsPageSuccessResponse,
  buildPromptErrorResponse,
  buildPromptMetaConflictResponse,
  buildPromptMetaSuccessResponse,
  buildPromptNotFoundResponse,
  buildPromptRecordConflictResponse,
  buildRestoreBackupRequest,
  buildRestoreBackupSuccessResponse,
  buildSetPromptPinnedRequest,
  buildUpdatePromptBodyRequest,
  buildUpdatePromptBodySuccessResponse,
  buildUpdatePromptMetaRequest,
  buildUpdatePromptRecordRequest,
  buildUpdatePromptRecordSuccessResponse,
  parsePromptitRuntimeRequest,
  parsePromptitRuntimeResponse,
  type DeletePromptResponse,
  type MovePromptResponse,
  type SetPromptPinnedResponse,
  type UpdatePromptBodyResponse,
  type UpdatePromptMetaResponse,
  type UpdatePromptRecordResponse,
} from '../../src/runtime/messages';
import {
  type PromptBody,
  type PromptMeta,
  type PromptRecord,
} from '../../src/prompt/schema';
import { getContentRuntimeResponseToastMessage } from '../../src/content/runtimeFeedback';
import {
  PROMPTIT_BACKUP_FILE_TYPE,
  PROMPTIT_SHARED_PROMPTS_FILE_TYPE,
  type PromptitBackupFile,
  type PromptitSharedPromptsFile,
} from '../../src/backup/schema';
import {
  createPromptBody,
  createPromptMeta,
  createPromptRecord,
} from '../playwright/promptit';

const timestamp = '2026-05-31T00:00:00.000Z';
const prompt = createPromptRecord({
  id: 'runtime-contract-prompt',
  title: 'Runtime contract',
  content: 'Runtime contract body',
  normalOrder: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  bodyUpdatedAt: timestamp,
});
const meta = createPromptMeta({
  id: prompt.id,
  title: prompt.title,
  content: prompt.content,
  normalOrder: prompt.normalOrder,
  createdAt: prompt.createdAt,
  updatedAt: prompt.updatedAt,
  bodyUpdatedAt: prompt.bodyUpdatedAt,
});
const body = createPromptBody({
  id: prompt.id,
  content: prompt.content,
  updatedAt: prompt.bodyUpdatedAt,
});
const draft = {
  title: 'Draft title',
  content: 'Draft content',
  pinned: false,
};
const metaDraft = {
  title: 'Updated title',
  normalOrder: 2,
  pinnedOrder: null,
};
const descriptor = {
  key: 'runtime.prompt.readFailed' as const,
};
const backup: PromptitBackupFile = {
  type: PROMPTIT_BACKUP_FILE_TYPE,
  appVersion: '0.9.0',
  exportedAt: timestamp,
  data: {
    prompts: [prompt],
    settings: {
      languagePreference: 'ko',
      themePreference: 'dark',
    },
  },
};
const sharedPrompts: PromptitSharedPromptsFile = {
  type: PROMPTIT_SHARED_PROMPTS_FILE_TYPE,
  appVersion: '0.9.0',
  exportedAt: timestamp,
  data: {
    prompts: [
      {
        title: 'Shared prompt',
        content: 'Shared prompt body',
      },
    ],
  },
};

type MetaOnlyConflictResponse =
  | UpdatePromptMetaResponse
  | DeletePromptResponse
  | MovePromptResponse
  | SetPromptPinnedResponse;

type RecordConflictResponse =
  | UpdatePromptBodyResponse
  | UpdatePromptRecordResponse;

function expectMetaOnlyConflictContract(
  response: MetaOnlyConflictResponse,
): void {
  if (!response.ok && response.status === 'conflict') {
    expect(response.currentMeta.id).toBe(prompt.id);
    // @ts-expect-error Meta-only conflict responses must not expose records.
    expect(response.currentRecord).toBeUndefined();
  }
}

function expectRecordConflictContract(response: RecordConflictResponse): void {
  if (!response.ok && response.status === 'conflict') {
    expect(response.currentMeta.id).toBe(prompt.id);
    expect(response.currentRecord?.id).toBe(prompt.id);
  }
}

test('runtime contract parses every valid request builder output', () => {
  const requests = [
    buildOpenOptionsPageRequest(),
    buildListPromptMetasRequest(),
    buildGetPromptBodyRequest(prompt.id),
    buildGetPromptRecordRequest(prompt.id),
    buildCreatePromptRequest(draft),
    buildUpdatePromptMetaRequest(prompt.id, metaDraft, timestamp),
    buildUpdatePromptBodyRequest(
      prompt.id,
      'Updated content',
      timestamp,
      timestamp,
    ),
    buildUpdatePromptRecordRequest(prompt.id, draft, timestamp, timestamp),
    buildDeletePromptRequest(prompt.id, timestamp, timestamp),
    buildMovePromptRequest(prompt.id, {
      expectedUpdatedAt: timestamp,
      group: 'normal',
      previousId: null,
      nextId: 'next-prompt',
    }),
    buildSetPromptPinnedRequest(prompt.id, true, timestamp),
    buildExportBackupRequest(),
    buildRestoreBackupRequest(backup),
    buildExportPromptsRequest(),
    buildImportPromptsRequest(sharedPrompts),
  ];

  for (const request of requests) {
    expect(parsePromptitRuntimeRequest(request)).toEqual(request);
  }
});

test('runtime contract rejects malformed requests for every message family', () => {
  const malformedRequests = [
    { type: 'promptit/unknown' },
    { type: GET_PROMPT_BODY_MESSAGE },
    { type: GET_PROMPT_RECORD_MESSAGE, id: '' },
    { type: CREATE_PROMPT_MESSAGE, draft: { title: 'Missing content' } },
    {
      type: CREATE_PROMPT_MESSAGE,
      draft: { title: 'Invalid order', content: 'Body', normalOrder: -1 },
    },
    {
      type: UPDATE_PROMPT_META_MESSAGE,
      id: prompt.id,
      draft: { title: 'Invalid order', normalOrder: Number.NaN },
      expectedUpdatedAt: timestamp,
    },
    {
      type: UPDATE_PROMPT_BODY_MESSAGE,
      id: prompt.id,
      content: 42,
      expectedUpdatedAt: timestamp,
      expectedBodyUpdatedAt: timestamp,
    },
    {
      type: UPDATE_PROMPT_RECORD_MESSAGE,
      id: prompt.id,
      draft,
      expectedUpdatedAt: 'not-a-date',
      expectedBodyUpdatedAt: timestamp,
    },
    { type: DELETE_PROMPT_MESSAGE, id: prompt.id, expectedUpdatedAt: null },
    {
      type: MOVE_PROMPT_MESSAGE,
      id: prompt.id,
      expectedUpdatedAt: timestamp,
      previousId: 1,
      nextId: null,
    },
    {
      type: SET_PROMPT_PINNED_MESSAGE,
      id: prompt.id,
      pinned: 'yes',
      expectedUpdatedAt: timestamp,
    },
    { type: RESTORE_BACKUP_MESSAGE, backup: { ...backup, exportedAt: 'bad' } },
    { type: IMPORT_PROMPTS_MESSAGE, prompts: { ...sharedPrompts, data: {} } },
  ];

  for (const request of malformedRequests) {
    expect(parsePromptitRuntimeRequest(request)).toBeNull();
  }
});

test('runtime contract parses every valid response builder output', () => {
  const responses = [
    buildOpenOptionsPageSuccessResponse(),
    buildOpenOptionsPageErrorResponse('Open failed', 'open-options-failed', {
      key: 'runtime.openOptions.failed',
    }),
    buildListPromptMetasSuccessResponse([meta]),
    buildGetPromptBodySuccessResponse(body),
    buildGetPromptRecordSuccessResponse(prompt),
    buildCreatePromptSuccessResponse(prompt),
    buildPromptMetaSuccessResponse(UPDATE_PROMPT_META_MESSAGE, meta),
    buildUpdatePromptBodySuccessResponse(prompt),
    buildUpdatePromptRecordSuccessResponse(prompt),
    buildDeletePromptSuccessResponse(prompt.id),
    buildPromptNotFoundResponse(
      GET_PROMPT_BODY_MESSAGE,
      prompt.id,
      'Not found',
      descriptor,
    ),
    buildPromptMetaConflictResponse(
      UPDATE_PROMPT_META_MESSAGE,
      prompt.id,
      meta,
      'Conflict',
      descriptor,
    ),
    buildPromptRecordConflictResponse(
      UPDATE_PROMPT_BODY_MESSAGE,
      prompt.id,
      meta,
      'Conflict',
      undefined,
      descriptor,
    ),
    buildPromptRecordConflictResponse(
      UPDATE_PROMPT_RECORD_MESSAGE,
      prompt.id,
      meta,
      'Conflict',
      prompt,
      descriptor,
    ),
    buildPromptErrorResponse(
      LIST_PROMPT_METAS_MESSAGE,
      'Storage failed',
      'storage-failed',
      descriptor,
    ),
    buildExportBackupSuccessResponse(backup),
    buildRestoreBackupSuccessResponse(1, 'ko', 'dark'),
    buildExportPromptsSuccessResponse(sharedPrompts),
    buildImportPromptsSuccessResponse(1),
    buildDataPortabilityErrorResponse(
      EXPORT_PROMPTS_MESSAGE,
      'Export failed',
      'data-portability-failed',
      { key: 'options.toast.promptsShareFailed' },
    ),
  ];

  for (const response of responses) {
    expect(parsePromptitRuntimeResponse(response)).toEqual(response);
  }
});

test('prompt conflict response types match record availability by message family', () => {
  const metaConflict = buildPromptMetaConflictResponse(
    DELETE_PROMPT_MESSAGE,
    prompt.id,
    meta,
    'Conflict',
    descriptor,
  );
  const recordConflict = buildPromptRecordConflictResponse(
    UPDATE_PROMPT_RECORD_MESSAGE,
    prompt.id,
    meta,
    'Conflict',
    prompt,
    descriptor,
  );

  expectMetaOnlyConflictContract(metaConflict);
  expectRecordConflictContract(recordConflict);
});

test('runtime contract rejects malformed response payloads', () => {
  const invalidMeta: PromptMeta = {
    ...meta,
    createdAt: 'not-a-date',
  };
  const invalidBody: PromptBody = {
    ...body,
    updatedAt: 'not-a-date',
  };
  const invalidPrompt: PromptRecord = {
    ...prompt,
    title: '',
  };
  const malformedResponses = [
    { type: OPEN_OPTIONS_PAGE_MESSAGE, ok: false, code: 'wrong', message: 'x' },
    {
      type: LIST_PROMPT_METAS_MESSAGE,
      ok: true,
      status: 'success',
      metas: [invalidMeta],
    },
    {
      type: GET_PROMPT_BODY_MESSAGE,
      ok: true,
      status: 'success',
      body: invalidBody,
    },
    {
      type: GET_PROMPT_RECORD_MESSAGE,
      ok: true,
      status: 'success',
      prompt: invalidPrompt,
    },
    { type: CREATE_PROMPT_MESSAGE, ok: true, status: 'error', prompt },
    {
      type: UPDATE_PROMPT_META_MESSAGE,
      ok: false,
      status: 'conflict',
      id: prompt.id,
      message: 'Conflict',
      currentMeta: invalidMeta,
    },
    {
      type: UPDATE_PROMPT_META_MESSAGE,
      ok: false,
      status: 'conflict',
      id: prompt.id,
      message: 'Conflict',
      currentMeta: meta,
      currentRecord: prompt,
    },
    {
      type: UPDATE_PROMPT_RECORD_MESSAGE,
      ok: false,
      status: 'conflict',
      id: prompt.id,
      message: 'Conflict',
      currentMeta: meta,
      currentRecord: invalidPrompt,
    },
    {
      type: DELETE_PROMPT_MESSAGE,
      ok: true,
      status: 'success',
      id: '',
    },
    {
      type: LIST_PROMPT_METAS_MESSAGE,
      ok: false,
      status: 'error',
      code: 'wrong-code',
      message: 'Storage failed',
    },
    {
      type: EXPORT_BACKUP_MESSAGE,
      ok: true,
      status: 'success',
      backup: { ...backup, data: { prompts: [], settings: {} } },
    },
    {
      type: RESTORE_BACKUP_MESSAGE,
      ok: true,
      status: 'success',
      restoredPromptCount: -1,
      languagePreference: 'ko',
      themePreference: 'dark',
    },
    {
      type: IMPORT_PROMPTS_MESSAGE,
      ok: false,
      status: 'error',
      code: 'wrong-code',
      message: 'Import failed',
    },
  ];

  for (const response of malformedResponses) {
    expect(parsePromptitRuntimeResponse(response)).toBeNull();
  }
});

test('runtime feedback translates descriptor-backed failures by locale', () => {
  const fallback = 'fallback message';

  expect(
    getContentRuntimeResponseToastMessage(
      'en',
      { key: 'content.toast.promptBodyReadFailed' },
      fallback,
      'content.toast.insertFailed',
    ),
  ).toBe('Could not read the prompt body.');
  expect(
    getContentRuntimeResponseToastMessage(
      'ko',
      { key: 'content.toast.promptBodyReadFailed' },
      fallback,
      'content.toast.insertFailed',
    ),
  ).toBe('프롬프트 본문을 읽지 못했습니다.');
  expect(
    getContentRuntimeResponseToastMessage(
      'en',
      undefined,
      '',
      'content.toast.insertFailed',
    ),
  ).toBe('Could not insert the prompt.');
});
