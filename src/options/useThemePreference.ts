import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  applyThemeAttribute,
  getSystemTheme,
  readThemePreference,
  resolveThemePreference,
  subscribeToSystemTheme,
  subscribeToThemePreference,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../shared/theme';

export type UseThemePreferenceResult = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

export function useThemePreference(): UseThemePreferenceResult {
  const [preference, setPreferenceState] =
    useState<ThemePreference>('system');
  const [systemTheme, setSystemTheme] =
    useState<ResolvedTheme>(() => getSystemTheme());

  useEffect(() => {
    let cancelled = false;

    void readThemePreference()
      .then((nextPreference) => {
        if (!cancelled) {
          setPreferenceState(nextPreference);
        }
      })
      .catch((error) => {
        console.error('[promptit] Failed to read theme preference.', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeToThemePreference(setPreferenceState);
  }, []);

  useEffect(() => {
    return subscribeToSystemTheme(setSystemTheme);
  }, []);

  const resolvedTheme = resolveThemePreference({
    preference,
    systemTheme,
  });

  useEffect(() => {
    applyThemeAttribute(document.documentElement, resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback(
    async (nextPreference: ThemePreference): Promise<void> => {
      setPreferenceState(nextPreference);
      await writeThemePreference(nextPreference);
    },
    [],
  );

  return {
    preference,
    resolvedTheme,
    setPreference,
  };
}
