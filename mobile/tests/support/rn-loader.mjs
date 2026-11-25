// Test-only ESM loader: lets `node --test` import CallManager / SyncManager (TypeScript, React Native)
// by mapping RN / Expo / storage / API modules to in-memory mocks and resolving extensionless .ts imports.
// Registered from a test file with: register('./support/rn-loader.mjs', import.meta.url)
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mock = (file) => new URL(`./mocks/${file}`, import.meta.url).href;

const MOCKS = {
  'react-native': mock('react-native.mjs'),
  'expo-file-system': mock('expo-file-system.mjs'),
  'expo-file-system/legacy': mock('expo-file-system.mjs'),
  '@react-native-async-storage/async-storage': mock('async-storage.mjs'),
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) return { shortCircuit: true, url: MOCKS[specifier] };
  if (/(^|\/)api\/client(\.js)?$/.test(specifier)) return { shortCircuit: true, url: mock('client.mjs') };
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    for (const ext of ['.ts', '.tsx', '.js']) {
      const url = new URL(specifier + ext, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
    }
  }
  return nextResolve(specifier, context);
}
