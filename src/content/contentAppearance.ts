import {
  FALLBACK_LOCALE,
  getBrowserUiLanguage,
  resolveLocale,
  type LanguagePreference,
  type Locale,
} from '../shared/i18n';
import {
  getSystemTheme,
  resolveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../shared/theme';

export type ContentAppearanceState = {
  locale: Locale;
  uiLanguage?: string;
  themePreference: ThemePreference;
  theme: ResolvedTheme;
  systemTheme: ResolvedTheme;
};

export function createContentAppearanceState(): ContentAppearanceState {
  return {
    locale: FALLBACK_LOCALE,
    uiLanguage: undefined,
    themePreference: 'system',
    theme: 'light',
    systemTheme: 'light',
  };
}

export function initializeContentThemeState(
  state: ContentAppearanceState,
): void {
  state.systemTheme = getSystemTheme();
  state.theme = resolveThemePreference({
    preference: 'system',
    systemTheme: state.systemTheme,
  });
}

export function initializeContentLanguageState(
  state: ContentAppearanceState,
): void {
  state.uiLanguage = getBrowserUiLanguage();
  state.locale = resolveLocale({
    preference: 'system',
    uiLanguage: state.uiLanguage,
  });
}

export function applyContentLanguagePreference(
  state: ContentAppearanceState,
  preference: LanguagePreference,
): boolean {
  const nextLocale = resolveLocale({
    preference,
    uiLanguage: state.uiLanguage,
  });

  if (nextLocale === state.locale) {
    return false;
  }

  state.locale = nextLocale;
  return true;
}

export function applyContentThemePreference(
  state: ContentAppearanceState,
  preference: ThemePreference,
): boolean {
  state.themePreference = preference;
  const nextTheme = resolveThemePreference({
    preference,
    systemTheme: state.systemTheme,
  });

  if (nextTheme === state.theme) {
    return false;
  }

  state.theme = nextTheme;
  return true;
}

export function applyContentSystemTheme(
  state: ContentAppearanceState,
  theme: ResolvedTheme,
): boolean {
  state.systemTheme = theme;

  if (state.themePreference !== 'system') {
    return false;
  }

  const nextTheme = resolveThemePreference({
    preference: 'system',
    systemTheme: state.systemTheme,
  });

  if (nextTheme === state.theme) {
    return false;
  }

  state.theme = nextTheme;
  return true;
}
