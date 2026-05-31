import {
  test,
  openOptionsPage,
  getPromptList,
  getOptionsToast,
  openBackupShareModal,
  writeJsonFixture,
  readDownloadedJson,
  getPromptCard,
  getTitleInput,
  getContentInput,
  getPromptSubmitButton,
  getRequiredPromptRecord,
  expectRawRuntimeMessageNotAccepted,
  expectExactKeys,
  expectPromptRecordJsonShape,
  expectValidIsoTimestamp,
  expectNoInternalBackupKeys,
  expect,
  createPromptRecord,
  IMPORT_PROMPTS_MESSAGE,
  RESTORE_BACKUP_MESSAGE,
  THEME_PREFERENCE_STORAGE_KEY,
} from '../playwright/optionsPage';

test('opens backup/share modal from the prompt header and disables empty sharing', async ({
  extension,
}) => {
  await extension.setPromptRecords([]);

  const page = await openOptionsPage(extension);
  const headerButtons = getPromptList(page).getByRole('button');

  await expect(headerButtons).toHaveCount(2);
  await expect(headerButtons.nth(0)).toHaveText('백업/공유');
  await expect(headerButtons.nth(1)).toHaveText('프롬프트 추가');

  const modal = await openBackupShareModal(page);

  await expect(modal.getByText('promptit의 설정, 저장된 프롬프트 등 모든 데이터를 백업 또는 복원합니다.')).toBeVisible();
  await expect(modal.getByText('또는 저장된 프롬프트만 공유하거나 가져옵니다.')).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'promptit 데이터 백업 & 복원' })).toBeVisible();
  await expect(modal.getByRole('button', { name: '백업', exact: true })).toBeEnabled();
  await expect(modal.getByTestId('backup-restore-file-button')).toBeEnabled();
  await expect(modal.getByRole('heading', { name: '프롬프트 공유 & 가져오기' })).toBeVisible();
  await expect(modal.getByRole('button', { name: '프롬프트 전체 공유' })).toBeDisabled();
  await expect(modal.getByText('저장된 프롬프트가 없습니다.')).toBeVisible();
  await expect(modal.getByTestId('prompts-import-file-button')).toBeEnabled();
});

test('downloads backup JSON with prompt records and language and theme settings', async ({
  extension,
}) => {
  const normalPrompt = createPromptRecord({
    id: 'backup-normal',
    title: '백업 일반',
    content: '백업 일반 본문',
    normalOrder: 2,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-01T02:00:00.000Z',
  });
  const pinnedPrompt = createPromptRecord({
    id: 'backup-pinned',
    title: '백업 고정',
    content: '백업 고정 본문',
    pinned: true,
    normalOrder: 1,
    pinnedOrder: 1,
    createdAt: '2026-05-02T00:00:00.000Z',
    updatedAt: '2026-05-02T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-02T02:00:00.000Z',
  });

  await extension.setPromptRecords([normalPrompt, pinnedPrompt]);
  await extension.setLanguagePreference('ko');
  await extension.setChromeStorageLocalValue('promptit:migration:version', 3);
  await extension.setChromeStorageLocalValue('promptit:test:flag', true);
  await extension.setChromeStorageLocalValue('promptit:internal:cache', {
    value: 'do not export',
  });
  await extension.setChromeStorageLocalValue(
    THEME_PREFERENCE_STORAGE_KEY,
    'dark',
  );

  const storageSnapshot = await extension.getChromeStorageLocalSnapshot();
  expect(storageSnapshot).toEqual(
    expect.objectContaining({
      'promptit:migration:version': 3,
      'promptit:test:flag': true,
      'promptit:internal:cache': { value: 'do not export' },
      [THEME_PREFERENCE_STORAGE_KEY]: 'dark',
    }),
  );
  expect(storageSnapshot).toHaveProperty('promptit:promptsRevision');

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);
  const download = await readDownloadedJson<Record<string, unknown>>(
    page,
    async () => {
      await modal.getByTestId('backup-export-button').click();
    },
  );

  expect(download.filename).toMatch(/^promptit-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expectNoInternalBackupKeys(download.raw);
  expectExactKeys(download.value, ['type', 'appVersion', 'exportedAt', 'data']);
  expect(download.value.type).toBe('promptit.backup');
  expect(download.value.appVersion).toBe('0.9.0');
  expectValidIsoTimestamp(download.value.exportedAt);

  const data = download.value.data;
  expectExactKeys(data, ['prompts', 'settings']);
  expect(data.settings).toEqual({
    languagePreference: 'ko',
    themePreference: 'dark',
  });
  expect(data.prompts).toEqual([pinnedPrompt, normalPrompt]);

  for (const prompt of data.prompts as unknown[]) {
    expectPromptRecordJsonShape(prompt);
  }
});

test('downloads shared prompts JSON with title and content only', async ({
  extension,
}) => {
  const normalPrompt = createPromptRecord({
    id: 'share-normal',
    title: '공유 일반',
    content: '공유 일반 본문',
    normalOrder: 2,
  });
  const pinnedPrompt = createPromptRecord({
    id: 'share-pinned',
    title: '공유 고정',
    content: '공유 고정 본문',
    pinned: true,
    pinnedOrder: 1,
    normalOrder: 1,
  });

  await extension.setPromptRecords([normalPrompt, pinnedPrompt]);
  await extension.setChromeStorageLocalValue('promptit:test:flag', true);
  await extension.setChromeStorageLocalValue(
    THEME_PREFERENCE_STORAGE_KEY,
    'dark',
  );

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);
  const download = await readDownloadedJson<Record<string, unknown>>(
    page,
    async () => {
      await modal.getByTestId('prompts-share-button').click();
    },
  );

  expect(download.filename).toMatch(/^promptit-prompts-\d{4}-\d{2}-\d{2}\.json$/);
  expectNoInternalBackupKeys(download.raw);
  expectExactKeys(download.value, ['type', 'appVersion', 'exportedAt', 'data']);
  expect(download.value.type).toBe('promptit.prompts');
  expect(download.value.appVersion).toBe('0.9.0');
  expectValidIsoTimestamp(download.value.exportedAt);

  const data = download.value.data;
  expectExactKeys(data, ['prompts']);
  expect(data.prompts).toEqual([
    {
      title: pinnedPrompt.title,
      content: pinnedPrompt.content,
    },
    {
      title: normalPrompt.title,
      content: normalPrompt.content,
    },
  ]);

  for (const prompt of data.prompts as unknown[]) {
    expectExactKeys(prompt, ['title', 'content']);
  }
  expect(download.raw).not.toContain('languagePreference');
  expect(download.raw).not.toContain('themePreference');
});

test('restore file selection previews without writing, then confirmation replaces prompts and settings', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'restore-current',
    title: '현재 프롬프트',
    content: '복원 전 본문',
    normalOrder: 1,
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-03T02:00:00.000Z',
  });
  const restoredPrompt = createPromptRecord({
    id: 'restore-backed-up',
    title: '복원된 프롬프트',
    content: '복원 파일 본문',
    pinned: true,
    normalOrder: 7,
    pinnedOrder: 2,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-04T02:00:00.000Z',
  });
  const backupFile = {
    type: 'promptit.backup',
    appVersion: '0.9.0',
    exportedAt: '2026-05-05T03:04:05.000Z',
    data: {
      prompts: [restoredPrompt],
      settings: {
        languagePreference: 'en',
        themePreference: 'dark',
      },
    },
  };

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');
  await extension.setThemePreference('light');
  const beforeRevision = await extension.getPromptStorageRevision();
  const filePath = await writeJsonFixture(
    testInfo,
    'restore-backup.json',
    backupFile,
  );

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);

  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toBeVisible();
  await expect(modal.getByText('restore-backup.json')).toBeVisible();
  await expect(modal.getByText('백업 생성일')).toBeVisible();
  await expect(modal.getByText('프롬프트 수')).toBeVisible();
  await expect(modal.getByText('언어: English, 테마: 다크')).toBeVisible();
  await expect(modal.getByText('0.9.0')).toBeVisible();
  await expect(modal.getByText('현재 저장된 프롬프트와 설정을 모두 지우고 백업 파일의 내용으로 되돌립니다.')).toBeVisible();
  expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
  expect(await extension.getLanguagePreference()).toBe('ko');
  expect(await extension.getThemePreference()).toBe('light');

  await modal.getByTestId('backup-restore-confirm-button').click();

  await expect(getOptionsToast(page)).toContainText(
    'restore-backup.json로부터 데이터를 복원했습니다.',
  );
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([
    restoredPrompt,
  ]);
  await expect.poll(async () => await extension.getLanguagePreference()).toBe('en');
  await expect.poll(async () => await extension.getThemePreference()).toBe('dark');
  expect(await extension.getPromptStorageRevision()).not.toEqual(beforeRevision);
});

test('refreshes an open editor when restore replaces the same prompt id and timestamps', async ({
  extension,
}, testInfo) => {
  const initialPrompt = createPromptRecord({
    id: 'restore-same-id-open-editor',
    title: '동일 ID 복원 대상',
    content: 'old body text',
    normalOrder: 1,
    createdAt: '2026-05-05T01:00:00.000Z',
    updatedAt: '2026-05-05T02:00:00.000Z',
    bodyUpdatedAt: '2026-05-05T03:00:00.000Z',
  });
  const restoredPrompt = createPromptRecord({
    id: initialPrompt.id,
    title: initialPrompt.title,
    content: 'new body text',
    normalOrder: initialPrompt.normalOrder,
    pinned: initialPrompt.pinned,
    createdAt: initialPrompt.createdAt,
    updatedAt: initialPrompt.updatedAt,
    bodyUpdatedAt: initialPrompt.bodyUpdatedAt,
  });
  const filePath = await writeJsonFixture(testInfo, 'restore-same-id.json', {
    type: 'promptit.backup',
    appVersion: '1.0.0',
    exportedAt: '2026-05-05T04:00:00.000Z',
    data: {
      prompts: [restoredPrompt],
      settings: {
        languagePreference: 'ko',
        themePreference: 'system',
      },
    },
  });

  await extension.setPromptRecords([initialPrompt]);

  const editorPage = await openOptionsPage(extension);
  await getPromptCard(editorPage, initialPrompt.title).click();
  await expect(getContentInput(editorPage)).toHaveValue(initialPrompt.content);

  const restorePage = await openOptionsPage(extension);
  const modal = await openBackupShareModal(restorePage);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);
  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toBeVisible();
  await modal.getByTestId('backup-restore-confirm-button').click();
  await expect(getOptionsToast(restorePage)).toContainText(
    'restore-same-id.json로부터 데이터를 복원했습니다.',
  );

  await expect(getContentInput(editorPage)).toHaveValue(restoredPrompt.content);

  await getTitleInput(editorPage).fill('복원 후 제목 저장');
  await getPromptSubmitButton(editorPage, '프롬프트 수정').click();
  await expect(getOptionsToast(editorPage)).toContainText(
    '프롬프트를 업데이트했습니다.',
  );

  const savedPrompt = await getRequiredPromptRecord(extension, initialPrompt.id);
  expect(savedPrompt.title).toBe('복원 후 제목 저장');
  expect(savedPrompt.content).toBe(restoredPrompt.content);
});

test('invalid restore files preserve current data', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'invalid-restore-current',
    title: '유지할 프롬프트',
    content: '잘못된 복원 후에도 유지되어야 한다.',
    normalOrder: 1,
  });

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');
  const filePath = await writeJsonFixture(testInfo, 'invalid-restore.json', {
    type: 'promptit.not-backup',
    appVersion: '0.9.0',
    exportedAt: '2026-05-05T03:04:05.000Z',
    data: {
      prompts: [],
      settings: {
        languagePreference: 'en',
        themePreference: 'dark',
      },
    },
  });

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);

  await expect(getOptionsToast(page)).toContainText(
    '복원에 실패했습니다. 현재 데이터는 변경되지 않았습니다.',
  );
  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toHaveCount(0);
  expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
  expect(await extension.getLanguagePreference()).toBe('ko');
});

test('restore files missing or carrying invalid theme settings preserve current data', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'invalid-restore-theme-current',
    title: '테마 검증 유지 프롬프트',
    content: '잘못된 테마 설정 복원 후에도 유지되어야 한다.',
    normalOrder: 1,
  });
  const backupBase = {
    type: 'promptit.backup',
    appVersion: '0.9.0',
    exportedAt: '2026-05-05T03:04:05.000Z',
    data: {
      prompts: [],
      settings: {
        languagePreference: 'en',
        themePreference: 'dark',
      },
    },
  };
  const missingThemeFilePath = await writeJsonFixture(
    testInfo,
    'invalid-restore-missing-theme.json',
    {
      ...backupBase,
      data: {
        ...backupBase.data,
        settings: {
          languagePreference: 'en',
        },
      },
    },
  );
  const invalidThemeFilePath = await writeJsonFixture(
    testInfo,
    'invalid-restore-theme-value.json',
    {
      ...backupBase,
      data: {
        ...backupBase.data,
        settings: {
          languagePreference: 'en',
          themePreference: 'sepia',
        },
      },
    },
  );

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');
  await extension.setThemePreference('light');

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  for (const filePath of [missingThemeFilePath, invalidThemeFilePath]) {
    await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);

    await expect(getOptionsToast(page)).toContainText(
      '복원에 실패했습니다. 현재 데이터는 변경되지 않았습니다.',
    );
    await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toHaveCount(0);
    expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
    expect(await extension.getLanguagePreference()).toBe('ko');
    expect(await extension.getThemePreference()).toBe('light');
  }
});

test('restore persistence failure rolls back prompt replacement and preserves settings', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'restore-failure-current',
    title: '롤백되어야 하는 현재 프롬프트',
    content: '언어 저장 실패 뒤에도 남아야 한다.',
    normalOrder: 1,
  });
  const restoredPrompt = createPromptRecord({
    id: 'restore-failure-backup',
    title: '반영되면 안 되는 백업 프롬프트',
    content: '언어 저장 실패 때문에 최종 저장되면 안 된다.',
    normalOrder: 2,
  });
  const filePath = await writeJsonFixture(testInfo, 'restore-write-fails.json', {
    type: 'promptit.backup',
    appVersion: '0.9.0',
    exportedAt: '2026-05-05T03:04:05.000Z',
    data: {
      prompts: [restoredPrompt],
      settings: {
        languagePreference: 'en',
        themePreference: 'dark',
      },
    },
  });

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');
  await extension.setThemePreference('light');

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);
  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toBeVisible();

  await extension.failLanguagePreferenceWrites();
  await modal.getByTestId('backup-restore-confirm-button').click();

  await expect(getOptionsToast(page)).toContainText(
    '복원에 실패했습니다. 현재 데이터는 변경되지 않았습니다.',
  );
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([
    currentPrompt,
  ]);
  expect(await extension.getLanguagePreference()).toBe('ko');
  expect(await extension.getThemePreference()).toBe('light');
});

test('restore theme persistence failure rolls back prompts and language and preserves theme', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'restore-theme-failure-current',
    title: '테마 실패 시 유지할 현재 프롬프트',
    content: '테마 저장 실패 뒤에도 남아야 한다.',
    normalOrder: 1,
  });
  const restoredPrompt = createPromptRecord({
    id: 'restore-theme-failure-backup',
    title: '테마 실패 시 반영되면 안 되는 백업 프롬프트',
    content: '테마 저장 실패 때문에 최종 저장되면 안 된다.',
    normalOrder: 2,
  });
  const filePath = await writeJsonFixture(
    testInfo,
    'restore-theme-write-fails.json',
    {
      type: 'promptit.backup',
      appVersion: '0.9.0',
      exportedAt: '2026-05-05T03:04:05.000Z',
      data: {
        prompts: [restoredPrompt],
        settings: {
          languagePreference: 'en',
          themePreference: 'dark',
        },
      },
    },
  );

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');
  await extension.setThemePreference('light');

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('backup-restore-file-input').setInputFiles(filePath);
  await expect(modal.getByRole('heading', { name: '복원할 백업 확인' })).toBeVisible();

  await extension.failThemePreferenceWrites();
  await modal.getByTestId('backup-restore-confirm-button').click();

  await expect(getOptionsToast(page)).toContainText(
    '복원에 실패했습니다. 현재 데이터는 변경되지 않았습니다.',
  );
  await expect.poll(async () => await extension.getPromptRecords()).toEqual([
    currentPrompt,
  ]);
  await expect.poll(async () => await extension.getLanguagePreference()).toBe('ko');
  expect(await extension.getThemePreference()).toBe('light');
});

test('prompt import appends new prompt records without overwriting existing prompts', async ({
  extension,
}, testInfo) => {
  const existingPrompt = createPromptRecord({
    id: 'import-existing',
    title: '기존 프롬프트',
    content: '기존 본문',
    normalOrder: 1,
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T01:00:00.000Z',
    bodyUpdatedAt: '2026-05-06T02:00:00.000Z',
  });
  const sharedPrompts = [
    {
      title: '가져온 첫 번째',
      content: '가져온 첫 번째 본문',
    },
    {
      title: '가져온 두 번째',
      content: '가져온 두 번째 본문',
    },
  ];
  const filePath = await writeJsonFixture(testInfo, 'shared-prompts.json', {
    type: 'promptit.prompts',
    appVersion: '0.9.0',
    exportedAt: '2026-05-07T03:04:05.000Z',
    data: {
      prompts: sharedPrompts,
    },
  });

  await extension.setPromptRecords([existingPrompt]);
  const beforeRevision = await extension.getPromptStorageRevision();

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);
  const importStartedAt = Date.now();

  await modal.getByTestId('prompts-import-file-input').setInputFiles(filePath);

  await expect(getOptionsToast(page)).toContainText(
    '2개의 프롬프트를 가져왔습니다.',
  );

  const importFinishedAt = Date.now();
  const records = await extension.getPromptRecords();

  expect(records.map((prompt) => prompt.title)).toEqual([
    existingPrompt.title,
    '가져온 첫 번째',
    '가져온 두 번째',
  ]);
  expect(records[0]).toEqual(existingPrompt);

  for (const [index, importedPrompt] of records.slice(1).entries()) {
    const sourcePrompt = sharedPrompts[index];

    expect(importedPrompt).toEqual(
      expect.objectContaining({
        title: sourcePrompt.title,
        content: sourcePrompt.content,
        pinned: false,
        pinnedOrder: null,
        charCount: Array.from(sourcePrompt.content).length,
      }),
    );
    expect(importedPrompt.id).not.toBe(existingPrompt.id);
    expect(importedPrompt.normalOrder).toBeGreaterThan(
      index === 0 ? existingPrompt.normalOrder : records[index].normalOrder,
    );

    for (const timestamp of [
      importedPrompt.createdAt,
      importedPrompt.updatedAt,
      importedPrompt.bodyUpdatedAt,
    ]) {
      const timestampMs = Date.parse(timestamp);

      expect(timestampMs).toBeGreaterThanOrEqual(importStartedAt - 1000);
      expect(timestampMs).toBeLessThanOrEqual(importFinishedAt + 1000);
    }
  }

  expect(await extension.getPromptStorageRevision()).not.toEqual(beforeRevision);
});

test('invalid prompt import files preserve current data', async ({
  extension,
}, testInfo) => {
  const currentPrompt = createPromptRecord({
    id: 'invalid-import-current',
    title: '가져오기 전 프롬프트',
    content: '잘못된 가져오기 후에도 유지되어야 한다.',
    normalOrder: 1,
  });
  const filePath = await writeJsonFixture(testInfo, 'invalid-import.json', {
    type: 'promptit.prompts',
    appVersion: '0.9.0',
    exportedAt: '2026-05-07T03:04:05.000Z',
    data: {
      prompts: [
        {
          title: '추가되면 안 됨',
          content: '공유 프롬프트 객체에는 id가 있으면 안 된다.',
          id: 'invalid-extra-id',
        },
      ],
    },
  });

  await extension.setPromptRecords([currentPrompt]);

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);

  await modal.getByTestId('prompts-import-file-input').setInputFiles(filePath);

  await expect(getOptionsToast(page)).toContainText(
    '프롬프트 가져오기에 실패했습니다.',
  );
  expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
});

test('malformed restore and import runtime messages are not accepted', async ({
  extension,
}) => {
  const currentPrompt = createPromptRecord({
    id: 'malformed-portability-current',
    title: '런타임 계약 유지',
    content: '잘못된 런타임 메시지 뒤에도 유지되어야 한다.',
    normalOrder: 1,
  });

  await extension.setPromptRecords([currentPrompt]);
  await extension.setLanguagePreference('ko');

  await expectRawRuntimeMessageNotAccepted(extension, {
    type: RESTORE_BACKUP_MESSAGE,
    backup: {
      type: 'promptit.backup',
      appVersion: '0.9.0',
      exportedAt: '2026-05-08T00:00:00.000Z',
      data: {
        prompts: [],
        settings: {
          languagePreference: 'fr',
          themePreference: 'dark',
        },
      },
    },
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: RESTORE_BACKUP_MESSAGE,
    backup: {
      type: 'promptit.backup',
      appVersion: '0.9.0',
      exportedAt: '2026-05-08T00:00:00.000Z',
      data: {
        prompts: [],
        settings: {
          languagePreference: 'en',
        },
      },
    },
  });
  await expectRawRuntimeMessageNotAccepted(extension, {
    type: RESTORE_BACKUP_MESSAGE,
    backup: {
      type: 'promptit.backup',
      appVersion: '0.9.0',
      exportedAt: '2026-05-08T00:00:00.000Z',
      data: {
        prompts: [],
        settings: {
          languagePreference: 'en',
          themePreference: 'sepia',
        },
      },
    },
  });
  expect(await extension.getLanguagePreference()).toBe('ko');

  await expectRawRuntimeMessageNotAccepted(extension, {
    type: IMPORT_PROMPTS_MESSAGE,
    prompts: {
      type: 'promptit.prompts',
      appVersion: '0.9.0',
      exportedAt: '2026-05-08T00:00:00.000Z',
      data: {
        prompts: [
          {
            title: '계약 위반',
            content: 'extra 키 때문에 거부되어야 한다.',
            normalOrder: 1,
          },
        ],
      },
    },
  });
  expect(await extension.getLanguagePreference()).toBe('ko');

  expect(await extension.getPromptRecords()).toEqual([currentPrompt]);
});
