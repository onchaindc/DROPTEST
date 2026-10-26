"use client";

/**
 * Small sync layer for values that live in browser storage (report
 * snapshots in sessionStorage, studio scenarios in localStorage).
 *
 * React reads them with useSyncExternalStore, which keeps hydration
 * safe: the server renders the fallback, the browser hydrates with it
 * and then switches to the stored value instead of triggering a
 * hydration mismatch. Writes go through notifyStorageChanged so same
 * tab updates refresh subscribers immediately, and the `storage`
 * event covers cross-tab changes.
 */

const listeners = new Set<() => void>();

export function subscribeToStorage(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

/** Call once after writing to storage, so subscribers re-read it. */
export function notifyStorageChanged(): void {
  for (const listener of Array.from(listeners)) listener();
}

export interface StableReaderOptions<T> {
  /** Selects the Storage object to read from. */
  storage: () => Storage;
  key: string;
  /** Parse a stored raw string. Throw safely: a failed parse reads as null. */
  parse: (raw: string) => T;
  /** Value used when the key is unset (and as the server snapshot). */
  empty: () => T;
}

/**
 * Build a referentially stable reader: repeated calls return the same
 * object until the raw stored string changes, which is what
 * useSyncExternalStore requires to avoid render loops.
 */
export function createStableReader<T>(options: StableReaderOptions<T>): () => T {
  let lastRaw: string | null | undefined = undefined;
  let lastValue: T = options.empty();
  return () => {
    let raw: string | null;
    try {
      raw = options.storage().getItem(options.key);
    } catch {
      raw = null;
    }
    if (raw !== lastRaw) {
      lastRaw = raw;
      if (raw === null) {
        lastValue = options.empty();
      } else {
        try {
          lastValue = options.parse(raw);
        } catch {
          lastValue = options.empty();
        }
      }
    }
    return lastValue;
  };
}

export function readStoredJson<T>(
  storage: () => Storage,
  key: string,
): T | null {
  try {
    const raw = storage().getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
