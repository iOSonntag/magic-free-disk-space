export type ConcurrencyLimit = <TValue>(task: () => Promise<TValue>) => Promise<TValue>;

/**
 * Returns a runner that starts at most `maxConcurrent` tasks at once and queues the rest in
 * arrival order. A task holds its slot only while it runs, so nested use cannot deadlock.
 */
export function createConcurrencyLimit(params: { maxConcurrent: number }): ConcurrencyLimit {
  const waitingStarts: (() => void)[] = [];
  let waitingHead = 0;
  let activeCount = 0;

  function acquireSlot(): Promise<void> {
    if (activeCount < params.maxConcurrent) {
      activeCount += 1;

      return Promise.resolve();
    }

    return new Promise((resolve) => {
      waitingStarts.push(resolve);
    });
  }

  function releaseSlot(): void {
    const nextStart = waitingStarts[waitingHead];

    if (nextStart === undefined) {
      activeCount -= 1;

      return;
    }

    waitingHead += 1;

    // Drops the started entries now and then, so the queue does not grow without end.
    if (waitingHead > 1024 && waitingHead * 2 > waitingStarts.length) {
      waitingStarts.splice(0, waitingHead);
      waitingHead = 0;
    }

    nextStart();
  }

  return async (task) => {
    await acquireSlot();

    try {
      return await task();
    } finally {
      releaseSlot();
    }
  };
}
