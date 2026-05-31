import { PROMPT_REVISION_STORAGE_KEY } from './schema';

export type PromptRevisionReason = 'records-replaced';

export type PromptRevision = {
  updatedAt: string;
  revision: string;
  reason?: PromptRevisionReason;
};

export type PublishPromptRevisionOptions = {
  reason?: PromptRevisionReason;
};

export async function publishPromptRevision(
  options: PublishPromptRevisionOptions = {},
): Promise<void> {
  if (!hasChromeStorageApi()) {
    return;
  }

  const updatedAt = new Date().toISOString();
  const revision: PromptRevision = {
    updatedAt,
    revision: `${updatedAt}:${crypto.getRandomValues(new Uint32Array(1))[0]}`,
  };

  if (options.reason) {
    revision.reason = options.reason;
  }

  await chrome.storage.local.set({
    [PROMPT_REVISION_STORAGE_KEY]: revision,
  });
}

function hasChromeStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
