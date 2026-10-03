export type GuidanceFilter = "All" | "Article" | "Guide" | "Video";
export type GuidanceRoute = { id: string | null; filter: GuidanceFilter };

export function guidanceRouteFromLocation(
  location: Pick<Location, "pathname" | "search"> = window.location,
  base = import.meta.env.BASE_URL || "/",
): GuidanceRoute {
  const prefix = base.replace(/\/+$/, "");
  let path = location.pathname;
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) path = path.slice(prefix.length);
  const parts = path.replace(/^\/+|\/+$/g, "").split("/");
  let id: string | null = null;
  if (parts[0] === "guidance" && parts[1]) {
    try { id = decodeURIComponent(parts.slice(1).join("/")); }
    catch { id = parts.slice(1).join("/"); }
  }
  const type = new URLSearchParams(location.search).get("type");
  const filter = type === "Article" || type === "Guide" || type === "Video" ? type : "All";
  return { id, filter };
}

export function guidanceUrl(route: GuidanceRoute, base = import.meta.env.BASE_URL || "/"): string {
  return `${base.replace(/\/+$/, "")}/guidance${route.id ? `/${encodeURIComponent(route.id)}` : ""}${route.filter === "All" ? "" : `?type=${route.filter}`}`;
}