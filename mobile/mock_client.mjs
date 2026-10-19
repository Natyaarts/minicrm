let patchHandler = async () => ({ status: 200, data: {} });
const client = {
  patch: async (url, data, config) => patchHandler(url, data, config),
  _setPatchHandler: (fn) => { patchHandler = fn; },
};
export default client;
