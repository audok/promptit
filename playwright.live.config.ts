import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';

const { webServer, ...baseConfigWithoutWebServer } = baseConfig;

export default defineConfig({
  ...baseConfigWithoutWebServer,
  testDir: './tests/live',
  timeout: 45_000,
  outputDir: 'test-results-live',
  retries: 0,
});
