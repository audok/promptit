import {
  createStarterPrompt,
  hasPromptDraftErrors,
  isPromptItem,
  isStarterPrompt,
  normalizePromptDraft,
  PROMPTS_STORAGE_KEY,
  sortPrompts,
  validatePromptDraft,
  type PromptDraft,
  type PromptItem,
} from './schema';

function hasStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

async function persistPrompts(prompts: PromptItem[]): Promise<void> {
  if (!hasStorageApi()) {
    return;
  }

  await chrome.storage.local.set({
    [PROMPTS_STORAGE_KEY]: sortPrompts(
      prompts.filter((prompt) => !isStarterPrompt(prompt)),
    ),
  });
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

async function normalizeUserPrompts(rawValue: unknown): Promise<PromptItem[]> {
  if (!Array.isArray(rawValue)) {
    await persistPrompts([]);
    return [];
  }

  const validUserPrompts = rawValue
    .filter(isPromptItem)
    .filter((prompt) => !isStarterPrompt(prompt));
  const normalizedPrompts = sortPrompts(validUserPrompts);

  if (
    rawValue.length !== normalizedPrompts.length ||
    !hasSamePromptOrder(validUserPrompts, normalizedPrompts)
  ) {
    await persistPrompts(normalizedPrompts);
  }

  return normalizedPrompts;
}

async function readUserPrompts(): Promise<PromptItem[]> {
  if (!hasStorageApi()) {
    return [];
  }

  try {
    const result = await chrome.storage.local.get(PROMPTS_STORAGE_KEY);
    return await normalizeUserPrompts(result[PROMPTS_STORAGE_KEY]);
  } catch (error) {
    console.error('[promptit] Failed to read prompts from storage.', error);

    try {
      await persistPrompts([]);
    } catch (persistError) {
      console.error(
        '[promptit] Failed to restore prompt storage after storage error.',
        persistError,
      );
    }

    return [];
  }
}

function toLauncherPrompts(userPrompts: PromptItem[]): PromptItem[] {
  return userPrompts.length > 0 ? userPrompts : [createStarterPrompt()];
}

function getValidatedDraft(draft: PromptDraft): PromptDraft {
  const normalizedDraft = normalizePromptDraft(draft);
  const errors = validatePromptDraft(normalizedDraft);

  if (hasPromptDraftErrors(errors)) {
    throw new Error(
      Object.values(errors)
        .filter(Boolean)
        .join(' '),
    );
  }

  return normalizedDraft;
}

export async function getPrompts(): Promise<PromptItem[]> {
  const userPrompts = await readUserPrompts();
  return toLauncherPrompts(userPrompts);
}

export async function getUserPrompts(): Promise<PromptItem[]> {
  return readUserPrompts();
}

export async function createPrompt(draft: PromptDraft): Promise<PromptItem> {
  const validatedDraft = getValidatedDraft(draft);
  const prompts = await readUserPrompts();
  const timestamp = new Date().toISOString();

  const nextPrompt: PromptItem = {
    id: crypto.randomUUID(),
    title: validatedDraft.title,
    content: validatedDraft.content,
    sortOrder: validatedDraft.sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await persistPrompts([...prompts, nextPrompt]);
  return nextPrompt;
}

export async function updatePrompt(
  id: string,
  draft: PromptDraft,
): Promise<PromptItem | null> {
  const validatedDraft = getValidatedDraft(draft);
  const prompts = await readUserPrompts();
  const promptIndex = prompts.findIndex((prompt) => prompt.id === id);

  if (promptIndex < 0) {
    return null;
  }

  const existingPrompt = prompts[promptIndex];
  const updatedPrompt: PromptItem = {
    ...existingPrompt,
    title: validatedDraft.title,
    content: validatedDraft.content,
    sortOrder: validatedDraft.sortOrder,
    updatedAt: new Date().toISOString(),
  };

  const nextPrompts = [...prompts];
  nextPrompts[promptIndex] = updatedPrompt;
  await persistPrompts(nextPrompts);
  return updatedPrompt;
}

export async function deletePrompt(id: string): Promise<boolean> {
  const prompts = await readUserPrompts();
  const nextPrompts = prompts.filter((prompt) => prompt.id !== id);

  if (nextPrompts.length === prompts.length) {
    return false;
  }

  await persistPrompts(nextPrompts);
  return true;
}

export function subscribeToPrompts(
  listener: (prompts: PromptItem[]) => void,
): () => void {
  if (!hasStorageApi()) {
    return () => {};
  }

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !(PROMPTS_STORAGE_KEY in changes)) {
      return;
    }

    void normalizeUserPrompts(changes[PROMPTS_STORAGE_KEY]?.newValue)
      .then((userPrompts) => {
        listener(toLauncherPrompts(userPrompts));
      })
      .catch((error) => {
        console.error('[promptit] Failed to react to prompt storage changes.', error);
      });
  };

  chrome.storage.onChanged.addListener(handleChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleChange);
  };
}
