/** A link back to this site, keeping `?demo` (dev demo mode) and adding the given query parameters. */
export function siteLink(params: Record<string, string> = {}): string {
  const u = new URL(location.href);
  const demo = u.searchParams.has("demo");
  u.search = "";
  u.hash = "";
  if (demo) u.searchParams.set("demo", "");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** Removes one-time parameters (join / claim) from the address bar without a reload. */
export function clearParams(...names: string[]): void {
  const u = new URL(location.href);
  names.forEach(n => u.searchParams.delete(n));
  history.replaceState(null, "", u.pathname + (u.search === "?" ? "" : u.search));
}
