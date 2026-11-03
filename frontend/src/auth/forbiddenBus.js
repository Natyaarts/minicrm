const listeners = new Set();
export const onForbidden = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emitForbidden = (info) => listeners.forEach((fn) => fn(info));