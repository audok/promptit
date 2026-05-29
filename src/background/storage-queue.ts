let storageRequestQueue: Promise<void> = Promise.resolve();

export function enqueueStorageRequest<T>(
  action: () => Promise<T>,
): Promise<T> {
  const nextRun = storageRequestQueue.then(action, action);

  storageRequestQueue = nextRun.then(
    () => undefined,
    () => undefined,
  );

  return nextRun;
}
