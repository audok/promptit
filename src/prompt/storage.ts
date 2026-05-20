import { registerStorageTestHooks } from './storageTestHooks';

export {
  createPrompt,
  deletePrompt,
  getPromptBody,
  getPromptMetas,
  getPromptRecord,
  movePrompt,
  setPromptPinned,
  subscribeToPromptMetas,
  updatePromptBody,
  updatePromptMeta,
} from './runtimeStorageClient';
export type {
  DeletePromptOptions,
  DeletePromptResponse,
  MovePromptOptions,
  SetPromptPinnedOptions,
  UpdatePromptBodyOptions,
  UpdatePromptOptions,
} from './runtimeStorageClient';
export {
  getPrompts,
  getUserPrompts,
  subscribeToPrompts,
  updatePrompt,
} from './legacyStorage';
export type { LegacyUpdatePromptResponse } from './legacyStorage';

const IS_TEST_MODE = import.meta.env.VITE_PROMPTIT_TEST_MODE === '1';

if (IS_TEST_MODE && typeof window !== 'undefined') {
  registerStorageTestHooks();
}
