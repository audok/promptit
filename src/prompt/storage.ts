import {
  createStarterPrompt,
  isPromptItem,
  isStarterPrompt,
  PROMPTS_STORAGE_KEY,
  sortPrompts,
  type PromptItem,
} from './schema';

function hasStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

async function persistPrompts(prompts: PromptItem[]): Promise<void> {
  if (!hasStorageApi()) {
    return;
  }

  await chrome.storage.local.set({ [PROMPTS_STORAGE_KEY]: prompts });
}

function hasSamePromptOrder(left: PromptItem[], right: PromptItem[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const next = right[index];

    return (
      item.id === next.id &&
      item.title === next.title &&
      item.content === next.content &&
      item.sortOrder === next.sortOrder &&
      item.createdAt === next.createdAt &&
      item.updatedAt === next.updatedAt
    );
  });
}

async function normalizePrompts(rawValue: unknown): Promise<PromptItem[]> {
  const starterPrompt = createStarterPrompt();

  if (!Array.isArray(rawValue)) {
    await persistPrompts([starterPrompt]);
    return [starterPrompt];
  }

  const validPrompts = rawValue.filter(isPromptItem);
  const userPrompts = sortPrompts(
    validPrompts.filter((prompt) => !isStarterPrompt(prompt)),
  );

  if (userPrompts.length > 0) {
    if (!hasSamePromptOrder(validPrompts, userPrompts)) {
      await persistPrompts(userPrompts);
    }

    return userPrompts;
  }

  const normalizedStarter = validPrompts.find(isStarterPrompt) ?? starterPrompt;

  if (!hasSamePromptOrder(validPrompts, [normalizedStarter])) {
    await persistPrompts([normalizedStarter]);
  }

  return [normalizedStarter];
}

export async function getPrompts(): Promise<PromptItem[]> {
  if (!hasStorageApi()) {
    return [createStarterPrompt()];
  }

  try {
    const result = await chrome.storage.local.get(PROMPTS_STORAGE_KEY);
    return await normalizePrompts(result[PROMPTS_STORAGE_KEY]);
  } catch (error) {
    console.error('[promptit] Failed to read prompts from storage.', error);

    const starterPrompt = createStarterPrompt();

    try {
      await persistPrompts([starterPrompt]);
    } catch (persistError) {
      console.error(
        '[promptit] Failed to restore starter prompt after storage error.',
        persistError,
      );
    }

    return [starterPrompt];
  }
}
