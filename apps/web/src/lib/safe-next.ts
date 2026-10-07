/** Only same-site relative paths are accepted after login. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/account";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) {
    return "/account";
  }
  return raw;
}
