/**
 * Where saved data physically lives. The web build uses localStorage; the Android app (stage 9) swaps in
 * Capacitor Preferences behind the same interface, so nothing else in the game changes.
 */
export interface StorageBackend {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const webStorage: StorageBackend = {
  async read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null; // private mode or storage disabled
    }
  },
  async write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota or disabled storage: the game keeps running with in-memory progress.
    }
  },
  async remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

let backend: StorageBackend = webStorage;

export function setStorageBackend(next: StorageBackend): void {
  backend = next;
}

export function storage(): StorageBackend {
  return backend;
}
