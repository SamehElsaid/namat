import {
  NAMAT_API_DEFAULT_BASE,
  type AppVersion,
  type CompatibilityRule,
  type Device,
  type NamatPackage,
  type NamatUser,
  type RemoteConfig,
  type Skin,
} from "@namat/shared";

export interface CustomerEntitlement {
  id: string;
  status: "active" | "revoked";
  plan: string;
  maxDevices: number;
  purchaseId: string | null;
  createdAt: string | null;
}

export interface CustomerPurchase {
  id: string;
  reference: string;
  createdAt: string;
  amountMinor: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded" | "cancelled";
  paymentMethod: "terminal" | "card" | "wallet" | "unknown";
  test?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") return "/api/v1";
  return (
    process.env.API_INTERNAL_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
    NAMAT_API_DEFAULT_BASE
  );
}

export function isSandboxPayments(): boolean {
  const mode = process.env.NEXT_PUBLIC_PAYMENT_MODE ?? "sandbox";
  return mode !== "live";
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...opts.headers,
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-Namat-Request"] = "1";
  }
  if (opts.token && opts.token !== "cookie") {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    credentials: "include",
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : Array.isArray(
              typeof data === "object" && data && "message" in data
                ? (data as { message: unknown }).message
                : null,
            )
          ? ((data as { message: string[] }).message).join(", ")
          : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

export type CustomerEnrollment = {
  id: string;
  status: string;
  signingStatus: string | null;
  installStrategy: string;
  label: string | null;
  product: string | null;
  iosVersion: string | null;
  expiresAt: string;
  failureCode: string | null;
  customerMessage: string | null;
  developerModeRequired: boolean;
  profileUrl: string | null;
  activated: boolean;
};

export type CheckoutAvailability = {
  available: boolean;
  message: string | null;
  priceMinor: number;
  currency: string;
  packageCode?: string | null;
  test: boolean;
};

export type CheckoutSessionResponse = {
  purchaseId: string;
  status: string;
  test: boolean;
  invoiceUrl: string | null;
};

export const api = {
  requestOtp(email: string) {
    return request<{
      ok: boolean;
      expiresIn?: number;
      delivery?: "smtp" | "dev_log" | "pending_smtp";
      message?: string;
    }>("/auth/otp/request", { body: { email } });
  },

  verifyOtp(email: string, code: string) {
    return request<{
      accessToken: string;
      user: NamatUser;
    }>("/auth/otp/verify", { body: { email, code } });
  },

  loginWithGoogle(idToken: string) {
    return request<{
      accessToken: string;
      user: NamatUser;
    }>("/auth/google", { body: { idToken } });
  },

  transferDevice(token: string) {
    return request<{ ok: boolean; revoked: number }>("/devices/transfer", {
      method: "POST",
      token,
      body: {},
    });
  },

  me(token: string) {
    return request<
      NamatUser & {
        entitlement?: {
          id: string;
          status: string;
          plan: string;
          maxDevices: number;
          activeDevices: number;
        } | null;
      }
    >("/me", { token });
  },

  logout(token: string) {
    return request<{ ok: boolean }>("/auth/logout", {
      method: "POST",
      token,
      body: {},
    });
  },

  logoutAll(token: string) {
    return request<{ ok: boolean }>("/auth/logout-all", {
      method: "POST",
      token,
      body: {},
    });
  },

  latestAppVersion() {
    return request<{
      id?: string;
      version: string | null;
      releaseNotes?: string | null;
      checksum?: string | null;
      downloadAvailable?: boolean;
      isMandatory?: boolean;
    }>("/app-versions/latest");
  },

  entitlement(token: string) {
    return request<{
      entitlement: CustomerEntitlement | null;
      activeDevices: number;
    }>("/entitlements/me", { token }).then((r) => r.entitlement);
  },

  purchases(token: string) {
    return request<{ purchases: CustomerPurchase[] }>("/purchases/mine", {
      token,
    }).then((r) => r.purchases);
  },

  devices(token: string) {
    return request<Device[]>("/devices", { token });
  },

  deactivateDevice(token: string, deviceId: string) {
    return request<{ ok?: boolean }>(`/devices/${deviceId}`, {
      method: "DELETE",
      token,
    });
  },

  renameDevice(token: string, deviceId: string, label: string) {
    return request<Device>(`/devices/${deviceId}`, {
      method: "PATCH",
      token,
      body: { label },
    });
  },

  startEnrollment(token: string) {
    return request<CustomerEnrollment>("/device-enrollment/start", {
      method: "POST",
      token,
      body: {},
    });
  },

  enrollments(token: string) {
    return request<CustomerEnrollment[]>("/device-enrollment/mine", { token });
  },

  enrollment(token: string, id: string) {
    return request<CustomerEnrollment>(`/device-enrollment/sessions/${id}`, {
      token,
    });
  },

  enrollmentInstallLink(token: string, id: string) {
    return request<{ manifestUrl: string; installUrl: string }>(
      `/device-enrollment/sessions/${id}/install-link`,
      { method: "POST", token, body: {} },
    );
  },

  deactivateEnrollment(token: string, id: string) {
    return request<{ ok: boolean }>(
      `/device-enrollment/sessions/${id}/deactivate`,
      { method: "POST", token, body: {} },
    );
  },

  checkoutAvailability(packageCode?: string) {
    const query = packageCode ? `?packageCode=${encodeURIComponent(packageCode)}` : "";
    return request<CheckoutAvailability>(`/checkout/availability${query}`);
  },

  /** Published packages shown on the storefront. */
  packages() {
    return request<{ packages: NamatPackage[] }>("/packages");
  },

  /** Starts a server-priced hosted invoice for the signed-in customer. */
  createCheckoutSession(token: string, packageCode?: string) {
    return request<CheckoutSessionResponse>("/checkout/session", {
      method: "POST",
      token,
      body: packageCode ? { packageCode } : {},
    });
  },

  checkoutPurchase(token: string, purchaseId: string) {
    return request<CustomerPurchase>(`/checkout/purchases/${purchaseId}`, { token });
  },

  purchase(token: string, purchaseId: string) {
    return request<CustomerPurchase>(`/purchases/${purchaseId}`, { token });
  },

  compatibility() {
    return request<CompatibilityRule[] | { rules?: CompatibilityRule[] }>(
      "/compatibility",
    );
  },

  remoteConfig() {
    return request<RemoteConfig>("/remote-config");
  },

  skins() {
    return request<{ skins: Skin[]; generatedAt: string }>(
      "/skins/manifest",
    ).then((r) => r.skins);
  },

  createSupportRequest(token: string, body: { subject: string; body: string }) {
    return request<SupportRequest>("/support", { method: "POST", token, body });
  },

  telegramLinkStatus(token: string) {
    return request<{ linked: boolean; linkedAt: string | null; telegramUsername: string | null }>(
      "/integrations/telegram/link-status",
      { token },
    );
  },

  telegramLinkToken(token: string) {
    return request<{ deepLink: string | null; botUsername: string | null; expiresInSeconds: number }>(
      "/integrations/telegram/link-token",
      { method: "POST", token, body: {} },
    );
  },

  telegramUnlink(token: string) {
    return request<{ ok: boolean }>("/integrations/telegram/unlink", {
      method: "POST",
      token,
      body: {},
    });
  },

  mySupportRequests(token: string) {
    return request<{ requests: SupportRequest[] }>("/support/mine", { token }).then(
      (r) => r.requests,
    );
  },
};

export type SupportRequest = {
  id: string;
  subject: string | null;
  body: string;
  status: "open" | "resolved";
  source: "customer" | "staff";
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
