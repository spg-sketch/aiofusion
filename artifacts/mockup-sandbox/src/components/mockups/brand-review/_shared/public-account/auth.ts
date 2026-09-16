export type Role = "admin" | "user" | "agency" | "client";
export type User = { [key: string]: any; username: string; role?: Role; displayName?: string; companyName?: string; website?: string; archived?: boolean; managed?: boolean; agencyManaged?: boolean; agencyManagedClient?: boolean; lastSignInAt?: string | null; };
export type Session = { [key: string]: any; username: string; role: Role; companyName?: string; website?: string; membershipRole?: string | null; agencyManagedClient?: boolean; };
let accounts: User[] = [
  { username: "brightline-pr", role: "client", displayName: "Brightline PR", companyName: "Brightline PR", website: "https://brightline.example", managed: true, archived: false, lastSignInAt: "2026-01-14T10:30:00Z" },
  { username: "cascade-studio", role: "client", displayName: "Cascade Studio", companyName: "Cascade Studio", website: "https://cascade.example", managed: true, archived: false, lastSignInAt: null },
];
export function getSubAccounts(_username: string): User[] { return accounts.map((account) => ({ ...account })); }
export async function serverAddUser(username: string, _password: string, role: Role, companyName?: string, options?: any): Promise<any> { const record = { username, role, displayName: companyName, companyName, archived: false, managed: Boolean(options?.managed), website: options?.website ?? "" }; accounts = [...accounts, record]; return { ok: true, username, welcomeLinkCreated: false }; }
export async function serverDeleteUser(username: string): Promise<any> { accounts = accounts.filter((account) => account.username !== username); return { ok: true }; }
export async function serverChangePassword(_username: string, _password: string): Promise<any> { return { ok: true }; }
export async function serverAssignOwner(_projectId: string, _owner: string): Promise<any> { return { ok: true }; }
export async function serverSetDisplayName(username: string, displayName: string, website?: string, _options?: any): Promise<any> { accounts = accounts.map((account) => account.username === username ? { ...account, displayName, companyName: displayName, website: website ?? account.website } : account); return { ok: true }; }
export async function serverArchiveUser(username: string, archived: boolean): Promise<any> { accounts = accounts.map((account) => account.username === username ? { ...account, archived } : account); return { ok: true }; }
export async function serverSetSeatCap(_cap: number): Promise<any> { return { ok: true }; }
export async function refreshAccountsCache(): Promise<boolean> { return true; }
export async function serverImpersonate(_username: string): Promise<any> { return { ok: true }; }
export async function serverSwitchToMaster(): Promise<any> { return { ok: true }; }
export async function serverChangeAccountType(_role: Role): Promise<any> { return { ok: true, role: _role }; }
export async function serverSetClientAccess(..._args: any[]): Promise<any> { return { ok: true }; }
export function canCreateSubAccounts(role: Role): boolean { return role === "agency" || role === "admin"; }
