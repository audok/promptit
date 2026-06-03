import { resolveAdapterForUrl } from '../adapters/registry';
import {
  readLanguagePreference,
  subscribeToLanguagePreference,
} from '../shared/i18n';
import {
  readThemePreference,
  subscribeToSystemTheme,
  subscribeToThemePreference,
} from '../shared/theme';
import {
  applyContentLanguagePreference,
  applyContentSystemTheme,
  applyContentThemePreference,
  createContentAppearanceState,
  initializeContentLanguageState,
  initializeContentThemeState,
} from './contentAppearance';
import {
  registerDocumentListeners,
  registerWindowListeners,
} from './contentEventListeners';
import type { ContentControllerContext } from './controllerContext';
import {
  closePopup,
  handleCopy,
  handleSelection,
  handleTogglePinned,
  openOptionsFromPopup,
} from './popupActions';
import { PromptPopup } from './popup';
import {
  refreshOpenPopupLocalization,
  refreshOpenPopupTheme,
  updatePopupUserPrompts,
} from './popupView';
import { createSessionState, setActiveCell } from './session';
import { setToastTheme } from './toast';
import {
  markTestReady,
  registerTestListeners,
} from './testControls';
import {
  requestOpenOptionsPageFromContent,
  subscribeToContentPromptMetas,
} from './runtimeClient';

declare global {
  interface Window {
    __promptitContentInitialized__?: boolean;
  }
}

export function bootstrapContentScript(): void {
  const adapter = resolveAdapterForUrl(window.location.href);

  if (!adapter || window.__promptitContentInitialized__) {
    return;
  }

  window.__promptitContentInitialized__ = true;

  const appearance = createContentAppearanceState();
  initializeContentLanguageState(appearance);
  initializeContentThemeState(appearance);
  setToastTheme(appearance.theme);

  const session = createSessionState();
  let context: ContentControllerContext;
  const popup = new PromptPopup({
    onSelect: (item) => {
      void handleSelection(context, item);
    },
    onCopy: (item) => {
      void handleCopy(context, item);
    },
    onTogglePinned: (item) => {
      void handleTogglePinned(context, item);
    },
    onExit: () => {
      void closePopup(context, 'escape', true);
    },
    onOpenOptions: () => {
      void openOptionsFromPopup(context);
    },
    onActiveCellChange: (nextActiveCell) => {
      setActiveCell(session, nextActiveCell);
    },
  });

  context = {
    adapter,
    popup,
    session,
    getLocale: () => appearance.locale,
    getTheme: () => appearance.theme,
  };

  subscribeToContentPromptMetas(
    (nextItems) => {
      updatePopupUserPrompts(context, nextItems);
    },
    {
      shouldRefresh: () => session.status === 'open',
    },
  );
  void readLanguagePreference()
    .then((preference) => {
      if (applyContentLanguagePreference(appearance, preference)) {
        refreshOpenPopupLocalization(context);
      }
    })
    .catch((error) => {
      console.error('[promptit] Failed to read language preference.', error);
    });
  subscribeToLanguagePreference((preference) => {
    if (applyContentLanguagePreference(appearance, preference)) {
      refreshOpenPopupLocalization(context);
    }
  });
  void readThemePreference()
    .then((preference) => {
      if (applyContentThemePreference(appearance, preference)) {
        setToastTheme(appearance.theme);
        refreshOpenPopupTheme(context);
      }
    })
    .catch((error) => {
      console.error('[promptit] Failed to read theme preference.', error);
    });
  subscribeToThemePreference((preference) => {
    if (applyContentThemePreference(appearance, preference)) {
      setToastTheme(appearance.theme);
      refreshOpenPopupTheme(context);
    }
  });
  subscribeToSystemTheme((theme) => {
    if (applyContentSystemTheme(appearance, theme)) {
      setToastTheme(appearance.theme);
      refreshOpenPopupTheme(context);
    }
  });

  registerDocumentListeners(context);
  registerWindowListeners(context);
  registerTestListeners(requestOpenOptionsPageFromContent);
  markTestReady();
}
