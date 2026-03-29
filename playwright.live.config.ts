import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testDir: './tests/live',
  timeout: 45_000,
  retries: 0,
});
