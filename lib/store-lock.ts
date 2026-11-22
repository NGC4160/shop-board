/** Same-instance queue so two PUTs cannot both pass a revision check. */
export function createWriteLock() {
  let chain: Promise<void> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** Blob `ifMatch` failed because another instance wrote first. */
export class StoreRaceError extends Error {
  constructor() {
    super("The stored document changed during save");
    this.name = "StoreRaceError";
  }
}
