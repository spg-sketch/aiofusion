export function accountLabel(role: string): string {
  return role === "agency" ? "Agency / Partner" : role === "client" ? "Client" : "Account";
}
