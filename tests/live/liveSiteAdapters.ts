import type { Page } from '@playwright/test';

import {
  GEMINI_COMPOSER_SELECTOR,
  getComposerText,
} from '../playwright/promptit';

const CHATGPT_COMPOSER_SELECTOR = [
  'textarea#prompt-textarea',
  'textarea[data-testid="prompt-textarea"]',
  'div#prompt-textarea[contenteditable="true"][role="textbox"]',
  'div[data-testid="prompt-textarea"][contenteditable="true"][role="textbox"]',
  'div#prompt-textarea[contenteditable="true"][data-lexical-editor="true"]',
  'div[data-testid="prompt-textarea"][contenteditable="true"][data-lexical-editor="true"]',
  'div#prompt-textarea.ProseMirror[contenteditable="true"]',
  'div[data-testid="prompt-textarea"].ProseMirror[contenteditable="true"]',
].join(', ');

export type LiveSiteAdapter = {
  readonly name: 'ChatGPT' | 'Gemini';
  readonly startUrl: string;
  readonly origin: string;
  readonly composerSelector: string;
  readComposerText(page: Page): Promise<string>;
};

export const chatgptLiveSite: LiveSiteAdapter = {
  name: 'ChatGPT',
  startUrl: 'https://chatgpt.com/',
  origin: 'https://chatgpt.com',
  composerSelector: CHATGPT_COMPOSER_SELECTOR,
  async readComposerText(page) {
    return await getComposerText(page, CHATGPT_COMPOSER_SELECTOR);
  },
};

export const geminiLiveSite: LiveSiteAdapter = {
  name: 'Gemini',
  startUrl: 'https://gemini.google.com/app',
  origin: 'https://gemini.google.com',
  composerSelector: GEMINI_COMPOSER_SELECTOR,
  async readComposerText(page) {
    return await getComposerText(page, GEMINI_COMPOSER_SELECTOR);
  },
};
