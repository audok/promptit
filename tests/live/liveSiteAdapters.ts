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

const HARD_BLOCKER_PATTERNS: Array<{
  readonly pattern: RegExp;
  readonly reason: string;
}> = [
  {
    pattern: /verify (?:you are|that you are|it's) human|checking your browser|human verification|captcha|recaptcha|cloudflare|unusual traffic/i,
    reason: 'bot or human verification screen is visible',
  },
  {
    pattern: /not available|access denied|currently unavailable|unsupported (?:country|region)/i,
    reason: 'site is unavailable or access denied in this environment',
  },
  {
    pattern: /try again later|temporarily unavailable|service unavailable|too many requests|rate limit|something went wrong/i,
    reason: 'service is temporarily unavailable or rate limited',
  },
];
const SOFT_BLOCKER_PATTERNS: Array<{
  readonly pattern: RegExp;
  readonly reason: string;
}> = [
  {
    pattern: /before you continue|accept all|reject all|i agree|cookie|cookies|consent/i,
    reason: 'cookie or consent screen is visible and no public composer affordance is available after waiting for the composer',
  },
  {
    pattern: /sign in|log in|login|continue with google|get started|use your google account/i,
    reason: 'login or sign-in wall is visible and no public composer affordance is available after waiting for the composer',
  },
];
const AUTH_PROMPT_PATTERN =
  /sign in|log in|login|continue with google|get started|use your google account/i;
const PUBLIC_COMPOSER_AFFORDANCE_PATTERN =
  /ask anything|what(?:'|’)?s on your mind today|message chatgpt|ask gemini|enter a prompt|type a prompt/i;
const SOFT_BLOCKER_COMPOSER_WAIT_MS = 5_000;

export type LiveSiteAdapter = {
  readonly name: 'ChatGPT' | 'Gemini';
  readonly startUrl: string;
  readonly origin: string;
  readonly composerSelector: string;
  readonly submittedTextSelector?: string;
  detectEnvironmentBlockers(page: Page): Promise<string | null>;
  readComposerText(page: Page): Promise<string>;
  readSubmittedText(page: Page): Promise<string | null>;
};

async function hasVisibleComposer(
  page: Page,
  composerSelector: string,
  timeout = 3_000,
): Promise<boolean> {
  const composer = page.locator(composerSelector).first();

  await composer.waitFor({ state: 'visible', timeout }).catch(() => null);

  return await composer.isVisible().catch(() => false);
}

async function readBodyText(page: Page): Promise<string> {
  return await page
    .locator('body')
    .innerText({ timeout: 1_000 })
    .catch(() => '');
}

async function readFrameBlockerText(page: Page): Promise<string> {
  return await page
    .locator('iframe')
    .evaluateAll((frames) =>
      frames
        .map((frame) => {
          const title = frame.getAttribute('title') ?? '';
          const src = frame.getAttribute('src') ?? '';

          return `${title} ${src}`.trim();
        })
        .join('\n'),
    )
    .catch(() => '');
}

async function readAffordanceAttributeText(page: Page): Promise<string> {
  return await page
    .locator('[placeholder], [aria-label], [data-placeholder]')
    .evaluateAll((elements) =>
      elements
        .map((element) =>
          [
            element.getAttribute('placeholder'),
            element.getAttribute('aria-label'),
            element.getAttribute('data-placeholder'),
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join('\n'),
    )
    .catch(() => '');
}

async function detectCommonEnvironmentBlockers(
  page: Page,
  composerSelector: string,
): Promise<string | null> {
  if (await hasVisibleComposer(page, composerSelector, 1_000)) {
    return null;
  }

  let bodyText = await readBodyText(page);
  let title = await page.title().catch(() => '');
  let frameText = await readFrameBlockerText(page);
  let affordanceText = await readAffordanceAttributeText(page);
  let observableText = `${title}\n${bodyText}\n${frameText}\n${affordanceText}`;

  for (const { pattern, reason } of HARD_BLOCKER_PATTERNS) {
    if (pattern.test(observableText)) {
      return reason;
    }
  }

  const hasSoftBlocker = SOFT_BLOCKER_PATTERNS.some(({ pattern }) =>
    pattern.test(observableText),
  );

  if (!hasSoftBlocker) {
    return null;
  }

  if (
    await hasVisibleComposer(
      page,
      composerSelector,
      SOFT_BLOCKER_COMPOSER_WAIT_MS,
    )
  ) {
    return null;
  }

  bodyText = await readBodyText(page);
  title = await page.title().catch(() => '');
  frameText = await readFrameBlockerText(page);
  affordanceText = await readAffordanceAttributeText(page);
  observableText = `${title}\n${bodyText}\n${frameText}\n${affordanceText}`;

  for (const { pattern, reason } of HARD_BLOCKER_PATTERNS) {
    if (pattern.test(observableText)) {
      return reason;
    }
  }

  if (PUBLIC_COMPOSER_AFFORDANCE_PATTERN.test(observableText)) {
    return null;
  }

  if (AUTH_PROMPT_PATTERN.test(observableText)) {
    return 'login or sign-in wall is visible and no public composer affordance is available after waiting for the composer';
  }

  for (const { pattern, reason } of SOFT_BLOCKER_PATTERNS) {
    if (pattern.test(observableText)) {
      return reason;
    }
  }

  return null;
}

export const chatgptLiveSite: LiveSiteAdapter = {
  name: 'ChatGPT',
  startUrl: 'https://chatgpt.com/',
  origin: 'https://chatgpt.com',
  composerSelector: CHATGPT_COMPOSER_SELECTOR,
  async detectEnvironmentBlockers(page) {
    return await detectCommonEnvironmentBlockers(
      page,
      CHATGPT_COMPOSER_SELECTOR,
    );
  },
  async readComposerText(page) {
    return await getComposerText(page, CHATGPT_COMPOSER_SELECTOR);
  },
  async readSubmittedText() {
    return null;
  },
};

export const geminiLiveSite: LiveSiteAdapter = {
  name: 'Gemini',
  startUrl: 'https://gemini.google.com/app',
  origin: 'https://gemini.google.com',
  composerSelector: GEMINI_COMPOSER_SELECTOR,
  async detectEnvironmentBlockers(page) {
    return await detectCommonEnvironmentBlockers(
      page,
      GEMINI_COMPOSER_SELECTOR,
    );
  },
  async readComposerText(page) {
    return await getComposerText(page, GEMINI_COMPOSER_SELECTOR);
  },
  async readSubmittedText() {
    return null;
  },
};
