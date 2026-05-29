import { getPromptitFontStyles } from './fonts';
import { type ResolvedTheme } from '../shared/theme';
import themeStyles from '../shared/theme.css?inline';

let host: HTMLDivElement | null = null;
let hideTimer: number | null = null;
let currentTheme: ResolvedTheme = 'light';

function ensureToastHost(): {
  content: HTMLDivElement;
} {
  if (host?.isConnected && host.shadowRoot) {
    const content = host.shadowRoot.querySelector<HTMLDivElement>('[data-role="toast-content"]');

    if (content) {
      applyToastTheme(content);
      return { content };
    }
  }

  host?.remove();
  host = document.createElement('div');
  host.setAttribute('data-promptit-toast-host', 'true');
  host.style.position = 'fixed';
  host.style.left = '50%';
  host.style.bottom = '28px';
  host.style.zIndex = '2147483647';
  host.style.transform = 'translateX(-50%)';
  host.style.pointerEvents = 'none';

  const shadowRoot = host.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      ${themeStyles}
      ${getPromptitFontStyles()}

      .promptit-toast {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        max-width: min(340px, calc(100vw - 32px));
        min-height: 34px;
        padding: 6px 16px;
        border: 1px solid var(--promptit-toast-success-border);
        border-radius: 999px;
        background: var(--promptit-toast-success-background);
        box-shadow: var(--promptit-toast-shadow);
        color: var(--promptit-toast-success-text);
        font-family: var(--promptit-font-family);
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        backdrop-filter: blur(32px) saturate(170%);
        -webkit-backdrop-filter: blur(32px) saturate(170%);
        opacity: 0;
        transform: translateY(6px);
        transition:
          opacity 140ms ease,
          transform 140ms ease,
          color 140ms ease,
          background-color 140ms ease,
          border-color 140ms ease;
      }

      .promptit-toast[data-variant="error"] {
        border-color: var(--promptit-toast-error-border);
        background: var(--promptit-toast-error-background);
        color: var(--promptit-toast-error-text);
      }

      .promptit-toast.is-visible {
        opacity: 1;
        transform: translateY(0);
      }

      @media (prefers-reduced-motion: reduce) {
        .promptit-toast {
          transform: none;
          transition:
            opacity 140ms ease,
            color 140ms ease,
            background-color 140ms ease,
            border-color 140ms ease;
        }

        .promptit-toast.is-visible {
          transform: none;
        }
      }
    </style>
    <div class="promptit-toast" data-role="toast-content"></div>
  `;

  document.documentElement.append(host);
  const content =
    shadowRoot.querySelector<HTMLDivElement>('[data-role="toast-content"]');

  if (!content) {
    throw new Error('promptit toast content element could not be created.');
  }

  applyToastTheme(content);
  return { content };
}

function applyToastTheme(content: HTMLDivElement): void {
  content.dataset.promptitTheme = currentTheme;
  content.style.colorScheme = currentTheme;
}

function applyToastAccessibility(
  content: HTMLDivElement,
  variant: 'success' | 'error',
): void {
  content.setAttribute('aria-atomic', 'true');

  if (variant === 'error') {
    content.setAttribute('role', 'alert');
    content.setAttribute('aria-live', 'assertive');
    return;
  }

  content.setAttribute('role', 'status');
  content.setAttribute('aria-live', 'polite');
}

export function showToast(
  message: string,
  variant: 'success' | 'error' = 'success',
): void {
  const { content } = ensureToastHost();
  applyToastTheme(content);
  applyToastAccessibility(content, variant);
  content.dataset.variant = variant;
  content.textContent = message;
  content.classList.remove('is-visible');

  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
  }

  requestAnimationFrame(() => {
    content.classList.add('is-visible');
  });

  hideTimer = window.setTimeout(() => {
    content.classList.remove('is-visible');
  }, 1800);
}

export function showCopyToast(message: string, variant: 'success' | 'error' = 'success'): void {
  showToast(message, variant);
}

export function setToastTheme(theme: ResolvedTheme): void {
  currentTheme = theme;

  if (!host?.isConnected || !host.shadowRoot) {
    return;
  }

  const content = host.shadowRoot.querySelector<HTMLDivElement>('[data-role="toast-content"]');

  if (content) {
    applyToastTheme(content);
  }
}
