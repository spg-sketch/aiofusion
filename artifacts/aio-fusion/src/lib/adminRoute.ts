export function isInsightsAdminPath(pathname: string, basePath = "/"): boolean {
  const base = basePath.replace(/\/+$/, "");
  let path = pathname;
  if (base && (path === base || path.startsWith(`${base}/`))) {
    path = path.slice(base.length);
  }
  return path.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase() === "admin";
}