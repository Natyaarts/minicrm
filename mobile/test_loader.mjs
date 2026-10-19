export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo-file-system/legacy' || specifier === 'expo-file-system') {
    return {
      shortCircuit: true,
      url: new URL('./mock_filesystem.mjs', import.meta.url).href,
    };
  }
  if (specifier === '@react-native-async-storage/async-storage') {
    return {
      shortCircuit: true,
      url: new URL('./mock_storage.mjs', import.meta.url).href,
    };
  }
  if (specifier.endsWith('/api/client') || specifier === '../api/client') {
    return {
      shortCircuit: true,
      url: new URL('./mock_client.mjs', import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}
