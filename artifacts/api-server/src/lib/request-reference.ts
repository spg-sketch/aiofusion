export function addRequestReference<T>(
  body: T,
  statusCode: number,
  requestId: string,
): T | (T & { requestId: string }) {
  if (
    statusCode < 500 ||
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    "requestId" in body
  ) {
    return body;
  }
  return { ...body, requestId };
}