// Minimal expo-file-system (legacy + new API) mock. Every file "exists"; tests can override via globalThis.__fs.
const fs = () => (globalThis.__fs ??= {});

export const cacheDirectory = 'file:///cache/';
export const getInfoAsync = async (uri) => (fs().getInfoAsync ? fs().getInfoAsync(uri) : { exists: true, uri });
export const readDirectoryAsync = async (uri) => (fs().readDirectoryAsync ? fs().readDirectoryAsync(uri) : []);
export const deleteAsync = async () => {};
export const StorageAccessFramework = {
  readDirectoryAsync: async (uri) => (fs().safReadDirectoryAsync ? fs().safReadDirectoryAsync(uri) : []),
  requestDirectoryPermissionsAsync: async () => ({ granted: false }),
};
export class Directory {
  constructor(uri) { this.uri = uri; }
  list() { return []; }
}
export class File {
  constructor(uri) { this.uri = uri; }
}
