import { expect, test } from '@playwright/test';

import { openPromptDatabase } from '../../src/prompt/indexed-db';

test('blocked prompt database open resets cached promise so the next open retries', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'indexedDB',
  );
  const openRequests: IDBOpenDBRequest[] = [];
  const fakeIndexedDB = {
    open: () => {
      const request = {} as IDBOpenDBRequest;
      openRequests.push(request);
      return request;
    },
  } as Pick<IDBFactory, 'open'>;

  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: fakeIndexedDB,
  });

  try {
    const firstOpen = openPromptDatabase();

    expect(openRequests).toHaveLength(1);
    openRequests[0].onblocked?.call(
      openRequests[0],
      {} as IDBVersionChangeEvent,
    );
    await expect(firstOpen).rejects.toThrow(
      'Prompt database upgrade is blocked.',
    );

    const secondOpen = openPromptDatabase();

    expect(openRequests).toHaveLength(2);
    openRequests[1].onblocked?.call(
      openRequests[1],
      {} as IDBVersionChangeEvent,
    );
    await expect(secondOpen).rejects.toThrow(
      'Prompt database upgrade is blocked.',
    );
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'indexedDB', originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  }
});
