import { getPromptitFontStyles } from './fonts';

let host: HTMLDivElement | null = null;
let hideTimer: number | null = null;

function ensureToastHost(): {
  content: HTMLDivElement;
} {
  if (host?.isConnected && host.shadowRoot) {
    const content = host.shadowRoot.querySelector<HTMLDivElement>('[data-role="toast-content"]');

    if (content) {
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

      ${getPromptitFontStyles()}

      .promptit-toast {
        display: inline-flex;
        align-items: center;
        min-width: 220px;
        max-width: min(360px, calc(100vw - 32px));
        padding: 12px 16px;
        border-radius: 18px;
        background: rgba(24, 24, 27, 0.92);
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);
        color: white;
        font-family: var(--promptit-font-family);
        font-size: 13px;
        line-height: 1.35;
        opacity: 0;
        transform: translateY(8px);
        transition:
          opacity 140ms ease,
          transform 140ms ease,
          background-color 140ms ease;
      }

      .promptit-toast[data-variant="error"] {
        background: rgba(127, 29, 29, 0.94);
      }

      .promptit-toast.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
    </style>
    <div class="promptit-toast" data-role="toast-content"></div>
  `;

  document.documentElement.append(host);
  const content =
    shadowRoot.querySelector<HTMLDivElement>('[data-role="toast-content"]');

  if (!content) {
    throw new Error('Promptit toast content element could not be created.');
  }

  return { content };
}

export function showToast(
  message: string,
  variant: 'success' | 'error' = 'success',
): void {
  const { content } = ensureToastHost();
  content.textContent = message;
  content.dataset.variant = variant;
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
