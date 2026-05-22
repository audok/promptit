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
