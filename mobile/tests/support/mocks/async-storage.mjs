// In-memory AsyncStorage mock; tests reset it with globalThis.__storage.clear()
globalThis.__storage ??= new Map();
const store = globalThis.__storage;

export default {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => { store.set(k, String(v)); },
  removeItem: async (k) => { store.delete(k); },
};
