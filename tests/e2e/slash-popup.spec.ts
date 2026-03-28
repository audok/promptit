import { expect, test } from '@playwright/test';

import { launchExtension } from '../playwright/extension';

test('opens the slash popup from the editor fixture', async () => {
  const extension = await launchExtension();

  try {
    const page = await extension.context.newPage();

    await page.goto('http://127.0.0.1:4173/editor.html', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-promptit-ready', 'true');

    await page.locator('#editor').click();
    await page.keyboard.type('/ ');

    await expect(page.locator('[data-testid="promptit-popup-host"]')).toBeVisible();
    await expect(page.locator('[data-testid="promptit-popup"]')).toBeVisible();
  } finally {
    await extension.close();
  }
});
