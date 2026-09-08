export function countWebSearchCalls(output: unknown): number {
  if (!Array.isArray(output)) return 0;
  return output.filter((item) =>
    item !== null
    && typeof item === "object"
    && (item as { type?: unknown }).type === "web_search_call"
  ).length;
}