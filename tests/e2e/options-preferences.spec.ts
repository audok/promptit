import {
  test,
  launchExtension,
  openOptionsPageShell,
  expectEnglishOptionsLanding,
  openOptionsPage,
  getPromptList,
  getPromptEditor,
  getOptionsToast,
  getOptionsThemeSnapshot,
  parseRgbColor,
  expectRgbChannelsBetween,
  expectNeutralRgbChannelsBetween,
  expectRgbaAlphaBetween,
  getComputedThemeStyle,
  getPromptListCreateButton,
  getPromptCard,
  expectPromptMetaValuesToUseTwoLineLayout,
  expectPromptListMicrocopyTypography,
  getTitleInput,
  getContentInput,
  getPromptSubmitButton,
  expect,
  createPromptRecord,
  THEME_PREFERENCE_STORAGE_KEY,
} from '../playwright/optionsPage';

test('opens the options page', async ({ extension }) => {
  await openOptionsPage(extension);
});

test('restores the theme selector and persists dark preference', async ({
  extension,
}) => {
  await extension.setChromeStorageLocalValue(
    THEME_PREFERENCE_STORAGE_KEY,
    'system',
  );

  const page = await openOptionsPage(extension);
  const themeSelector = page.getByRole('group', { name: '테마 선택' });
  const systemButton = themeSelector.getByRole('button', { name: '시스템' });
  const darkButton = themeSelector.getByRole('button', { name: '다크' });

  await expect(themeSelector).toBeVisible();
  await expect(systemButton).toHaveAttribute('aria-pressed', 'true');

  await darkButton.click();

  await expect(darkButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-theme',
    'dark',
  );
  expect(
    (await extension.getChromeStorageLocalSnapshot())[
      THEME_PREFERENCE_STORAGE_KEY
    ],
  ).toBe('dark');

  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(
    page.getByRole('group', { name: '테마 선택' }).getByRole('button', {
      name: '다크',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute(
    'data-promptit-theme',
    'dark',
  );
});

test('uses English browser UI language when preference is browser default', async () => {
  const extension = await launchExtension({ browserLocale: 'en-US' });

  try {
    await extension.clearLanguagePreference();

    await expect
      .poll(async () => await extension.getLanguagePreference())
      .toBeUndefined();
    await expect
      .poll(async () => await extension.getBrowserUiLanguage())
      .toMatch(/^en(?:-|$)/i);

    const page = await openOptionsPageShell(extension);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectEnglishOptionsLanding(page);
    await expect(
      page.getByRole('button', {
        name: /Open language menu: System, current English/,
      }),
    ).toBeVisible();
  } finally {
    await extension.close();
  }
});

test('falls back to Korean for unsupported browser UI language in browser default mode', async () => {
  const extension = await launchExtension();

  try {
    await extension.clearLanguagePreference();

    const page = await openOptionsPage(extension, async (nextPage) => {
      await nextPage.addInitScript(() => {
        Object.defineProperty(chrome.i18n, 'getUILanguage', {
          configurable: true,
          value: () => 'fr-FR',
        });
      });
    });

    await expect
      .poll(async () => await extension.getLanguagePreference())
      .toBeUndefined();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await expect(
      page.getByRole('button', { name: /언어 메뉴 열기: 시스템, 현재 한국어/ }),
    ).toBeVisible();
    expect(await page.evaluate(() => chrome.i18n.getUILanguage())).toBe('fr-FR');
  } finally {
    await extension.close();
  }
});

test('theme selector defaults to system and persists dark preference', async ({
  extension,
}) => {
  const themePrompt = createPromptRecord({
    id: 'theme-dark-palette-contract',
    title: '다크 팔레트 검증',
    content: '선택 행과 편집 버튼의 다크 팔레트를 검증한다.',
  });

  await extension.clearThemePreference();
  await extension.setPromptRecords([themePrompt]);

  const page = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.emulateMedia({ colorScheme: 'light' });
  });

  const themeSelector = page.getByRole('group', { name: '테마 선택' });
  const systemButton = themeSelector.getByRole('button', { name: '시스템' });
  const darkButton = themeSelector.getByRole('button', { name: '다크' });

  await expect(systemButton).toHaveAttribute('aria-pressed', 'true');
  await expect(await getOptionsThemeSnapshot(page)).toMatchObject({
    colorScheme: 'light',
    mainBackgroundColor: 'rgb(245, 245, 244)',
    rootTheme: 'light',
  });

  const promptCard = getPromptCard(page, themePrompt.title);
  await promptCard.click();
  await expect(
    page.getByRole('heading', { name: '프롬프트 수정' }),
  ).toBeVisible();
  await expect(getContentInput(page)).toHaveValue(themePrompt.content);

  const createButtonStyle = await getComputedThemeStyle(
    getPromptListCreateButton(page),
  );
  const cancelEditButtonStyle = await getComputedThemeStyle(
    getPromptEditor(page).getByRole('button', {
      name: '편집 취소',
      exact: true,
    }),
  );
  expect(cancelEditButtonStyle.fontSize).toBe(createButtonStyle.fontSize);
  expect(cancelEditButtonStyle.fontWeight).toBe(createButtonStyle.fontWeight);
  expect(cancelEditButtonStyle.lineHeight).toBe(createButtonStyle.lineHeight);

  const lightPromptListSurfaceStyle = await getComputedThemeStyle(
    getPromptList(page),
  );
  const lightPromptEditorIdleSurfaceStyle = await getComputedThemeStyle(
    getPromptEditor(page),
  );
  expect(lightPromptEditorIdleSurfaceStyle.backgroundColor).toBe(
    lightPromptListSurfaceStyle.backgroundColor,
  );
  expect(lightPromptEditorIdleSurfaceStyle.backgroundColor).toBe(
    'rgb(255, 255, 255)',
  );

  await getTitleInput(page).focus();

  const lightPromptEditorActiveSurfaceStyle = await getComputedThemeStyle(
    getPromptEditor(page),
  );
  expect(lightPromptEditorActiveSurfaceStyle.backgroundColor).toBe(
    'rgb(246, 248, 245)',
  );

  await darkButton.click();
  await expect.poll(async () => await extension.getThemePreference()).toBe('dark');
  await expect(darkButton).toHaveAttribute('aria-pressed', 'true');

  const darkSnapshot = await getOptionsThemeSnapshot(page);
  expect(darkSnapshot.rootTheme).toBe('dark');
  expect(darkSnapshot.colorScheme).toBe('dark');
  expectRgbChannelsBetween(darkSnapshot.mainBackgroundColor, 19, 21);
  expectRgbChannelsBetween(darkSnapshot.heroBorderColor, 45, 70);
  expectRgbChannelsBetween(darkSnapshot.textColor, 238, 242);

  const promptListSurfaceStyle = await getComputedThemeStyle(getPromptList(page));
  const promptEditorIdleSurfaceStyle = await getComputedThemeStyle(
    getPromptEditor(page),
  );
  expect(promptEditorIdleSurfaceStyle.backgroundColor).toBe(
    promptListSurfaceStyle.backgroundColor,
  );
  expect(promptEditorIdleSurfaceStyle.backgroundColor).toBe('rgb(34, 34, 34)');

  await getTitleInput(page).focus();

  const promptEditorActiveSurfaceStyle = await getComputedThemeStyle(
    getPromptEditor(page),
  );
  const promptEditorSurface = parseRgbColor(
    promptEditorActiveSurfaceStyle.backgroundColor,
  );
  const promptEditorSurfaceChannels = [
    promptEditorSurface.red,
    promptEditorSurface.green,
    promptEditorSurface.blue,
  ];
  const darkMainSurface = parseRgbColor(darkSnapshot.mainBackgroundColor);

  expect(Math.min(...promptEditorSurfaceChannels)).toBeGreaterThanOrEqual(34);
  expect(Math.max(...promptEditorSurfaceChannels)).toBeLessThanOrEqual(46);
  expect(
    Math.max(...promptEditorSurfaceChannels) -
      Math.min(...promptEditorSurfaceChannels),
  ).toBeLessThanOrEqual(5);
  expect(promptEditorSurface.green - promptEditorSurface.red).toBeGreaterThanOrEqual(
    2,
  );
  expect(promptEditorSurface.green - promptEditorSurface.blue).toBeGreaterThanOrEqual(
    2,
  );
  expect(promptEditorSurface.green - promptEditorSurface.red).toBeLessThanOrEqual(
    4,
  );
  expect(promptEditorSurface.green - promptEditorSurface.blue).toBeLessThanOrEqual(
    4,
  );
  expect(
    Math.max(
      Math.abs(promptEditorSurface.red - darkMainSurface.red),
      Math.abs(promptEditorSurface.green - darkMainSurface.green),
      Math.abs(promptEditorSurface.blue - darkMainSurface.blue),
    ),
  ).toBeLessThanOrEqual(28);

  const selectedPromptSurface = promptCard.locator('xpath=../..');

  await expect
    .poll(async () => (await getComputedThemeStyle(selectedPromptSurface)).backgroundColor)
    .toBe('rgb(62, 62, 62)');

  const selectedPromptSurfaceStyle = await getComputedThemeStyle(
    selectedPromptSurface,
  );
  expectNeutralRgbChannelsBetween(
    selectedPromptSurfaceStyle.backgroundColor,
    58,
    66,
  );
  expectNeutralRgbChannelsBetween(selectedPromptSurfaceStyle.borderColor, 96, 112);

  const selectedPromptBadgeStyle = await getComputedThemeStyle(
    promptCard.getByTestId('prompt-group-label'),
  );
  expectRgbaAlphaBetween(selectedPromptBadgeStyle.backgroundColor, 0.08, 0.13);

  const primaryButtonStyle = await getComputedThemeStyle(
    getPromptSubmitButton(page, '프롬프트 수정'),
  );
  expectNeutralRgbChannelsBetween(primaryButtonStyle.backgroundColor, 48, 82);

  const destructiveButtonStyle = await getComputedThemeStyle(
    getPromptEditor(page).getByRole('button', {
      name: '프롬프트 삭제',
      exact: true,
    }),
  );
  expect(destructiveButtonStyle.fontSize).toBe(primaryButtonStyle.fontSize);
  expect(destructiveButtonStyle.fontWeight).toBe(primaryButtonStyle.fontWeight);
  expect(destructiveButtonStyle.lineHeight).toBe(primaryButtonStyle.lineHeight);

  const destructiveSurface = parseRgbColor(destructiveButtonStyle.backgroundColor);
  const destructiveBorder = parseRgbColor(destructiveButtonStyle.borderColor);
  const destructiveText = parseRgbColor(destructiveButtonStyle.color);

  expect(destructiveSurface.red).toBeGreaterThan(destructiveSurface.green);
  expect(destructiveSurface.red).toBeGreaterThan(destructiveSurface.blue);
  expect(destructiveSurface.red).toBeLessThanOrEqual(140);
  expect(destructiveSurface.alpha).toBeGreaterThanOrEqual(0.2);
  expect(destructiveSurface.alpha).toBeLessThanOrEqual(0.45);
  expect(destructiveBorder.red).toBeGreaterThan(destructiveBorder.green);
  expect(destructiveBorder.red).toBeGreaterThan(destructiveBorder.blue);
  expect(destructiveBorder.alpha).toBeGreaterThanOrEqual(0.3);
  expect(destructiveBorder.alpha).toBeLessThanOrEqual(0.6);
  expect(destructiveText.red).toBeGreaterThan(destructiveText.green);
  expect(destructiveText.red).toBeGreaterThan(destructiveText.blue);
  expect(destructiveText.red).toBeLessThanOrEqual(245);
  expect(destructiveText.green).toBeGreaterThanOrEqual(120);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('group', { name: '테마 선택' }).getByRole('button', { name: '다크' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('dark');
});

test('theme selector follows dark system media and light overrides it', async ({
  extension,
}) => {
  await extension.clearThemePreference();

  const page = await openOptionsPage(extension, async (nextPage) => {
    await nextPage.emulateMedia({ colorScheme: 'dark' });
  });

  const themeSelector = page.getByRole('group', { name: '테마 선택' });
  const systemButton = themeSelector.getByRole('button', { name: '시스템' });
  const lightButton = themeSelector.getByRole('button', { name: '라이트' });

  await expect(systemButton).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('dark');
  await expect(await getOptionsThemeSnapshot(page)).toMatchObject({
    colorScheme: 'dark',
    rootTheme: 'dark',
  });

  await lightButton.click();

  await expect.poll(async () => await extension.getThemePreference()).toBe('light');
  await expect(lightButton).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('light');
  await expect(await getOptionsThemeSnapshot(page)).toMatchObject({
    colorScheme: 'light',
    mainBackgroundColor: 'rgb(245, 245, 244)',
    rootTheme: 'light',
  });
});

test('theme selector reacts to storage changes from another extension page', async ({
  extension,
}) => {
  await extension.setThemePreference('dark');

  const page = await openOptionsPage(extension);
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('dark');

  await extension.setThemePreference('light');

  await expect(page.getByRole('group', { name: '테마 선택' }).getByRole('button', { name: '라이트' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await getOptionsThemeSnapshot(page)).rootTheme)
    .toBe('light');
  await expect(await getOptionsThemeSnapshot(page)).toMatchObject({
    colorScheme: 'light',
    mainBackgroundColor: 'rgb(245, 245, 244)',
  });
});

test('uses heavier Korean prompt list microcopy to match English visual density', async ({
  extension,
}) => {
  const koreanPrompt = createPromptRecord({
    id: 'korean-list-microcopy-density',
    title: '한국어 라벨',
    content: '본문',
    normalOrder: 1,
  });

  await extension.setPromptRecords([koreanPrompt]);

  const page = await openOptionsPage(extension);

  await expectPromptListMicrocopyTypography(page, koreanPrompt.title, 'ko');
});

test('switches options UI to English while keeping fixed literals and Korean prompt data unchanged', async ({
  extension,
}) => {
  const koreanPrompt = createPromptRecord({
    id: 'english-options-korean-prompt',
    title: '한국어 제목',
    content: '한국어 본문은 번역되면 안 됩니다.',
    createdAt: '2026-05-24T10:17:00.000Z',
    updatedAt: '2026-05-26T08:44:00.000Z',
    normalOrder: 1,
  });

  await extension.setPromptRecords([koreanPrompt]);

  const page = await openOptionsPage(extension);

  await page.getByRole('button', { name: /언어 메뉴 열기/ }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();

  await expect.poll(async () => await extension.getLanguagePreference()).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'Save and paste prompts.' }),
  ).toBeVisible();
  await expect(page.getByText(/ChatGPT and Gemini/)).toBeVisible();
  await expect(page.getByText('promptit')).toBeVisible();
  await expect(page.getByLabel('/ Space')).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: '/' })).toBeVisible();
  await expect(page.locator('kbd').filter({ hasText: 'Space' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved prompts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add prompt' })).toBeVisible();
  await expect(page.getByText('Prompt list')).toBeVisible();
  await expect(page.getByText('Editor').first()).toBeVisible();

  await expect(page.getByText(koreanPrompt.title)).toBeVisible();
  await expectPromptMetaValuesToUseTwoLineLayout(
    page.getByTestId('prompt-card').filter({ hasText: koreanPrompt.title }).first(),
  );
  await expectPromptListMicrocopyTypography(page, koreanPrompt.title, 'en');
  await page.getByRole('button', { name: `Edit ${koreanPrompt.title}` }).click();
  await expect(page.getByRole('heading', { name: 'Edit prompt' })).toBeVisible();
  await expect(page.locator('form').getByRole('textbox', { name: /Title/ }))
    .toHaveValue(koreanPrompt.title);
  await expect(page.locator('form').getByRole('textbox', { name: /Body/ }))
    .toHaveValue(koreanPrompt.content);

  const englishPromptList = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Saved prompts' }) });
  await englishPromptList.getByRole('button', {
    name: 'Add prompt',
    exact: true,
  }).click();
  await page.locator('form').getByRole('textbox', { name: /Title/ }).fill('   ');
  await page.locator('form').getByRole('textbox', { name: /Body/ }).fill('   ');
  await page.locator('form').getByRole('button', { name: 'Add prompt' }).click();
  await expect(page.getByText('Body cannot be empty.')).toBeVisible();

  await page.locator('form').getByRole('textbox', { name: /Title/ })
    .fill('새 한국어 제목');
  await page.locator('form').getByRole('textbox', { name: /Body/ })
    .fill('새 한국어 본문도 그대로 저장됩니다.');
  await page.locator('form').getByRole('button', { name: 'Add prompt' }).click();
  await expect(getOptionsToast(page)).toContainText('Prompt saved.');

  await page.locator('form').getByRole('textbox', { name: /Title/ })
    .fill('Unsaved draft');
  await page.locator('form').getByRole('textbox', { name: /Body/ })
    .fill('Unsaved body');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      'You have unsaved changes. Discard them and continue?',
    );
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: `Edit ${koreanPrompt.title}` }).click();
  await expect(page.locator('form').getByRole('textbox', { name: /Title/ }))
    .toHaveValue('Unsaved draft');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(
      'You have unsaved changes. Discard them and continue?',
    );
    await dialog.accept();
  });
  await page.getByRole('button', { name: `Edit ${koreanPrompt.title}` }).click();
  await expect(page.locator('form').getByRole('textbox', { name: /Title/ }))
    .toHaveValue(koreanPrompt.title);

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe(`Delete "${koreanPrompt.title}" prompt?`);
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Delete prompt', exact: true }).click();
});
