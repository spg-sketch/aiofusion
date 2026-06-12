import "@testing-library/jest-dom/vitest";

// jsdom does not implement window.scrollTo; the component calls it when a saved
// audit is opened. Stub it so tests don't log "Not implemented" noise.
window.scrollTo = () => {};
