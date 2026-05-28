export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCE_STORAGE_KEY = 'promptit:themePreference';

const DEFAULT_THEME: ResolvedTheme = 'light';

export function isThemePreference(
  value: unknown,
): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === 'light' || value === 'dark';
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return DEFAULT_THEME;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function resolveThemePreference(input: {
  preference: ThemePreference;
  systemTheme?: ResolvedTheme;
}): ResolvedTheme {
  if (input.preference !== 'system') {
    return input.preference;
  }

  return input.systemTheme ?? getSystemTheme();
}

export async function readThemePreference(): Promise<ThemePreference> {
  if (!hasStorageApi()) {
    return 'system';
  }

  const result = await chrome.storage.local.get(THEME_PREFERENCE_STORAGE_KEY);
  const value = result[THEME_PREFERENCE_STORAGE_KEY];

  return isThemePreference(value) ? value : 'system';
}

export async function writeThemePreference(
  preference: ThemePreference,
): Promise<void> {
  if (!hasStorageApi()) {
    return;
  }

  await chrome.storage.local.set({
    [THEME_PREFERENCE_STORAGE_KEY]: preference,
  });
}

export function subscribeToThemePreference(
  listener: (preference: ThemePreference) => void,
): () => void {
  if (!hasStorageApi()) {
    return () => {};
  }

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !(THEME_PREFERENCE_STORAGE_KEY in changes)) {
      return;
    }

    const nextPreference = changes[THEME_PREFERENCE_STORAGE_KEY].newValue;
    listener(isThemePreference(nextPreference) ? nextPreference : 'system');
  };

  chrome.storage.onChanged.addListener(handleChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleChange);
  };
}

export function subscribeToSystemTheme(
  listener: (theme: ResolvedTheme) => void,
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    listener(query.matches ? 'dark' : 'light');
  };

  if (query.addEventListener) {
    query.addEventListener('change', handleChange);
    return () => {
      query.removeEventListener('change', handleChange);
    };
  }

  query.addListener(handleChange);
  return () => {
    query.removeListener(handleChange);
  };
}

export function applyThemeAttribute(
  element: HTMLElement,
  theme: ResolvedTheme,
): void {
  element.dataset.promptitTheme = theme;
  element.style.colorScheme = theme;
}

function hasStorageApi(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
