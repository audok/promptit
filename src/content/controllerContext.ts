import type { BaseAdapter } from '../adapters/base';
import type { Locale } from '../shared/i18n';
import type { ResolvedTheme } from '../shared/theme';
import type { PromptPopup } from './popup';
import type { PopupSessionState } from './session';

export type ContentControllerContext = {
  adapter: BaseAdapter;
  popup: PromptPopup;
  session: PopupSessionState;
  getLocale: () => Locale;
  getTheme: () => ResolvedTheme;
};
