import { PROMPT_REVISION_STORAGE_KEY } from './schema';

export async function publishPromptRevision(): Promise<void> {
  if (!hasChromeStorageApi()) {
    return;
  }

  const updatedAt = new Date().toISOString();

  await chrome.storage.local.set({
    [PROMPT_REVISION_STORAGE_KEY]: {
      updatedAt,
      revision: `${updatedAt}:${crypto.getRandomValues(new Uint32Array(1))[0]}`,
    },
  });
}

export async function publishPromptRevisionBestEffort(
  failureMessage = '[promptit] Failed to publish prompt revision.',
): Promise<void> {
  try {
    await publishPromptRevision();
  } catch (error) {
    console.error(failureMessage, error);
  }
}

function hasChromeStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
