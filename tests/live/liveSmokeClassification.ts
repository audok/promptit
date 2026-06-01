import { test, type TestInfo } from '@playwright/test';

export async function runLiveStep<T>(
  _testInfo: TestInfo,
  options: { site: string; step: string },
  action: () => Promise<T>,
): Promise<T> {
  return await test.step(`${options.site}: ${options.step}`, action);
}
