import { getPrompts } from './legacyStorage';
import type { PromptItem } from './schema';

declare global {
  interface Window {
    __promptitTestGetPrompts?: () => Promise<PromptItem[]>;
  }
}

export function registerStorageTestHooks(): void {
  window.__promptitTestGetPrompts = getPrompts;
}
