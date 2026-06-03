import {
  PRODUCT_NAME,
  TRIGGER_SLASH,
  translate,
  type Locale,
} from '../shared/i18n';
import type { ResolvedTheme } from '../shared/theme';
import { getPromptitFontStyles } from './fonts';
import { renderSettingsIcon } from './popupIcons';
import popupStyles from './popup.css?inline';
import themeStyles from '../shared/theme.css?inline';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\'':
        return '&#39;';
      default:
        return character;
    }
  });
}

export function renderPopupShell(input: {
  isBusy: boolean;
  locale: Locale;
  savedCount: number;
  theme: ResolvedTheme;
}): string {
  const regionLabel = translate(input.locale, 'content.popup.regionLabel', {
    product: PRODUCT_NAME,
  });
  const savedCountLabel = translate(input.locale, 'content.popup.savedCount', {
    count: input.savedCount,
  });

  return `
      <style>${themeStyles}${popupStyles}${getPromptitFontStyles()}</style>
      <div class="promptit-root" data-promptit-theme="${input.theme}" style="color-scheme: ${input.theme}">
        <section
          class="promptit-card${input.isBusy ? ' is-busy' : ''}"
          role="region"
          aria-label="${escapeHtml(regionLabel)}"
          aria-busy="${input.isBusy ? 'true' : 'false'}"
          data-testid="promptit-popup"
        >
          <header class="promptit-header">
            <div class="promptit-header-label">
              <span class="promptit-header-slash">${TRIGGER_SLASH}</span>
              <span class="promptit-header-text">${PRODUCT_NAME}</span>
            </div>
            <button
              type="button"
              class="promptit-header-action"
              data-action="exit"
              tabindex="-1"
            >
              ${escapeHtml(translate(input.locale, 'content.popup.exitButton'))}
            </button>
          </header>
          <div
            class="promptit-list"
            data-role="prompt-list"
            data-testid="promptit-popup-list"
            role="list"
            aria-label="${escapeHtml(translate(input.locale, 'content.popup.listLabel'))}"
          ></div>
          <div
            class="promptit-sr-only"
            data-role="active-cell-status"
            aria-live="polite"
            aria-atomic="true"
          ></div>
          <footer class="promptit-footer">
            <span class="promptit-footer-label">${escapeHtml(savedCountLabel)}</span>
            <button
              type="button"
              class="promptit-footer-button"
              data-action="open-options"
              aria-label="${escapeHtml(translate(input.locale, 'content.popup.openSettingsAria'))}"
              tabindex="-1"
            >
              ${renderSettingsIcon()}
            </button>
          </footer>
        </section>
      </div>
    `;
}
