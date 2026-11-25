// API client mock: each method delegates to globalThis.__client[method] and records the call.
globalThis.__client ??= {};
globalThis.__clientCalls ??= [];

const call = (method) => async (url, ...rest) => {
  globalThis.__clientCalls.push({ method, url, args: rest });
  const handler = globalThis.__client[method];
  if (!handler) return { data: {} };
  return handler(url, ...rest);
};

export default { get: call('get'), post: call('post'), patch: call('patch') };
