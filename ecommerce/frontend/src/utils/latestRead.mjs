// In-flight reads only. No response cache and no commercial mutation dedupe.
export function latestRead() {
  let current;
  return (key, owner, read) => {
    if (current?.key === key && current.owner === owner) return current.promise;
    current?.controller.abort();
    const request = { key, owner, controller: new AbortController() };
    current = request;
    request.promise = Promise.resolve().then(() => read(request.controller.signal,
      () => current === request && !request.controller.signal.aborted))
      .finally(() => { if (current === request) current = undefined; });
    return request.promise;
  };
}
