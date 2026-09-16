export function stripEmDashes(value: string): string {
  return value.replace(/[—–]/g, "-");
}

export function normaliseAddedData(value: string): string {
  return value.trim();
}