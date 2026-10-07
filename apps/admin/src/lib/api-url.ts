/** Resolve an API URL in the browser and on the server. Relative bases need an origin. */
export function resolveApiUrl(
  base: string,
  path: string,
  origin = "http://127.0.0.1",
): URL {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const trimmed = base.replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return new URL(`${trimmed}${suffix}`);
  }
  const pageOrigin = origin.endsWith("/") ? origin : `${origin}/`;
  return new URL(`${trimmed}${suffix}`, pageOrigin);
}
