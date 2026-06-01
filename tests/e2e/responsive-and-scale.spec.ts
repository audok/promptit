import {
  CONTENTEDITABLE_FIXTURE_URL,
  createPromptRecord,
  expect,
  getActivePopupCellLabel,
  getComposerText,
  openFixturePage,
  openPromptPopup,
  test,
  waitForPromptPopupToClose,
} from '../playwright/chatgptSlashPopup';
import {
  getContentInput,
  getPromptCard,
  getPromptSubmitButton,
  openBackupShareModal,
  openOptionsPage,
  readDownloadedJson,
} from '../playwright/optionsPage';

function createManyPrompts(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const order = index + 1;
    const id = `scale-prompt-${String(order).padStart(3, '0')}`;
    const timestamp = new Date(
      Date.UTC(2026, 4, 31, 0, 0, index),
    ).toISOString();

    return createPromptRecord({
      id,
      title: `Scale ${String(order).padStart(3, '0')}`,
      content: `Scale body ${String(order).padStart(3, '0')}`,
      normalOrder: order,
      createdAt: timestamp,
      updatedAt: timestamp,
      bodyUpdatedAt: timestamp,
    });
  });
}

async function getDocumentOverflowState(page: {
  evaluate: <T>(pageFunction: () => T) => Promise<T>;
}) {
  return await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;

    return {
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      documentClientWidth: documentElement.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
    };
  });
}

test('options page has no horizontal document overflow at mobile width', async ({
  extension,
}) => {
  await extension.setLanguagePreference('ko');
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'mobile-options',
      title: '모바일 옵션',
      content: '모바일 폭에서도 가로 스크롤이 없어야 한다.',
      normalOrder: 1,
    }),
  ]);

  const page = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.setViewportSize({ width: 390, height: 780 });
  });
  const overflow = await getDocumentOverflowState(page);

  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(
    overflow.documentClientWidth + 1,
  );
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(
    overflow.bodyClientWidth + 1,
  );
});

test('slash popup has no horizontal document overflow at narrow width', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'narrow-popup',
      title: 'Narrow popup',
      content: 'Narrow popup body',
      normalOrder: 1,
    }),
  ]);

  const page = await extension.context.newPage();
  await page.setViewportSize({ width: 360, height: 740 });
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  const overflow = await getDocumentOverflowState(page);
  const popupBox = await page
    .locator('[data-testid="promptit-popup"]')
    .boundingBox();

  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(
    overflow.documentClientWidth + 1,
  );
  expect(popupBox?.x ?? 0).toBeGreaterThanOrEqual(0);
  expect((popupBox?.x ?? 0) + (popupBox?.width ?? 0)).toBeLessThanOrEqual(360);
});

test('popup remains keyboard usable with 150 saved prompts', async ({
  extension,
}) => {
  const prompts = createManyPrompts(150);
  await extension.setPromptRecords(prompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  await expect(await getActivePopupCellLabel(page)).toBe('Insert prompt: Scale 001');

  for (let index = 0; index < 19; index += 1) {
    await page.keyboard.press('ArrowDown');
  }

  await expect(await getActivePopupCellLabel(page)).toBe('Insert prompt: Scale 020');
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe(prompts[19].content);
});

test('options page can edit one prompt among 150 saved prompts', async ({
  extension,
}) => {
  await extension.setLanguagePreference('ko');
  const prompts = createManyPrompts(150);
  await extension.setPromptRecords(prompts);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, 'Scale 149').click();
  await expect(getContentInput(page)).toHaveValue(prompts[148].content);
  await getContentInput(page).fill('Updated scale body 149');
  await getPromptSubmitButton(page, '프롬프트 수정').click();

  await expect(getPromptCard(page, 'Scale 149')).toBeVisible();
  await expect
    .poll(async () => {
      return (await extension.getPromptRecords()).find(
        (prompt) => prompt.id === 'scale-prompt-149',
      )?.content;
    })
    .toBe('Updated scale body 149');
});

test('backup export preserves the prompt count for 150 saved prompts', async ({
  extension,
}) => {
  await extension.setLanguagePreference('ko');
  await extension.setPromptRecords(createManyPrompts(150));

  const page = await openOptionsPage(extension);
  const modal = await openBackupShareModal(page);
  const download = await readDownloadedJson<Record<string, unknown>>(
    page,
    async () => {
      await modal.getByTestId('backup-export-button').click();
    },
  );
  const data = download.value.data as { prompts?: unknown[] } | undefined;

  expect(download.filename).toMatch(/^promptit-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(data?.prompts).toHaveLength(150);
});
