import type { TriggerContext } from '../adapters/base';
import type { PromptItem } from '../prompt/schema';

export type SessionStatus = 'idle' | 'armed' | 'open' | 'closing';

export type CloseReason =
  | 'escape'
  | 'backspace'
  | 'blur'
  | 'outside-click'
  | 'scroll'
  | 'resize'
  | 'dom-removed'
  | 'typing'
  | 'copy'
  | 'insert'
  | 'open-options';

export type PopupSessionState = {
  status: SessionStatus;
  activeInput: HTMLElement | null;
  triggerContext: TriggerContext | null;
  items: PromptItem[];
  activeIndex: number;
  closeReason: CloseReason | null;
  armedTimer: number | null;
  triggerRequestId: number;
  isComposing: boolean;
  isInternalChange: boolean;
  isBusy: boolean;
  disconnectInputObserver: (() => void) | null;
};

export function createSessionState(): PopupSessionState {
  return {
    status: 'idle',
    activeInput: null,
    triggerContext: null,
    items: [],
    activeIndex: 0,
    closeReason: null,
    armedTimer: null,
    triggerRequestId: 0,
    isComposing: false,
    isInternalChange: false,
    isBusy: false,
    disconnectInputObserver: null,
  };
}

export function setActiveIndex(
  session: PopupSessionState,
  nextIndex: number,
): void {
  session.activeIndex = nextIndex;
}

export function resetSessionState(session: PopupSessionState): void {
  if (session.armedTimer !== null) {
    window.clearTimeout(session.armedTimer);
  }

  session.disconnectInputObserver?.();
  session.status = 'idle';
  session.activeInput = null;
  session.triggerContext = null;
  session.items = [];
  session.activeIndex = 0;
  session.closeReason = null;
  session.armedTimer = null;
  session.isBusy = false;
  session.disconnectInputObserver = null;
}
