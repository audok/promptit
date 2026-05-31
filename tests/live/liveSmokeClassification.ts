import type { TestInfo } from '@playwright/test';

export type LiveFailureKind =
  | 'environment-blocked'
  | 'actual-site-behavior-failure';

export class LiveSmokeError extends Error {
  readonly kind: LiveFailureKind;
  readonly site: string;
  readonly step: string;

  constructor(
    kind: LiveFailureKind,
    site: string,
    step: string,
    message: string,
    cause?: unknown,
  ) {
    super(`[promptit-live:${kind}] ${site}: ${step}: ${message}`, {
      cause,
    });
    this.name = 'LiveSmokeError';
    this.kind = kind;
    this.site = site;
    this.step = step;
  }
}

export function environmentBlocked(
  site: string,
  step: string,
  message: string,
  cause?: unknown,
): LiveSmokeError {
  return new LiveSmokeError(
    'environment-blocked',
    site,
    step,
    message,
    cause,
  );
}

export function behaviorFailure(
  site: string,
  step: string,
  message: string,
  cause?: unknown,
): LiveSmokeError {
  return new LiveSmokeError(
    'actual-site-behavior-failure',
    site,
    step,
    message,
    cause,
  );
}

function annotateLiveFailure(testInfo: TestInfo, error: LiveSmokeError): void {
  testInfo.annotations.push({
    type: 'promptit-live-classification',
    description: `${error.kind}: ${error.site}: ${error.step}`,
  });
}

export async function runLiveStep<T>(
  testInfo: TestInfo,
  options: { site: string; step: string; behaviorMessage: string },
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof LiveSmokeError) {
      annotateLiveFailure(testInfo, error);
      throw error;
    }

    const classifiedError = behaviorFailure(
      options.site,
      options.step,
      options.behaviorMessage,
      error,
    );
    annotateLiveFailure(testInfo, classifiedError);
    throw classifiedError;
  }
}
