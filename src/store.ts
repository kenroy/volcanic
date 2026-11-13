/** Small remembered values (a panel height, which holiday countries are switched off). The plugin points this at Obsidian's own per-vault storage. */
export interface LocalStore {
  load(key: string): unknown;
  save(key: string, value: unknown): void;
}

const memory = new Map<string, unknown>();
let current: LocalStore = {
  load: (key) => memory.get(key) ?? null,
  save: (key, value) => {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
  },
};

export function useLocalStore(store: LocalStore): void {
  current = store;
}

export const localStore: LocalStore = {
  load: (key) => {
    try {
      return current.load(key);
    } catch {
      return null;
    }
  },
  save: (key, value) => {
    try {
      current.save(key, value);
    } catch {
      // Remembering is a convenience only.
    }
  },
};
