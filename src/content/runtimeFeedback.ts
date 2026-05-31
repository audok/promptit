import {
  translate,
  translateRuntimeMessage,
  type I18nKey,
  type Locale,
  type RuntimeMessageDescriptor,
} from '../shared/i18n';
import { isPromptitRuntimeError } from './runtimeClient';

export function getContentRuntimeErrorToastMessage(
  error: unknown,
  locale: Locale,
  fallbackKey: I18nKey,
): string {
  if (isPromptitRuntimeError(error)) {
    return getContentRuntimeResponseToastMessage(
      locale,
      error.messageDescriptor,
      error.message,
      fallbackKey,
    );
  }

  return translate(locale, fallbackKey);
}

export function getContentRuntimeResponseToastMessage(
  locale: Locale,
  descriptor: RuntimeMessageDescriptor | undefined,
  fallback: string,
  fallbackKey: I18nKey,
): string {
  return translateRuntimeMessage(
    locale,
    descriptor,
    fallback.trim().length > 0
      ? fallback
      : translate(locale, fallbackKey),
  );
}
