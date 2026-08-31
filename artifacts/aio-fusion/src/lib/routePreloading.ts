export type RoutePreloader = () => Promise<unknown>;
type IdleScheduler = Pick<Window, "setTimeout" | "clearTimeout"> & {
  requestIdleCallback?: Window["requestIdleCallback"];
  cancelIdleCallback?: Window["cancelIdleCallback"];
};

const started = new WeakSet<RoutePreloader>();

export function preloadRoute(load: RoutePreloader | undefined): void {
  if (!load || started.has(load)) return;
  started.add(load);
  void load().catch(() => {
    // A failed request must remain retryable when the user actually navigates.
    started.delete(load);
  });
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
    const run = () => {
      if (cancelled) return;
      preloadRoute(loads[index++]);
      scheduleNext();
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      handle = idleWindow.requestIdleCallback(run, { timeout: 1500 });
    } else {
      handle = idleWindow.setTimeout(run, 250);
    }
  };

  scheduleNext();
  return () => {
    cancelled = true;
    if (handle === undefined) return;
    if (typeof idleWindow.cancelIdleCallback === "function") idleWindow.cancelIdleCallback(handle);
    else idleWindow.clearTimeout(handle);
  };
}