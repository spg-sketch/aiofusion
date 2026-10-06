import "@testing-library/jest-dom/vitest";

// jsdom does not implement window.scrollTo; the component calls it when a saved
// audit is opened. Stub it so tests don't log "Not implemented" noise.
window.scrollTo = () => {};

// jsdom has no media-query API. Default to desktop; mobile regressions override
// this with their explicit viewport match, just as a browser would provide.
window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});
