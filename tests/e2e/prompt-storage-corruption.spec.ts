import {
  CONTENTEDITABLE_FIXTURE_URL,
  expect,
  getComposerText,
  getPopupTitles,
  getToastText,
  openFixturePage,
  openPromptPopup,
  test,
} from '../playwright/chatgptSlashPopup';
import { createPromptMeta } from '../playwright/promptit';
import {
  BODY_LOAD_ERROR_MESSAGE,
  expectBodyLoadErrorStatusOnly,
  getPromptCard,
  getPromptSubmitButton,
  openOptionsPage,
  openOptionsPageShell,
} from '../playwright/optionsPage';

const OPTIONS_LOAD_ERROR_MESSAGE =
  '저장된 프롬프트를 읽지 못했습니다. 확장 프로그램을 다시 열어 확인해보세요.';

test('content trigger reports prompt list read failure when stored metadata is malformed', async ({
  extension,
}) => {
  await extension.clearPromptStores();
  await extension.putRawPromptMetas([
    {
      id: 'malformed-meta',
      title: '',
      pinned: false,
      normalOrder: 1,
      pinnedOrder: null,
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z',
      bodyUpdatedAt: '2026-05-31T00:00:00.000Z',
      charCount: 12,
    },
  ]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  const composer = page.locator('#prompt-textarea');
  await composer.click();
  await page.keyboard.type('/ ');

  await expect(page.locator('[data-testid="promptit-popup"]')).toHaveCount(0);
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not read the prompt list.');
  await expect(await getComposerText(page)).toBe('/ ');
});

test('content action reports prompt body read failure when stored body is malformed', async ({
  extension,
}) => {
  const meta = createPromptMeta({
    id: 'malformed-body',
    title: 'Malformed body',
    content: 'Valid body for meta count',
    normalOrder: 1,
  });

  await extension.clearPromptStores();
  await extension.putRawPromptMetas([meta]);
  await extension.putRawPromptBodies([
    {
      id: meta.id,
      content: '',
      updatedAt: meta.bodyUpdatedAt,
    },
  ]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  await expect(await getPopupTitles(page)).toEqual(['Malformed body']);
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not read the prompt body.');
  await expect(await getComposerText(page)).toBe('/ ');
});

test('content action reports prompt body read failure when prompt body is missing', async ({
  extension,
}) => {
  const meta = createPromptMeta({
    id: 'missing-body',
    title: 'Missing body',
    content: 'Valid body for meta count',
    normalOrder: 1,
  });

  await extension.clearPromptStores();
  await extension.putRawPromptMetas([meta]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  await expect(await getPopupTitles(page)).toEqual(['Missing body']);
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Could not read the prompt body.');
  await expect(await getComposerText(page)).toBe('/ ');
});

test('options page reports load failure when stored metadata is malformed', async ({
  extension,
}) => {
  await extension.setLanguagePreference('ko');
  await extension.clearPromptStores();
  await extension.putRawPromptMetas([
    {
      id: 'options-malformed-meta',
      title: '',
      pinned: false,
      normalOrder: 1,
      pinnedOrder: null,
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z',
      bodyUpdatedAt: '2026-05-31T00:00:00.000Z',
      charCount: 12,
    },
  ]);

  const page = await openOptionsPageShell(extension);

  await expect(page.getByText('불러오기 실패')).toBeVisible();
  await expect(page.getByText(OPTIONS_LOAD_ERROR_MESSAGE)).toBeVisible();
});

test('options page blocks selected prompt save when stored body is malformed', async ({
  extension,
}) => {
  await extension.setLanguagePreference('ko');
  const meta = createPromptMeta({
    id: 'options-malformed-body',
    title: '본문 손상',
    content: '정상 메타 생성을 위한 본문',
    normalOrder: 1,
  });

  await extension.clearPromptStores();
  await extension.putRawPromptMetas([meta]);
  await extension.putRawPromptBodies([
    {
      id: meta.id,
      content: '',
      updatedAt: meta.bodyUpdatedAt,
    },
  ]);

  const page = await openOptionsPage(extension);
  await getPromptCard(page, meta.title).click();

  await expectBodyLoadErrorStatusOnly(page);
  await expect(page.getByText(BODY_LOAD_ERROR_MESSAGE)).toBeVisible();
  await expect(
    getPromptSubmitButton(page, '프롬프트 수정'),
  ).toBeDisabled();
  await page.locator('form').evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  await expectBodyLoadErrorStatusOnly(page);
  expect(await extension.getPromptMetas()).toEqual([meta]);
  await expect(await extension.getPromptBody(meta.id)).toEqual({
    id: meta.id,
    content: '',
    updatedAt: meta.bodyUpdatedAt,
  });
});
