export type WriteConflictBoard = "jobs" | "parts";

export type WriteConflictNotice = {
  board: WriteConflictBoard;
  message: string;
};

export const JOBS_MERGED_MESSAGE =
  "The shop board changed on another device. Your edits were merged with the latest copy.";
export const JOBS_REFRESHED_MESSAGE =
  "The shop board changed on another device. This screen was updated.";
export const JOBS_GAVE_UP_MESSAGE =
  "Could not save because the shop board changed again. Your edits are still on this screen — edit once more to save them.";

export const PARTS_MERGED_MESSAGE =
  "The parts board changed on another device. Your edits were merged with the latest copy.";
export const PARTS_REFRESHED_MESSAGE =
  "The parts board changed on another device. This screen was updated.";
export const PARTS_GAVE_UP_MESSAGE =
  "Could not save because the parts board changed again. Your edits are still on this screen — edit once more to save them.";

type Listener = (notice: WriteConflictNotice) => void;
const listeners = new Set<Listener>();

export function subscribeWriteConflict(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyWriteConflict(notice: WriteConflictNotice) {
  for (const listener of listeners) listener(notice);
}
