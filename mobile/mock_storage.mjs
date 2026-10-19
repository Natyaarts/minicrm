const store = new Map();
const AsyncStorage = {
  getItem: async (k) => store.get(k) || null,
  setItem: async (k, v) => { store.set(k, String(v)); },
  removeItem: async (k) => { store.delete(k); },
  clear: async () => { store.clear(); },
  _getStore: () => store,
};
export default AsyncStorage;
