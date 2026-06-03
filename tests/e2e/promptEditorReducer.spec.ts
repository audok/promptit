import { expect, test } from '@playwright/test';

import {
  DELETE_RECOVERY_MESSAGE,
  EXTERNAL_CHANGE_MESSAGE,
} from '../../src/options/promptEditorState';
import {
  createInitialPromptEditorState,
  getIncomingPromptEffect,
  promptEditorReducer,
  type PromptEditorState,
} from '../../src/options/promptEditorReducer';
import { createPromptRecord } from '../playwright/promptit';

function getEditingState(prompt = createBasePrompt()): PromptEditorState {
  const state = promptEditorReducer(createInitialPromptEditorState(), {
    type: 'incoming-prompts-received',
    prompts: [prompt],
    savedPromptEcho: null,
    savingPromptId: null,
  });

  return promptEditorReducer(state, {
    type: 'sync-editing-prompt',
    prompt,
  });
}

function createBasePrompt() {
  return createPromptRecord({
    id: 'reducer-prompt',
    title: 'Reducer prompt',
    content: 'Reducer body',
    normalOrder: 1,
    updatedAt: '2026-05-01T00:00:00.000Z',
    bodyUpdatedAt: '2026-05-01T00:00:00.000Z',
  });
}

test('clean edit with an external timestamp change keeps the record reload decision', () => {
  const prompt = createBasePrompt();
  const state = getEditingState(prompt);
  const changedPrompt = {
    ...prompt,
    title: 'Externally changed title',
    updatedAt: '2026-05-01T00:01:00.000Z',
  };

  const effect = getIncomingPromptEffect({
    state,
    prompts: [changedPrompt],
    savedPromptEcho: null,
    savingPromptId: null,
  });

  expect(effect).toEqual({
    type: 'load-record',
    prompt: changedPrompt,
  });

  const nextState = promptEditorReducer(state, {
    type: 'incoming-prompts-received',
    prompts: [changedPrompt],
    savedPromptEcho: null,
    savingPromptId: null,
  });

  expect(nextState.conflictState.status).toBe('idle');
  expect(nextState.alertMessage).toBeNull();

  if (effect.type !== 'load-record') {
    throw new Error('Expected reducer follow-up to request a record load.');
  }

  const loadingState = promptEditorReducer(nextState, {
    type: 'body-load-started',
    prompt: effect.prompt,
    preserveDirtyDraftOnFailure: false,
  });

  expect(loadingState.bodyLoadState).toEqual({
    status: 'loading',
    promptId: changedPrompt.id,
  });
  expect(loadingState.activePrompt).toBeNull();
  expect(loadingState.form.title).toBe(changedPrompt.title);
});

test('dirty edit with an external timestamp change becomes a stale conflict', () => {
  const prompt = createBasePrompt();
  const dirtyState = promptEditorReducer(getEditingState(prompt), {
    type: 'field-updated',
    field: 'title',
    value: 'Unsaved local title',
  });
  const changedPrompt = {
    ...prompt,
    title: 'Externally changed title',
    updatedAt: '2026-05-01T00:02:00.000Z',
  };

  const nextState = promptEditorReducer(dirtyState, {
    type: 'incoming-prompts-received',
    prompts: [changedPrompt],
    savedPromptEcho: null,
    savingPromptId: null,
  });

  expect(nextState.form.title).toBe('Unsaved local title');
  expect(nextState.conflictState).toEqual({
    status: 'stale',
    reason: 'external-update',
    promptId: changedPrompt.id,
    message: EXTERNAL_CHANGE_MESSAGE,
    currentPrompt: changedPrompt,
  });
  expect(nextState.alertMessage).toBe(EXTERNAL_CHANGE_MESSAGE);
});

test('dirty edit with records-replaced preserves local fields and marks stale conflict', () => {
  const prompt = createBasePrompt();
  const dirtyTitleState = promptEditorReducer(getEditingState(prompt), {
    type: 'field-updated',
    field: 'title',
    value: 'Unsaved records-replaced title',
  });
  const dirtyContentState = promptEditorReducer(dirtyTitleState, {
    type: 'field-updated',
    field: 'content',
    value: 'Unsaved records-replaced body',
  });
  const dirtyPinnedState = promptEditorReducer(dirtyContentState, {
    type: 'field-updated',
    field: 'pinned',
    value: true,
  });
  const restoredPrompt = {
    ...prompt,
    title: 'Restored title with matching timestamps',
    content: 'Restored body with matching timestamps',
    charCount: 'Restored body with matching timestamps'.length,
  };

  const effect = getIncomingPromptEffect({
    state: dirtyPinnedState,
    prompts: [restoredPrompt],
    event: { reason: 'records-replaced' },
    savedPromptEcho: null,
    savingPromptId: null,
  });

  expect(effect).toEqual({ type: 'none' });

  const nextState = promptEditorReducer(dirtyPinnedState, {
    type: 'incoming-prompts-received',
    prompts: [restoredPrompt],
    event: { reason: 'records-replaced' },
    savedPromptEcho: null,
    savingPromptId: null,
  });

  expect(nextState.prompts).toEqual([restoredPrompt]);
  expect(nextState.form).toEqual({
    title: 'Unsaved records-replaced title',
    content: 'Unsaved records-replaced body',
    pinned: true,
  });
  expect(nextState.isDirty).toBe(true);
  expect(nextState.conflictState).toEqual({
    status: 'stale',
    reason: 'external-update',
    promptId: restoredPrompt.id,
    message: EXTERNAL_CHANGE_MESSAGE,
    currentPrompt: restoredPrompt,
  });
  expect(nextState.alertMessage).toBe(EXTERNAL_CHANGE_MESSAGE);
});

test('save echo and current saving prompt are not classified as external conflicts', () => {
  const prompt = createBasePrompt();
  const dirtyState = promptEditorReducer(getEditingState(prompt), {
    type: 'field-updated',
    field: 'content',
    value: 'Unsaved local body',
  });
  const savedPrompt = {
    ...prompt,
    title: 'Saved title',
    updatedAt: '2026-05-01T00:03:00.000Z',
    bodyUpdatedAt: '2026-05-01T00:03:00.000Z',
  };

  const echoState = promptEditorReducer(dirtyState, {
    type: 'incoming-prompts-received',
    prompts: [savedPrompt],
    savedPromptEcho: {
      promptId: savedPrompt.id,
      updatedAt: savedPrompt.updatedAt,
      bodyUpdatedAt: savedPrompt.bodyUpdatedAt,
    },
    savingPromptId: null,
  });

  expect(echoState.conflictState.status).toBe('idle');
  expect(echoState.alertMessage).toBeNull();

  const savingState = promptEditorReducer(dirtyState, {
    type: 'incoming-prompts-received',
    prompts: [savedPrompt],
    savedPromptEcho: null,
    savingPromptId: savedPrompt.id,
  });

  expect(savingState.conflictState.status).toBe('idle');
  expect(savingState.alertMessage).toBeNull();
});

test('deleting the edited prompt switches to create mode with delete recovery notice', () => {
  const prompt = createBasePrompt();
  const remainingPrompt = createPromptRecord({
    id: 'remaining-reducer-prompt',
    title: 'Remaining prompt',
    content: 'Remaining body',
    normalOrder: 2,
  });
  const state = getEditingState(prompt);

  const nextState = promptEditorReducer(state, {
    type: 'incoming-prompts-received',
    prompts: [remainingPrompt],
    savedPromptEcho: null,
    savingPromptId: null,
  });

  expect(nextState.mode).toEqual({ kind: 'create' });
  expect(nextState.activePrompt).toBeNull();
  expect(nextState.form).toEqual({
    title: '',
    content: '',
    pinned: false,
  });
  expect(nextState.notice).toBe(DELETE_RECOVERY_MESSAGE);
  expect(nextState.alertMessage).toBeNull();

  const deleteSuccessState = promptEditorReducer(state, {
    type: 'prompt-delete-succeeded',
    id: prompt.id,
    activeMode: state.mode,
  });

  expect(deleteSuccessState.mode).toEqual({ kind: 'create' });
  expect(deleteSuccessState.activePrompt).toBeNull();
  expect(deleteSuccessState.form).toEqual({
    title: '',
    content: '',
    pinned: false,
  });
  expect(deleteSuccessState.notice).toBe(DELETE_RECOVERY_MESSAGE);
  expect(deleteSuccessState.alertMessage).toBeNull();
});

test('dirty edit with records-replaced deletion preserves local form as create draft', () => {
  const prompt = createBasePrompt();
  const remainingPrompt = createPromptRecord({
    id: 'remaining-records-replaced-prompt',
    title: 'Remaining after replace',
    content: 'Remaining body',
    normalOrder: 2,
  });
  const dirtyTitleState = promptEditorReducer(getEditingState(prompt), {
    type: 'field-updated',
    field: 'title',
    value: 'Unsaved removed title',
  });
  const dirtyContentState = promptEditorReducer(dirtyTitleState, {
    type: 'field-updated',
    field: 'content',
    value: 'Unsaved removed body',
  });
  const dirtyPinnedState = promptEditorReducer(dirtyContentState, {
    type: 'field-updated',
    field: 'pinned',
    value: true,
  });

  const nextState = promptEditorReducer(dirtyPinnedState, {
    type: 'incoming-prompts-received',
    prompts: [remainingPrompt],
    event: { reason: 'records-replaced' },
    savedPromptEcho: null,
    savingPromptId: null,
  });

  expect(nextState.prompts).toEqual([remainingPrompt]);
  expect(nextState.mode).toEqual({ kind: 'create' });
  expect(nextState.activePrompt).toBeNull();
  expect(nextState.form).toEqual({
    title: 'Unsaved removed title',
    content: 'Unsaved removed body',
    pinned: true,
  });
  expect(nextState.errors).toEqual({});
  expect(nextState.isDirty).toBe(true);
  expect(nextState.bodyLoadState).toEqual({ status: 'idle' });
  expect(nextState.conflictState).toEqual({ status: 'idle' });
  expect(nextState.notice).toBe(DELETE_RECOVERY_MESSAGE);
  expect(nextState.alertMessage).toBeNull();
});

test('active pin conflict with unchanged body timestamp syncs editor metadata', () => {
  const prompt = createBasePrompt();
  const dirtyState = promptEditorReducer(getEditingState(prompt), {
    type: 'field-updated',
    field: 'title',
    value: 'Unsaved local title survives pin conflict',
  });
  const { content: _content, ...conflictMeta } = {
    ...prompt,
    pinned: true,
    pinnedOrder: 1,
    updatedAt: '2026-05-01T00:10:00.000Z',
    bodyUpdatedAt: prompt.bodyUpdatedAt,
  };

  const nextState = promptEditorReducer(dirtyState, {
    type: 'prompt-meta-conflicted',
    id: prompt.id,
    meta: conflictMeta,
    activeMode: dirtyState.mode,
    alertMessage: EXTERNAL_CHANGE_MESSAGE,
  });

  expect(nextState.activePrompt).toEqual({
    ...prompt,
    ...conflictMeta,
  });
  expect(nextState.mode).toEqual({
    kind: 'edit',
    promptId: prompt.id,
    expectedUpdatedAt: conflictMeta.updatedAt,
    expectedBodyUpdatedAt: conflictMeta.bodyUpdatedAt,
  });
  expect(nextState.form).toEqual({
    title: 'Unsaved local title survives pin conflict',
    content: prompt.content,
    pinned: true,
  });
  expect(nextState.conflictState).toEqual({
    status: 'stale',
    reason: 'external-update',
    promptId: prompt.id,
    message: EXTERNAL_CHANGE_MESSAGE,
    currentPrompt: conflictMeta,
  });
});

test('active pin conflict with changed body timestamp keeps stale editor contract', () => {
  const prompt = createBasePrompt();
  const state = getEditingState(prompt);
  const { content: _content, ...conflictMeta } = {
    ...prompt,
    pinned: true,
    pinnedOrder: 1,
    updatedAt: '2026-05-01T00:11:00.000Z',
    bodyUpdatedAt: '2026-05-01T00:12:00.000Z',
  };

  const nextState = promptEditorReducer(state, {
    type: 'prompt-meta-conflicted',
    id: prompt.id,
    meta: conflictMeta,
    activeMode: state.mode,
    alertMessage: EXTERNAL_CHANGE_MESSAGE,
  });

  expect(nextState.activePrompt).toEqual(prompt);
  expect(nextState.mode).toEqual(state.mode);
  expect(nextState.form.pinned).toBe(prompt.pinned);
  expect(nextState.conflictState).toEqual({
    status: 'stale',
    reason: 'external-update',
    promptId: prompt.id,
    message: EXTERNAL_CHANGE_MESSAGE,
    currentPrompt: conflictMeta,
  });
  expect(nextState.alertMessage).toBe(EXTERNAL_CHANGE_MESSAGE);
});

test('active pin conflict with changed title keeps stale editor contract', () => {
  const prompt = createBasePrompt();
  const state = getEditingState(prompt);
  const { content: _content, ...conflictMeta } = {
    ...prompt,
    title: 'External title changed while body timestamp stayed put',
    pinned: true,
    pinnedOrder: 1,
    updatedAt: '2026-05-01T00:13:00.000Z',
    bodyUpdatedAt: prompt.bodyUpdatedAt,
  };

  const nextState = promptEditorReducer(state, {
    type: 'prompt-meta-conflicted',
    id: prompt.id,
    meta: conflictMeta,
    activeMode: state.mode,
    alertMessage: EXTERNAL_CHANGE_MESSAGE,
  });

  expect(nextState.prompts).toEqual([conflictMeta]);
  expect(nextState.activePrompt).toEqual(prompt);
  expect(nextState.mode).toEqual(state.mode);
  expect(nextState.form).toEqual({
    title: prompt.title,
    content: prompt.content,
    pinned: prompt.pinned,
  });
  expect(nextState.conflictState).toEqual({
    status: 'stale',
    reason: 'external-update',
    promptId: prompt.id,
    message: EXTERNAL_CHANGE_MESSAGE,
    currentPrompt: conflictMeta,
  });
  expect(nextState.alertMessage).toBe(EXTERNAL_CHANGE_MESSAGE);
});
