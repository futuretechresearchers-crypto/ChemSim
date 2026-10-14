/** One generation shared by session reads, auth events and manual refreshes. */
export function createLatestRequest() {
  let generation = 0;
  return {
    begin() { return ++generation; },
    isCurrent(request: number) { return request === generation; },
    invalidate() { ++generation; },
  };
}
