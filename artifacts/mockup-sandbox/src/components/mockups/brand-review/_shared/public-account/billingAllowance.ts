export async function fetchProjectAllowance(): Promise<{ projectsUsed: number; projectAllowance: number; atLimit?: boolean } | null> {
  return { projectsUsed: 2, projectAllowance: 8, atLimit: false };
}
