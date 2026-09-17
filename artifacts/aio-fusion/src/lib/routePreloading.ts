export type RoutePreloader = () => Promise<unknown>;
type IdleScheduler = Pick<Window, "setTimeout" | "clearTimeout"> & {
  requestIdleCallback?: Window["requestIdleCallback"];
  cancelIdleCallback?: Window["cancelIdleCallback"];
};

const started = new WeakMap<RoutePreloader, Promise<unknown>>();

export function preloadRoute(load: RoutePreloader | undefined): Promise<unknown> {
  if (!load) return Promise.resolve();
  const existing = started.get(load);
  if (existing) return existing;
  const pending = Promise.resolve().then(load).catch(() => {
    // A failed request must remain retryable when the user actually navigates.
    started.delete(load);
  });
  started.set(load, pending);
  return pending;
}

export function scheduleIdlePreloads(
  loads: readonly RoutePreloader[],
  idleWindow: IdleScheduler = window,
): () => void {
  let cancelled = false;
  let index = 0;
  let handle: number | undefined;

  const scheduleNext = () => {
    if (cancelled || index >= loads.length) return;
    const run = async () => {
      if (cancelled) return;
      // An idle CPU does not imply an idle network. Wait for this import's
      // downloads AND evaluation before scheduling another speculative route.
      await preloadRoute(loads[index++]);
      scheduleNext();
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      handle = idleWindow.requestIdleCallback(run, { timeout: 1500 });
    } else {
      handle = idleWindow.setTimeout(run, 250);
    }
  };

  // Leave initial route rendering and its foreground data requests a head
  // start. Hover/focus/navigation preloads remain immediate.
  const startHandle = idleWindow.setTimeout(scheduleNext, 1000);
  return () => {
    cancelled = true;
    idleWindow.clearTimeout(startHandle);
    if (handle === undefined) return;
    if (typeof idleWindow.cancelIdleCallback === "function") idleWindow.cancelIdleCallback(handle);
    else idleWindow.clearTimeout(handle);
  };
}