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
  PROMPT_BODY_MAX_BYTES,
  type PromptBody,
  type PromptMeta,
  type PromptRecord,
} from '../../src/prompt/schema';
import { getContentRuntimeResponseToastMessage } from '../../src/content/runtimeFeedback';
import {
  PROMPTIT_PORTABILITY_MAX_FILE_BYTES,
  PROMPTIT_PORTABILITY_MAX_PROMPTS,
  PROMPTIT_PORTABILITY_UI_MAX_FILE_BYTES,
  PROMPTIT_BACKUP_FILE_TYPE,
  PROMPTIT_SHARED_PROMPTS_FILE_TYPE,
  isPromptitPortabilityFileSizeAllowed,
  isPromptitPortabilityUiFileSizeAllowed,
  isPromptitPortabilityPromptCountAllowed,
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

const literalTimestamp = '2026-06-01T00:00:00.000Z';
const literalPromptContent = 'Literal body';
const literalPromptMeta = {
  id: 'literal-runtime-contract-prompt',
  title: 'Literal contract',
  pinned: false,
  normalOrder: 10,
  pinnedOrder: null,
  createdAt: literalTimestamp,
  updatedAt: literalTimestamp,
  bodyUpdatedAt: literalTimestamp,
  charCount: 12,
} satisfies PromptMeta;
const literalPromptBody = {
  id: literalPromptMeta.id,
  content: literalPromptContent,
  updatedAt: literalPromptMeta.bodyUpdatedAt,
} satisfies PromptBody;
const literalPromptRecord = {
  ...literalPromptMeta,
  content: literalPromptContent,
} satisfies PromptRecord;
const literalPromptDraft = {
  title: 'Literal draft',
  content: 'Literal draft body',
  pinned: false,
  normalOrder: 11,
  pinnedOrder: null,
};
const literalPromptMetaDraft = {
  title: 'Literal meta draft',
  normalOrder: 12,
  pinnedOrder: null,
};
const literalUpdateConflictDescriptor = {
  key: 'runtime.prompt.updateConflict',
};
const literalPromptMutationSideEffects = {
  promptRevisionPublished: true,
};
const literalBackup = {
  type: 'promptit.backup',
  appVersion: '0.9.0',
  exportedAt: literalTimestamp,
  data: {
    prompts: [literalPromptRecord],
    settings: {
      languagePreference: 'en',
      themePreference: 'light',
    },
  },
} satisfies PromptitBackupFile;
const literalSharedPrompts = {
  type: 'promptit.prompts',
  appVersion: '0.9.0',
  exportedAt: literalTimestamp,
  data: {
    prompts: [
      {
        title: 'Literal shared prompt',
        content: 'Literal shared body',
      },
    ],
  },
} satisfies PromptitSharedPromptsFile;

const PROMPT_META_KEYS = [
  'id',
  'title',
  'pinned',
  'normalOrder',
  'pinnedOrder',
  'createdAt',
  'updatedAt',
  'bodyUpdatedAt',
  'charCount',
];
const PROMPT_BODY_KEYS = ['id', 'content', 'updatedAt'];
const PROMPT_RECORD_KEYS = [...PROMPT_META_KEYS, 'content'];
const PROMPT_DRAFT_KEYS = [
  'title',
  'content',
  'pinned',
  'normalOrder',
  'pinnedOrder',
];
const PROMPT_META_DRAFT_KEYS = ['title', 'normalOrder', 'pinnedOrder'];
const BACKUP_KEYS = ['type', 'appVersion', 'exportedAt', 'data'];
const BACKUP_DATA_KEYS = ['prompts', 'settings'];
const BACKUP_SETTINGS_KEYS = ['languagePreference', 'themePreference'];
const SHARED_PROMPTS_KEYS = ['type', 'appVersion', 'exportedAt', 'data'];
const SHARED_PROMPTS_DATA_KEYS = ['prompts'];
const SHARED_PROMPT_KEYS = ['title', 'content'];
const MESSAGE_DESCRIPTOR_KEYS = ['key'];
const PROMPT_MUTATION_SIDE_EFFECT_KEYS = ['promptRevisionPublished'];

type MetaOnlyConflictResponse =
  | UpdatePromptMetaResponse
  | DeletePromptResponse
  | MovePromptResponse
  | SetPromptPinnedResponse;

type RecordConflictResponse =
  | UpdatePromptBodyResponse
  | UpdatePromptRecordResponse;

type LiteralContractFixture = {
  name: string;
  value: Record<string, unknown>;
  keys: string[];
  nested?: Array<{
    value: Record<string, unknown>;
    keys: string[];
  }>;
};

function expectExactSortedKeys(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  expect(value).toEqual(expect.any(Object));
  expect(Object.keys(value as Record<string, unknown>).sort()).toEqual(
    [...keys].sort(),
  );
}

function expectLiteralFixtureKeys(fixture: LiteralContractFixture): void {
  expectExactSortedKeys(fixture.value, fixture.keys);

  for (const nested of fixture.nested ?? []) {
    expectExactSortedKeys(nested.value, nested.keys);
  }
}

function expectMetaOnlyConflictContract(
  response: MetaOnlyConflictResponse,
): void {
  expect(response.ok).toBe(false);
  expect(response.status).toBe('conflict');

  if (response.ok || response.status !== 'conflict') {
    return;
  }

  expect(response.currentMeta.id).toBe(prompt.id);
  // @ts-expect-error Meta-only conflict responses must not expose records.
  expect(response.currentRecord).toBeUndefined();
}

function expectRecordConflictContract(response: RecordConflictResponse): void {
  expect(response.ok).toBe(false);
  expect(response.status).toBe('conflict');

  if (response.ok || response.status !== 'conflict') {
    return;
  }

  expect(response.currentMeta.id).toBe(prompt.id);
  expect(response.currentRecord?.id).toBe(prompt.id);
}

test('runtime contract parses literal request wire fixtures with exact required keys', () => {
  const requestFixtures: LiteralContractFixture[] = [
    {
      name: 'open options page',
      value: { type: 'promptit/open-options-page' },
      keys: ['type'],
    },
    {
      name: 'list metas',
      value: { type: 'promptit/list-prompt-metas' },
      keys: ['type'],
    },
    {
      name: 'get body',
      value: { type: 'promptit/get-prompt-body', id: literalPromptMeta.id },
      keys: ['type', 'id'],
    },
    {
      name: 'get record',
      value: { type: 'promptit/get-prompt-record', id: literalPromptMeta.id },
      keys: ['type', 'id'],
    },
    {
      name: 'create',
      value: {
        type: 'promptit/create-prompt',
        draft: literalPromptDraft,
      },
      keys: ['type', 'draft'],
      nested: [{ value: literalPromptDraft, keys: PROMPT_DRAFT_KEYS }],
    },
    {
      name: 'update meta',
      value: {
        type: 'promptit/update-prompt-meta',
        id: literalPromptMeta.id,
        draft: literalPromptMetaDraft,
        expectedUpdatedAt: literalTimestamp,
      },
      keys: ['type', 'id', 'draft', 'expectedUpdatedAt'],
      nested: [
        { value: literalPromptMetaDraft, keys: PROMPT_META_DRAFT_KEYS },
      ],
    },
    {
      name: 'update body',
      value: {
        type: 'promptit/update-prompt-body',
        id: literalPromptMeta.id,
        content: 'Updated literal body',
        expectedUpdatedAt: literalTimestamp,
        expectedBodyUpdatedAt: literalTimestamp,
      },
      keys: [
        'type',
        'id',
        'content',
        'expectedUpdatedAt',
        'expectedBodyUpdatedAt',
      ],
    },
    {
      name: 'update record',
      value: {
        type: 'promptit/update-prompt-record',
        id: literalPromptMeta.id,
        draft: literalPromptDraft,
        expectedUpdatedAt: literalTimestamp,
        expectedBodyUpdatedAt: literalTimestamp,
      },
      keys: [
        'type',
        'id',
        'draft',
        'expectedUpdatedAt',
        'expectedBodyUpdatedAt',
      ],
      nested: [{ value: literalPromptDraft, keys: PROMPT_DRAFT_KEYS }],
    },
    {
      name: 'delete',
      value: {
        type: 'promptit/delete-prompt',
        id: literalPromptMeta.id,
        expectedUpdatedAt: literalTimestamp,
        expectedBodyUpdatedAt: literalTimestamp,
      },
      keys: ['type', 'id', 'expectedUpdatedAt', 'expectedBodyUpdatedAt'],
    },
    {
      name: 'move',
      value: {
        type: 'promptit/move-prompt',
        id: literalPromptMeta.id,
        group: 'normal',
        previousId: null,
        nextId: 'literal-next-prompt',
        expectedUpdatedAt: literalTimestamp,
      },
      keys: [
        'type',
        'id',
        'group',
        'previousId',
        'nextId',
        'expectedUpdatedAt',
      ],
    },
    {
      name: 'set pinned',
      value: {
        type: 'promptit/set-prompt-pinned',
        id: literalPromptMeta.id,
        pinned: true,
        expectedUpdatedAt: literalTimestamp,
      },
      keys: ['type', 'id', 'pinned', 'expectedUpdatedAt'],
    },
    {
      name: 'export backup',
      value: { type: 'promptit/export-backup' },
      keys: ['type'],
    },
    {
      name: 'restore backup',
      value: {
        type: 'promptit/restore-backup',
        backup: literalBackup,
      },
      keys: ['type', 'backup'],
      nested: [
        { value: literalBackup, keys: BACKUP_KEYS },
        { value: literalBackup.data, keys: BACKUP_DATA_KEYS },
        { value: literalBackup.data.settings, keys: BACKUP_SETTINGS_KEYS },
        { value: literalBackup.data.prompts[0], keys: PROMPT_RECORD_KEYS },
      ],
    },
    {
      name: 'export prompts',
      value: { type: 'promptit/export-prompts' },
      keys: ['type'],
    },
    {
      name: 'import prompts',
      value: {
        type: 'promptit/import-prompts',
        prompts: literalSharedPrompts,
      },
      keys: ['type', 'prompts'],
      nested: [
        { value: literalSharedPrompts, keys: SHARED_PROMPTS_KEYS },
        { value: literalSharedPrompts.data, keys: SHARED_PROMPTS_DATA_KEYS },
        {
          value: literalSharedPrompts.data.prompts[0],
          keys: SHARED_PROMPT_KEYS,
        },
      ],
    },
  ];

  for (const fixture of requestFixtures) {
    expectLiteralFixtureKeys(fixture);
    const parsed = parsePromptitRuntimeRequest(fixture.value);

    expect(parsed, fixture.name).toEqual(fixture.value);
    expectExactSortedKeys(parsed, fixture.keys);
  }
});

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
  const oversizedPromptContent = 'a'.repeat(PROMPT_BODY_MAX_BYTES + 1);
  const tooManyPromptRecords = Array.from(
    { length: PROMPTIT_PORTABILITY_MAX_PROMPTS + 1 },
    (_, index) =>
      createPromptRecord({
        id: `over-limit-runtime-backup-${index}`,
        title: `Runtime backup ${index}`,
        content: 'Backup body',
        normalOrder: index + 1,
      }),
  );
  const tooManySharedPrompts = Array.from(
    { length: PROMPTIT_PORTABILITY_MAX_PROMPTS + 1 },
    (_, index) => ({
      title: `Runtime shared ${index}`,
      content: 'Shared body',
    }),
  );
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
    {
      type: RESTORE_BACKUP_MESSAGE,
      backup: {
        ...backup,
        data: {
          ...backup.data,
          prompts: [
            {
              ...prompt,
              content: oversizedPromptContent,
              charCount: oversizedPromptContent.length,
            },
          ],
        },
      },
    },
    {
      type: RESTORE_BACKUP_MESSAGE,
      backup: {
        ...backup,
        data: {
          ...backup.data,
          prompts: tooManyPromptRecords,
        },
      },
    },
    { type: IMPORT_PROMPTS_MESSAGE, prompts: { ...sharedPrompts, data: {} } },
    {
      type: IMPORT_PROMPTS_MESSAGE,
      prompts: {
        ...sharedPrompts,
        data: {
          prompts: [
            {
              title: 'Oversized shared prompt',
              content: oversizedPromptContent,
            },
          ],
        },
      },
    },
    {
      type: IMPORT_PROMPTS_MESSAGE,
      prompts: {
        ...sharedPrompts,
        data: {
          prompts: tooManySharedPrompts,
        },
      },
    },
  ];

  for (const request of malformedRequests) {
    expect(parsePromptitRuntimeRequest(request)).toBeNull();
  }
});

test('portability limit helpers reject over-limit counts and sizes', () => {
  const exactLimitContent = 'a'.repeat(PROMPT_BODY_MAX_BYTES);
  const exactLimitImportRequest = buildImportPromptsRequest({
    ...sharedPrompts,
    data: {
      prompts: [
        {
          title: 'Exact limit shared prompt',
          content: exactLimitContent,
        },
      ],
    },
  });

  expect(parsePromptitRuntimeRequest(exactLimitImportRequest)).toEqual(
    exactLimitImportRequest,
  );
  expect(isPromptitPortabilityFileSizeAllowed({
    size: PROMPTIT_PORTABILITY_MAX_FILE_BYTES,
  })).toBe(true);
  expect(isPromptitPortabilityFileSizeAllowed({
    size: PROMPTIT_PORTABILITY_MAX_FILE_BYTES + 1,
  })).toBe(false);
  expect(isPromptitPortabilityUiFileSizeAllowed({
    size: PROMPTIT_PORTABILITY_UI_MAX_FILE_BYTES,
  })).toBe(true);
  expect(isPromptitPortabilityUiFileSizeAllowed({
    size: PROMPTIT_PORTABILITY_UI_MAX_FILE_BYTES + 1,
  })).toBe(false);
  expect(isPromptitPortabilityPromptCountAllowed(
    PROMPTIT_PORTABILITY_MAX_PROMPTS,
  )).toBe(true);
  expect(isPromptitPortabilityPromptCountAllowed(
    PROMPTIT_PORTABILITY_MAX_PROMPTS + 1,
  )).toBe(false);
});

test('runtime contract rejects literal requests with omitted required keys', () => {
  const malformedRequests = [
    { name: 'open options page missing type', value: {} },
    { name: 'list metas missing type', value: {} },
    { name: 'get body missing id', value: { type: 'promptit/get-prompt-body' } },
    {
      name: 'get record missing id',
      value: { type: 'promptit/get-prompt-record' },
    },
    {
      name: 'create missing draft',
      value: { type: 'promptit/create-prompt' },
    },
    {
      name: 'update meta missing draft',
      value: {
        type: 'promptit/update-prompt-meta',
        id: literalPromptMeta.id,
        expectedUpdatedAt: literalTimestamp,
      },
    },
    {
      name: 'update body missing expectedBodyUpdatedAt',
      value: {
        type: 'promptit/update-prompt-body',
        id: literalPromptMeta.id,
        content: 'Updated literal body',
        expectedUpdatedAt: literalTimestamp,
      },
    },
    {
      name: 'update record missing expectedBodyUpdatedAt',
      value: {
        type: 'promptit/update-prompt-record',
        id: literalPromptMeta.id,
        draft: literalPromptDraft,
        expectedUpdatedAt: literalTimestamp,
      },
    },
    {
      name: 'delete missing expectedUpdatedAt',
      value: {
        type: 'promptit/delete-prompt',
        id: literalPromptMeta.id,
        expectedBodyUpdatedAt: literalTimestamp,
      },
    },
    {
      name: 'move missing previousId',
      value: {
        type: 'promptit/move-prompt',
        id: literalPromptMeta.id,
        group: 'normal',
        nextId: 'literal-next-prompt',
        expectedUpdatedAt: literalTimestamp,
      },
    },
    {
      name: 'set pinned missing pinned',
      value: {
        type: 'promptit/set-prompt-pinned',
        id: literalPromptMeta.id,
        expectedUpdatedAt: literalTimestamp,
      },
    },
    { name: 'export backup missing type', value: {} },
    {
      name: 'restore backup missing backup',
      value: { type: 'promptit/restore-backup' },
    },
    { name: 'export prompts missing type', value: {} },
    {
      name: 'import prompts missing prompts',
      value: { type: 'promptit/import-prompts' },
    },
  ];

  for (const { name, value } of malformedRequests) {
    expect(parsePromptitRuntimeRequest(value), name).toBeNull();
  }
});

test('runtime contract parses literal response wire fixtures with exact required keys', () => {
  const responseFixtures: LiteralContractFixture[] = [
    {
      name: 'open options page success',
      value: { type: 'promptit/open-options-page', ok: true },
      keys: ['type', 'ok'],
    },
    {
      name: 'list metas success',
      value: {
        type: 'promptit/list-prompt-metas',
        ok: true,
        status: 'success',
        metas: [literalPromptMeta],
      },
      keys: ['type', 'ok', 'status', 'metas'],
      nested: [{ value: literalPromptMeta, keys: PROMPT_META_KEYS }],
    },
    {
      name: 'get body success',
      value: {
        type: 'promptit/get-prompt-body',
        ok: true,
        status: 'success',
        body: literalPromptBody,
      },
      keys: ['type', 'ok', 'status', 'body'],
      nested: [{ value: literalPromptBody, keys: PROMPT_BODY_KEYS }],
    },
    {
      name: 'get record success',
      value: {
        type: 'promptit/get-prompt-record',
        ok: true,
        status: 'success',
        prompt: literalPromptRecord,
      },
      keys: ['type', 'ok', 'status', 'prompt'],
      nested: [{ value: literalPromptRecord, keys: PROMPT_RECORD_KEYS }],
    },
    {
      name: 'create success',
      value: {
        type: 'promptit/create-prompt',
        ok: true,
        status: 'success',
        prompt: literalPromptRecord,
        sideEffects: literalPromptMutationSideEffects,
      },
      keys: ['type', 'ok', 'status', 'prompt', 'sideEffects'],
      nested: [
        { value: literalPromptRecord, keys: PROMPT_RECORD_KEYS },
        {
          value: literalPromptMutationSideEffects,
          keys: PROMPT_MUTATION_SIDE_EFFECT_KEYS,
        },
      ],
    },
    {
      name: 'update meta success',
      value: {
        type: 'promptit/update-prompt-meta',
        ok: true,
        status: 'success',
        meta: literalPromptMeta,
        sideEffects: literalPromptMutationSideEffects,
      },
      keys: ['type', 'ok', 'status', 'meta', 'sideEffects'],
      nested: [
        { value: literalPromptMeta, keys: PROMPT_META_KEYS },
        {
          value: literalPromptMutationSideEffects,
          keys: PROMPT_MUTATION_SIDE_EFFECT_KEYS,
        },
      ],
    },
    {
      name: 'update body success',
      value: {
        type: 'promptit/update-prompt-body',
        ok: true,
        status: 'success',
        prompt: literalPromptRecord,
        sideEffects: literalPromptMutationSideEffects,
      },
      keys: ['type', 'ok', 'status', 'prompt', 'sideEffects'],
      nested: [
        { value: literalPromptRecord, keys: PROMPT_RECORD_KEYS },
        {
          value: literalPromptMutationSideEffects,
          keys: PROMPT_MUTATION_SIDE_EFFECT_KEYS,
        },
      ],
    },
    {
      name: 'update record success',
      value: {
        type: 'promptit/update-prompt-record',
        ok: true,
        status: 'success',
        prompt: literalPromptRecord,
        sideEffects: literalPromptMutationSideEffects,
      },
      keys: ['type', 'ok', 'status', 'prompt', 'sideEffects'],
      nested: [
        { value: literalPromptRecord, keys: PROMPT_RECORD_KEYS },
        {
          value: literalPromptMutationSideEffects,
          keys: PROMPT_MUTATION_SIDE_EFFECT_KEYS,
        },
      ],
    },
    {
      name: 'delete success',
      value: {
        type: 'promptit/delete-prompt',
        ok: true,
        status: 'success',
        id: literalPromptMeta.id,
        sideEffects: literalPromptMutationSideEffects,
      },
      keys: ['type', 'ok', 'status', 'id', 'sideEffects'],
      nested: [
        {
          value: literalPromptMutationSideEffects,
          keys: PROMPT_MUTATION_SIDE_EFFECT_KEYS,
        },
      ],
    },
    {
      name: 'move success',
      value: {
        type: 'promptit/move-prompt',
        ok: true,
        status: 'success',
        meta: literalPromptMeta,
        sideEffects: literalPromptMutationSideEffects,
      },
      keys: ['type', 'ok', 'status', 'meta', 'sideEffects'],
      nested: [
        { value: literalPromptMeta, keys: PROMPT_META_KEYS },
        {
          value: literalPromptMutationSideEffects,
          keys: PROMPT_MUTATION_SIDE_EFFECT_KEYS,
        },
      ],
    },
    {
      name: 'set pinned success',
      value: {
        type: 'promptit/set-prompt-pinned',
        ok: true,
        status: 'success',
        meta: literalPromptMeta,
        sideEffects: literalPromptMutationSideEffects,
      },
      keys: ['type', 'ok', 'status', 'meta', 'sideEffects'],
      nested: [
        { value: literalPromptMeta, keys: PROMPT_META_KEYS },
        {
          value: literalPromptMutationSideEffects,
          keys: PROMPT_MUTATION_SIDE_EFFECT_KEYS,
        },
      ],
    },
    {
      name: 'export backup success',
      value: {
        type: 'promptit/export-backup',
        ok: true,
        status: 'success',
        backup: literalBackup,
      },
      keys: ['type', 'ok', 'status', 'backup'],
      nested: [
        { value: literalBackup, keys: BACKUP_KEYS },
        { value: literalBackup.data, keys: BACKUP_DATA_KEYS },
        { value: literalBackup.data.settings, keys: BACKUP_SETTINGS_KEYS },
        { value: literalBackup.data.prompts[0], keys: PROMPT_RECORD_KEYS },
      ],
    },
    {
      name: 'restore backup success',
      value: {
        type: 'promptit/restore-backup',
        ok: true,
        status: 'success',
        restoredPromptCount: 1,
        languagePreference: 'en',
        themePreference: 'light',
      },
      keys: [
        'type',
        'ok',
        'status',
        'restoredPromptCount',
        'languagePreference',
        'themePreference',
      ],
    },
    {
      name: 'export prompts success',
      value: {
        type: 'promptit/export-prompts',
        ok: true,
        status: 'success',
        prompts: literalSharedPrompts,
      },
      keys: ['type', 'ok', 'status', 'prompts'],
      nested: [
        { value: literalSharedPrompts, keys: SHARED_PROMPTS_KEYS },
        { value: literalSharedPrompts.data, keys: SHARED_PROMPTS_DATA_KEYS },
        {
          value: literalSharedPrompts.data.prompts[0],
          keys: SHARED_PROMPT_KEYS,
        },
      ],
    },
    {
      name: 'import prompts success',
      value: {
        type: 'promptit/import-prompts',
        ok: true,
        status: 'success',
        importedPromptCount: 1,
      },
      keys: ['type', 'ok', 'status', 'importedPromptCount'],
    },
    {
      name: 'meta-only conflict',
      value: {
        type: 'promptit/update-prompt-meta',
        ok: false,
        status: 'conflict',
        id: literalPromptMeta.id,
        message: 'Literal meta conflict',
        messageDescriptor: literalUpdateConflictDescriptor,
        currentMeta: literalPromptMeta,
      },
      keys: [
        'type',
        'ok',
        'status',
        'id',
        'message',
        'messageDescriptor',
        'currentMeta',
      ],
      nested: [
        { value: literalUpdateConflictDescriptor, keys: MESSAGE_DESCRIPTOR_KEYS },
        { value: literalPromptMeta, keys: PROMPT_META_KEYS },
      ],
    },
    {
      name: 'record conflict',
      value: {
        type: 'promptit/update-prompt-record',
        ok: false,
        status: 'conflict',
        id: literalPromptMeta.id,
        message: 'Literal record conflict',
        messageDescriptor: literalUpdateConflictDescriptor,
        currentMeta: literalPromptMeta,
        currentRecord: literalPromptRecord,
      },
      keys: [
        'type',
        'ok',
        'status',
        'id',
        'message',
        'messageDescriptor',
        'currentMeta',
        'currentRecord',
      ],
      nested: [
        { value: literalUpdateConflictDescriptor, keys: MESSAGE_DESCRIPTOR_KEYS },
        { value: literalPromptMeta, keys: PROMPT_META_KEYS },
        { value: literalPromptRecord, keys: PROMPT_RECORD_KEYS },
      ],
    },
  ];

  for (const fixture of responseFixtures) {
    expectLiteralFixtureKeys(fixture);
    const parsed = parsePromptitRuntimeResponse(fixture.value);

    expect(parsed, fixture.name).toEqual(fixture.value);
    expectExactSortedKeys(parsed, fixture.keys);
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
    buildCreatePromptSuccessResponse(prompt, literalPromptMutationSideEffects),
    buildPromptMetaSuccessResponse(
      UPDATE_PROMPT_META_MESSAGE,
      meta,
      literalPromptMutationSideEffects,
    ),
    buildUpdatePromptBodySuccessResponse(
      prompt,
      literalPromptMutationSideEffects,
    ),
    buildUpdatePromptRecordSuccessResponse(
      prompt,
      literalPromptMutationSideEffects,
    ),
    buildDeletePromptSuccessResponse(
      prompt.id,
      literalPromptMutationSideEffects,
    ),
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
      prompt,
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
    buildDataPortabilityErrorResponse(
      RESTORE_BACKUP_MESSAGE,
      'Rollback failed',
      'data-portability-rollback-failed',
      { key: 'runtime.request.failed' },
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

test('runtime contract rejects literal responses with omitted required keys', () => {
  const malformedResponses = [
    {
      name: 'open options page success missing ok',
      value: { type: 'promptit/open-options-page' },
    },
    {
      name: 'list metas success missing metas',
      value: {
        type: 'promptit/list-prompt-metas',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'get body success missing body',
      value: {
        type: 'promptit/get-prompt-body',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'get record success missing prompt',
      value: {
        type: 'promptit/get-prompt-record',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'create success missing prompt',
      value: {
        type: 'promptit/create-prompt',
        ok: true,
        status: 'success',
        sideEffects: literalPromptMutationSideEffects,
      },
    },
    {
      name: 'create success missing sideEffects',
      value: {
        type: 'promptit/create-prompt',
        ok: true,
        status: 'success',
        prompt: literalPromptRecord,
      },
    },
    {
      name: 'update meta success missing meta',
      value: {
        type: 'promptit/update-prompt-meta',
        ok: true,
        status: 'success',
        sideEffects: literalPromptMutationSideEffects,
      },
    },
    {
      name: 'update meta success missing sideEffects',
      value: {
        type: 'promptit/update-prompt-meta',
        ok: true,
        status: 'success',
        meta: literalPromptMeta,
      },
    },
    {
      name: 'update body success missing prompt',
      value: {
        type: 'promptit/update-prompt-body',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'update record success missing prompt',
      value: {
        type: 'promptit/update-prompt-record',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'delete success missing id',
      value: {
        type: 'promptit/delete-prompt',
        ok: true,
        status: 'success',
        sideEffects: literalPromptMutationSideEffects,
      },
    },
    {
      name: 'delete success missing sideEffects',
      value: {
        type: 'promptit/delete-prompt',
        ok: true,
        status: 'success',
        id: literalPromptMeta.id,
      },
    },
    {
      name: 'move success missing meta',
      value: {
        type: 'promptit/move-prompt',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'set pinned success missing meta',
      value: {
        type: 'promptit/set-prompt-pinned',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'export backup success missing backup',
      value: {
        type: 'promptit/export-backup',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'restore backup success missing languagePreference',
      value: {
        type: 'promptit/restore-backup',
        ok: true,
        status: 'success',
        restoredPromptCount: 1,
        themePreference: 'light',
      },
    },
    {
      name: 'export prompts success missing prompts',
      value: {
        type: 'promptit/export-prompts',
        ok: true,
        status: 'success',
      },
    },
    {
      name: 'import prompts success missing importedPromptCount',
      value: {
        type: 'promptit/import-prompts',
        ok: true,
        status: 'success',
      },
    },
  ];

  for (const { name, value } of malformedResponses) {
    expect(parsePromptitRuntimeResponse(value), name).toBeNull();
  }
});

test('runtime contract rejects incompatible literal conflict response shapes', () => {
  const malformedConflictResponses = [
    {
      name: 'meta-only conflict must not include currentRecord',
      value: {
        type: 'promptit/update-prompt-meta',
        ok: false,
        status: 'conflict',
        id: literalPromptMeta.id,
        message: 'Literal meta conflict',
        currentMeta: literalPromptMeta,
        currentRecord: literalPromptRecord,
      },
    },
    {
      name: 'record conflict requires currentRecord',
      value: {
        type: 'promptit/update-prompt-record',
        ok: false,
        status: 'conflict',
        id: literalPromptMeta.id,
        message: 'Literal record conflict',
        currentMeta: literalPromptMeta,
      },
    },
    {
      name: 'record conflict requires currentMeta',
      value: {
        type: 'promptit/update-prompt-record',
        ok: false,
        status: 'conflict',
        id: literalPromptMeta.id,
        message: 'Literal record conflict',
        currentRecord: literalPromptRecord,
      },
    },
  ];

  for (const { name, value } of malformedConflictResponses) {
    expect(parsePromptitRuntimeResponse(value), name).toBeNull();
  }
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
      type: CREATE_PROMPT_MESSAGE,
      ok: true,
      status: 'success',
      prompt,
      sideEffects: { promptRevisionPublished: 'yes' },
    },
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
      sideEffects: literalPromptMutationSideEffects,
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
