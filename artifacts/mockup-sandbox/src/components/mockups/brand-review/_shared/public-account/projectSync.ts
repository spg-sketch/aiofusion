export type ProjectReconciliationAudit = { localOnly: Array<{ id?: string; recovered?: boolean; error?: string; name?: string }>; recovered: any[]; serverOnly: any[]; serverProjectIds: string[]; updated: any[] };
export async function auditAndRecoverLocalProjects(): Promise<ProjectReconciliationAudit> { return { localOnly: [], recovered: [], serverOnly: [], serverProjectIds: [], updated: [] }; }
export async function pushProjectMeta(..._args: any[]): Promise<{ ok: boolean }> { return { ok: true }; }
