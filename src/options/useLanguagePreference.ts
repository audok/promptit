import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  getBrowserUiLanguage,
  readLanguagePreference,
  resolveLocale,
  subscribeToLanguagePreference,
  writeLanguagePreference,
  type LanguagePreference,
  type Locale,
} from '../shared/i18n';

export type UseLanguagePreferenceResult = {
  locale: Locale;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => Promise<void>;
};

export function useLanguagePreference(): UseLanguagePreferenceResult {
  const [preference, setPreferenceState] =
    useState<LanguagePreference>('system');
  const [uiLanguage] = useState<string | undefined>(() => getBrowserUiLanguage());

  useEffect(() => {
    let cancelled = false;

    void readLanguagePreference()
      .then((nextPreference) => {
        if (!cancelled) {
          setPreferenceState(nextPreference);
        }
      })
      .catch((error) => {
        console.error('[promptit] Failed to read language preference.', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeToLanguagePreference(setPreferenceState);
  }, []);

  const locale = resolveLocale({
    preference,
    uiLanguage,
  });

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setPreference = useCallback(
    async (nextPreference: LanguagePreference): Promise<void> => {
      setPreferenceState(nextPreference);
      await writeLanguagePreference(nextPreference);
    },
    [],
  );

  return {
    locale,
    preference,
    setPreference,
  };
}
