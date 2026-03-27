export type PromptItem = {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const PROMPTS_STORAGE_KEY = 'prompts';
export const STARTER_PROMPT_ID = '__promptit_starter_prompt__';
export const STARTER_PROMPT_TITLE = '설정에서 프롬프트를 저장해보세요!';
export const STARTER_PROMPT_CONTENT =
  'Promptit 설정에서 첫 프롬프트를 저장해보세요.';

export function createStarterPrompt(now = new Date()): PromptItem {
  const timestamp = now.toISOString();

  return {
    id: STARTER_PROMPT_ID,
    title: STARTER_PROMPT_TITLE,
    content: STARTER_PROMPT_CONTENT,
    sortOrder: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isPromptItem(value: unknown): value is PromptItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prompt = value as Partial<PromptItem>;

  return (
    typeof prompt.id === 'string' &&
    prompt.id.length > 0 &&
    typeof prompt.title === 'string' &&
    prompt.title.length >= 1 &&
    prompt.title.length <= 40 &&
    typeof prompt.content === 'string' &&
    prompt.content.length >= 1 &&
    typeof prompt.sortOrder === 'number' &&
    Number.isInteger(prompt.sortOrder) &&
    typeof prompt.createdAt === 'string' &&
    prompt.createdAt.length > 0 &&
    typeof prompt.updatedAt === 'string' &&
    prompt.updatedAt.length > 0
  );
}

export function isStarterPrompt(prompt: PromptItem): boolean {
  return prompt.id === STARTER_PROMPT_ID;
}

export function sortPrompts(items: PromptItem[]): PromptItem[] {
  return [...items].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.id.localeCompare(right.id);
  });
}
