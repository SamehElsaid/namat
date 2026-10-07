const EMAIL_KEY = "namat_email";
const FLAG_KEY = "namat_signed_in";

/** Browser auth uses the HttpOnly namat_session cookie. This flag is not a bearer token. */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(FLAG_KEY) === "1" ? "cookie" : null;
}

export function setStoredSession(_token: string, email: string) {
  window.localStorage.setItem(FLAG_KEY, "1");
  window.localStorage.setItem(EMAIL_KEY, email);
}

export function clearStoredSession() {
  window.localStorage.removeItem(FLAG_KEY);
  window.localStorage.removeItem(EMAIL_KEY);
}

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EMAIL_KEY);
}
