import {
  test,
  basePrompts,
  setContenteditableComposerState,
  dispatchComposerInput,
  getPopupAccessibilitySnapshot,
  getPopupChromeSnapshot,
  getToastAccessibilitySnapshot,
  getPopupThemeSnapshot,
  waitForPopupThemeSnapshot,
  getToastVisualSnapshot,
  parseRgbColor,
  expectRgbChannelsBetween,
  getContrastRatio,
  getActiveElementSnapshot,
  getPopupWidthSnapshot,
  installTinyPopupAnchorRect,
  getPopupPinButton,
  expectStoredPromptPinned,
  getPopupActionVisualSnapshot,
  expect,
  CONTENTEDITABLE_FIXTURE_URL,
  createPromptRecord,
  dispatchPromptitTestEvent,
  getActivePopupCellLabel,
  getComposerText,
  getPopupTitles,
  getToastText,
  grantFixtureClipboardPermissions,
  openFixturePage,
  openPromptPopup,
  waitForPromptPopupToClose,
} from '../playwright/chatgptSlashPopup';

test('opens the slash popup from the contenteditable fixture', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect(page.locator('[data-testid="promptit-popup-host"]')).toBeVisible();
  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(await getPopupTitles(page)).toEqual(['번역', '회의록']);
});

test('theme dark preference applies to the slash popup and updates while open', async ({
  extension,
}) => {
  await extension.setThemePreference('dark');
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  const darkSnapshot = await waitForPopupThemeSnapshot(page, 'dark');
  await expect(darkSnapshot).toMatchObject({
    rootColorScheme: 'dark',
    rootTheme: 'dark',
  });

  expectRgbChannelsBetween(darkSnapshot.cardBackgroundColor, 14, 16);
  expect(parseRgbColor(darkSnapshot.cardBackgroundColor).alpha).toBeGreaterThanOrEqual(0.96);
  expect(parseRgbColor(darkSnapshot.cardBackgroundColor).alpha).toBeLessThanOrEqual(0.99);
  expect(parseRgbColor(darkSnapshot.cardBorderColor).alpha).toBeGreaterThanOrEqual(0.08);
  expect(parseRgbColor(darkSnapshot.cardBorderColor).alpha).toBeLessThanOrEqual(0.12);
  expectRgbChannelsBetween(darkSnapshot.rowActiveBackgroundColor, 34, 38);
  expect(parseRgbColor(darkSnapshot.rowActiveIndicatorColor).alpha).toBe(0);
  expect(darkSnapshot.activeCellLabel).toBe('Insert prompt: 번역');
  expect(parseRgbColor(darkSnapshot.activeCellBackgroundColor ?? '').alpha).toBe(0);

  await page.keyboard.press('ArrowRight');

  await expect
    .poll(async () => {
      const snapshot = await getPopupThemeSnapshot(page);

      return {
        activeCellBackgroundAlpha: parseRgbColor(
          snapshot.activeCellBackgroundColor ?? '',
        ).alpha,
        activeCellLabel: snapshot.activeCellLabel,
        activeIconBadgeBackgroundColor:
          snapshot.activeIconBadgeBackgroundColor,
        activeIconBadgeColor: snapshot.activeIconBadgeColor,
      };
    })
    .toMatchObject({
      activeCellBackgroundAlpha: 0,
      activeCellLabel: 'Copy prompt: 번역',
      activeIconBadgeBackgroundColor: 'rgb(58, 58, 58)',
      activeIconBadgeColor: 'rgb(255, 255, 255)',
    });

  const darkIconSnapshot = await getPopupThemeSnapshot(page);
  expect(darkIconSnapshot.activeCellLabel).toBe('Copy prompt: 번역');
  expectRgbChannelsBetween(darkIconSnapshot.rowActiveBackgroundColor, 34, 38);
  expect(parseRgbColor(darkIconSnapshot.activeCellBackgroundColor ?? '').alpha).toBe(0);
  expectRgbChannelsBetween(
    darkIconSnapshot.activeIconBadgeBackgroundColor ?? '',
    56,
    60,
  );
  expectRgbChannelsBetween(darkIconSnapshot.activeIconBadgeColor ?? '', 252, 255);

  await extension.setThemePreference('light');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  await expect(await waitForPopupThemeSnapshot(page, 'light')).toMatchObject({
    rootColorScheme: 'light',
  });
});

test('theme dark preference keeps the empty popup description readable on the active row', async ({
  extension,
}) => {
  await extension.setThemePreference('dark');
  await extension.setPromptRecords([]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  const snapshot = await waitForPopupThemeSnapshot(page, 'dark');
  expect(snapshot.activeCellLabel).toBe(
    'No saved prompts. Add your first prompt in settings.',
  );
  if (!snapshot.descriptionColor) {
    throw new Error('Dark empty-state description color was not found.');
  }

  const descriptionContrastRatio = getContrastRatio(
    snapshot.descriptionColor,
    snapshot.rowActiveBackgroundColor,
  );

  expect(descriptionContrastRatio).toBeGreaterThanOrEqual(4.5);
});

test('localizes the Korean popup saved count with count first', async ({
  extension,
}) => {
  await extension.setLanguagePreference('ko');
  await extension.setPromptRecords([basePrompts[0]]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect
    .poll(async () => await getPopupChromeSnapshot(page))
    .toMatchObject({
      footerText: '1개 저장됨',
    });
});

test('localizes popup chrome in English without translating prompt data', async ({
  extension,
}) => {
  const koreanPrompt = createPromptRecord({
    id: 'english-popup-korean-prompt',
    title: '한국어 팝업 제목',
    content: '한국어 팝업 본문은 그대로 복사됩니다.',
    normalOrder: 1,
  });

  await extension.setLanguagePreference('en');
  await extension.setPromptRecords([koreanPrompt]);
  await grantFixtureClipboardPermissions(extension.context);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect(await getPopupTitles(page)).toEqual([koreanPrompt.title]);
  await expect
    .poll(async () => await getPopupChromeSnapshot(page))
    .toMatchObject({
      activeCellLabel: `Insert prompt: ${koreanPrompt.title}`,
      cardLabel: 'promptit prompt picker',
      exitText: 'Exit',
      footerText: '1 saved',
      headerSlash: '/',
      headerText: 'promptit',
      listLabel: 'Saved prompts',
      settingsLabel: 'Open settings',
    });

  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe(
    `Copy prompt: ${koreanPrompt.title}`,
  );
  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect(await getComposerText(page)).toBe('');
  await expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).toBe(koreanPrompt.content);
  await expect
    .poll(async () => await getToastText(page))
    .toBe('Prompt copied.');
});

test('localizes the popup empty state in English', async ({ extension }) => {
  await extension.setLanguagePreference('en');
  await extension.setPromptRecords([]);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect(await getPopupTitles(page)).toEqual(['No saved prompts.']);
  await expect
    .poll(async () => await getPopupChromeSnapshot(page))
    .toMatchObject({
      activeCellLabel: 'No saved prompts. Add your first prompt in settings.',
      cardLabel: 'promptit prompt picker',
      emptyDescription: 'Add your first prompt in settings.',
      footerText: '0 saved',
      headerSlash: '/',
      headerText: 'promptit',
      listLabel: 'Saved prompts',
      settingsLabel: 'Open settings',
    });
});

test('accessibility: exposes non-modal popup semantics and active cell live status', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);

  await expect
    .poll(async () => await getPopupAccessibilitySnapshot(page))
    .toMatchObject({
      activeCellAriaCurrent: 'true',
      activeCellLabel: 'Insert prompt: 번역',
      activeStatusAtomic: 'true',
      activeStatusLive: 'polite',
      activeStatusText: 'Insert prompt: 번역',
      cardAriaModal: null,
      cardLabel: 'promptit prompt picker',
      cardRole: 'region',
      listRole: 'list',
      rowRoles: ['listitem', 'listitem'],
    });
  expect((await getPopupAccessibilitySnapshot(page)).listLabel).toBeTruthy();

  await page.keyboard.press('ArrowDown');
  await expect
    .poll(async () => await getPopupAccessibilitySnapshot(page))
    .toMatchObject({
      activeCellAriaCurrent: 'true',
      activeCellLabel: 'Insert prompt: 회의록',
      activeStatusText: 'Insert prompt: 회의록',
    });

  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => await getPopupAccessibilitySnapshot(page))
    .toMatchObject({
      activeCellAriaCurrent: 'true',
      activeCellLabel: 'Copy prompt: 회의록',
      activeStatusText: 'Copy prompt: 회의록',
    });
});

test('toast live region attributes mark success announcements as polite status', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');

  await expect
    .poll(async () => await getToastAccessibilitySnapshot(page))
    .toMatchObject({
      atomic: 'true',
      live: 'polite',
      role: 'status',
      text: 'Prompt pinned.',
      variant: 'success',
    });
});

test('toast live region attributes mark error announcements as assertive alerts', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);
  await dispatchPromptitTestEvent(page, 'promptit:test-set-controls', {
    failClipboardWrite: true,
  });

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  await expect
    .poll(async () => await getToastAccessibilitySnapshot(page))
    .toMatchObject({
      atomic: 'true',
      live: 'assertive',
      role: 'alert',
      text: 'Could not copy the prompt.',
      variant: 'error',
    });
});

test('Tab closes the popup and leaves composer focus without trapping the trigger', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('Tab');

  await waitForPromptPopupToClose(page);
  await expect(await getComposerText(page)).toBe('');
  const activeElement = await getActiveElementSnapshot(page);

  expect(activeElement.id).not.toBe('prompt-textarea');
  expect(activeElement.testId).not.toBe('prompt-textarea');
});

test('matches the ChatGPT popup width to the composer form wrapper', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);
  await openPromptPopup(page);

  const snapshot = await getPopupWidthSnapshot(page);

  expect(Math.abs(snapshot.popupWidth - snapshot.formWidth)).toBeLessThan(1);
  expect(snapshot.popupWidth).toBeGreaterThan(snapshot.surfaceWidth + 80);
});

test('keeps the ChatGPT popup width usable for a tiny anchor rect', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await setContenteditableComposerState(page, { text: '/ ' });
  await installTinyPopupAnchorRect(page);
  await dispatchComposerInput(page, 'insertText', ' ');

  await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();

  const snapshot = await getPopupWidthSnapshot(page);

  expect(snapshot.formWidth).toBe(1);
  expect(snapshot.popupWidth).toBeGreaterThanOrEqual(300);
});

test('copy success toast uses a compact text-only glass chip', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);
  await grantFixtureClipboardPermissions(extension.context);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe(
    'Copy prompt: 회의록',
  );

  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect
    .poll(async () => await getToastVisualSnapshot(page))
    .toMatchObject({
      backgroundColor: 'rgb(47, 47, 47)',
      borderTopLeftRadius: '999px',
      childElementCount: 0,
      color: 'rgb(250, 250, 249)',
      display: 'inline-flex',
      fontSize: '14px',
      fontWeight: '700',
      minHeight: '34px',
      paddingBottom: '6px',
      paddingLeft: '16px',
      paddingRight: '16px',
      paddingTop: '6px',
      text: 'Prompt copied.',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  expect((await getToastVisualSnapshot(page)).fontFamily).toContain('Pretendard');
});

test('theme dark preference applies inverted colors to copy success toast', async ({
  extension,
}) => {
  await extension.setThemePreference('dark');
  await extension.setPromptRecords(basePrompts);
  await grantFixtureClipboardPermissions(extension.context);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe('Copy prompt: 번역');

  await page.keyboard.press('Enter');
  await waitForPromptPopupToClose(page);

  await expect
    .poll(async () => await getToastVisualSnapshot(page))
    .toMatchObject({
      text: 'Prompt copied.',
      theme: 'dark',
    });

  const snapshot = await getToastVisualSnapshot(page);
  expectRgbChannelsBetween(snapshot.backgroundColor, 205, 225);
  expectRgbChannelsBetween(snapshot.color, 15, 30);
});

test('renders pin focus like copy focus and uses a filled pinned icon', async ({
  extension,
}) => {
  await extension.setPromptRecords(basePrompts);

  const page = await extension.context.newPage();
  await openFixturePage(page, CONTENTEDITABLE_FIXTURE_URL);

  await openPromptPopup(page);
  const initialSnapshot = await getPopupActionVisualSnapshot(
    page,
    'pin',
    '번역',
  );

  expect(initialSnapshot.ariaPressed).toBe('false');
  expect(initialSnapshot.iconFillColor).not.toBe('rgb(0, 0, 0)');
  expect(initialSnapshot.iconPathData).toContain('v7.85');

  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe('Pin prompt: 번역');
  await expect
    .poll(async () => await getPopupActionVisualSnapshot(page, 'pin', '번역'))
    .toMatchObject({
      badgeBackgroundColor: 'rgba(0, 0, 0, 0.06)',
      badgeBorderStyle: 'none',
      badgeBorderWidth: '0px',
      iconFillColor: 'rgb(0, 0, 0)',
    });
  const focusedPinSnapshot = await getPopupActionVisualSnapshot(
    page,
    'pin',
    '번역',
  );
  expect(focusedPinSnapshot.iconPathData).toBe(initialSnapshot.iconPathData);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(await getActivePopupCellLabel(page)).toBe('Copy prompt: 번역');
  await expect
    .poll(async () => await getPopupActionVisualSnapshot(page, 'copy', '번역'))
    .toMatchObject({
      badgeBackgroundColor: 'rgba(0, 0, 0, 0.06)',
      badgeBorderStyle: 'none',
      badgeBorderWidth: '0px',
      iconFillColor: 'rgb(0, 0, 0)',
    });

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(await getActivePopupCellLabel(page)).toBe('Pin prompt: 번역');
  await page.keyboard.press('Enter');
  await expectStoredPromptPinned(extension, 'prompt-translate', true);
  await expect(getPopupPinButton(page, '번역', { pinned: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const pinnedSnapshot = await getPopupActionVisualSnapshot(
    page,
    'pin',
    '번역',
  );
  expect(pinnedSnapshot.iconFillColor).toBe('rgb(0, 0, 0)');
  expect(pinnedSnapshot.iconPathData).not.toBe(initialSnapshot.iconPathData);
  expect(pinnedSnapshot.iconPathData).not.toContain('v7.85');
});
