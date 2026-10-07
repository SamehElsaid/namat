const EMAIL_KEY = "namat_admin_email";
const FLAG_KEY = "namat_admin_signed_in";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(FLAG_KEY) === "1" ? "cookie" : null;
}

export function setAdminSession(_token: string, email: string) {
  window.localStorage.setItem(FLAG_KEY, "1");
  window.localStorage.setItem(EMAIL_KEY, email);
}

export function clearAdminSession() {
  window.localStorage.removeItem(FLAG_KEY);
  window.localStorage.removeItem(EMAIL_KEY);
}

export function getAdminEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EMAIL_KEY);
}
