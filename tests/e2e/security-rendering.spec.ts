import {
  CONTENTEDITABLE_FIXTURE_URL,
  createPromptRecord,
  expect,
  getComposerText,
  openFixturePage,
  openPromptPopup,
  test,
  waitForPromptPopupToClose,
} from '../playwright/chatgptSlashPopup';
import {
  getContentInput,
  getPromptCard,
  openOptionsPage,
} from '../playwright/optionsPage';

const xssTitle = '<img src=x onerror=__xssFlag=1>';
const htmlLookingBody =
  '<script>window.__xssFlag=true</script><b>literal bold</b>';

test('popup renders prompt titles as text and does not execute HTML', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'popup-title-xss',
      title: xssTitle,
      content: 'Popup title body',
      normalOrder: 1,
    }),
  ]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  const popup = page.locator('[data-testid="promptit-popup"]');
  await expect(popup.getByText(xssTitle, { exact: true })).toBeVisible();
  await expect(popup.locator('img')).toHaveCount(0);
  await expect(
    await page.evaluate(() => {
      return (window as Window & { __xssFlag?: unknown }).__xssFlag;
    }),
  ).toBeUndefined();
});

test('contenteditable insert treats HTML-looking prompt body as text', async ({
  extension,
}) => {
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'contenteditable-body-xss',
      title: 'HTML body',
      content: htmlLookingBody,
      normalOrder: 1,
    }),
  ]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe(htmlLookingBody);
  await expect(
    await page.locator('#prompt-textarea').evaluate((composer) => {
      return {
        boldCount: composer.querySelectorAll('b').length,
        scriptCount: composer.querySelectorAll('script').length,
        xssValue: (window as Window & { __xssFlag?: unknown })
          .__xssFlag,
      };
    }),
  ).toEqual({
    boldCount: 0,
    scriptCount: 0,
    xssValue: undefined,
  });
});

test('options list and editor render prompt text without executing HTML', async ({
  extension,
}) => {
  await extension.setLanguagePreference('ko');
  await extension.setPromptRecords([
    createPromptRecord({
      id: 'options-xss',
      title: xssTitle,
      content: htmlLookingBody,
      normalOrder: 1,
    }),
  ]);

  const page = await openOptionsPage(extension);

  await expect(getPromptCard(page, xssTitle)).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  await getPromptCard(page, xssTitle).click();
  await expect(getContentInput(page)).toHaveValue(htmlLookingBody);
  await expect(
    await page.evaluate(() => {
      return (window as Window & { __xssFlag?: unknown }).__xssFlag;
    }),
  ).toBeUndefined();
});
