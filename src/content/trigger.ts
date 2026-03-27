import type { PopupSessionState } from './session';

export const TRIGGER_SEQUENCE = '/ ';
export const TRIGGER_DEBOUNCE_MS = 100;

export function clearTriggerArm(session: PopupSessionState): void {
  if (session.armedTimer !== null) {
    window.clearTimeout(session.armedTimer);
    session.armedTimer = null;
  }

  if (session.status === 'armed') {
    session.status = 'idle';
  }
}

export function armTrigger(
  session: PopupSessionState,
  runCheck: (requestId: number) => void,
): void {
  clearTriggerArm(session);
  session.status = 'armed';
  session.triggerRequestId += 1;
  const requestId = session.triggerRequestId;
  session.armedTimer = window.setTimeout(() => {
    session.armedTimer = null;
    runCheck(requestId);
  }, TRIGGER_DEBOUNCE_MS);
}
