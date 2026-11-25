// Minimal react-native mock. The native module object is shared through globalThis so tests can swap
// its methods after CallManager captured it at import time.
globalThis.__nativeCallModule ??= {};

export const Platform = { OS: 'android', Version: 34, select: (o) => o.android ?? o.default };
export const NativeModules = { CallRecordingModule: globalThis.__nativeCallModule };
export class NativeEventEmitter {
  addListener() { return { remove() {} }; }
}
export const PermissionsAndroid = {
  PERMISSIONS: {},
  check: async () => true,
  requestMultiple: async () => ({}),
};
export const Alert = { alert() {} };
// A type in RN, imported without `type` by CallManager; type stripping keeps the import, so export a value
export const Permission = undefined;
