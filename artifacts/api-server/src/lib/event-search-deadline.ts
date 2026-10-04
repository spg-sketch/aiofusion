export const EVENT_SEARCH_TIMEOUT_MS = 180_000;
export const EVENT_RESEARCH_TIMEOUT_MS = 120_000;

export class EventSearchTimeoutError extends Error {
  constructor() {
    super("Event research took too long. Please try fewer categories or marketing types.");
    this.name = "EventSearchTimeoutError";
  }
}

/** A hard deadline still settles when a provider ignores its abort signal. */
export async function withEventSearchDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new EventSearchTimeoutError());
        }, EVENT_SEARCH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}