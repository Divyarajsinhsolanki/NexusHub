// Share simultaneous reads only; never retain responses or failed requests.
export function createSingleFlight() {
  const pending = new Map();
  return (key, request) => {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(request).finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
    pending.set(key, promise);
    return promise;
  };
}
