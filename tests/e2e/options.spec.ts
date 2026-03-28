import { expect, test } from '@playwright/test';

import { launchExtension } from '../playwright/extension';

test('opens the options page', async () => {
  const extension = await launchExtension();

  try {
    const page = await extension.context.newPage();

    await page.goto(extension.optionsPageUrl, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveTitle(/Promptit Settings/i);
    await expect(page.getByText('Promptit Sprint 3')).toBeVisible();
  } finally {
    await extension.close();
  }
});
