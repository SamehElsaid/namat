import { resolveApiUrl } from "./api-url";
import {
  NAMAT_API_DEFAULT_BASE,
  type AiGeneration,
  type AnalyticsEvent,
  type AppVersion,
  type AuditLog,
  type Category,
  type CompatibilityRule,
  type Device,
  type Entitlement,
  type NamatPackage,
  type NamatUser,
  type RemoteConfig,
  type Skin,
} from "@namat/shared";

export interface AdminEnrollment {
  id: string;
  userId: string;
  status: string;
  signingStatus: string | null;
  installStrategy: string;
  appleState: string | null;
  fingerprintPrefix: string | null;
  label: string | null;
  product: string | null;
  iosVersion: string | null;
  failureCode: string | null;
  namatInstallationId: string | null;
  appVersion: string | null;
  activatedAt: string | null;
  createdAt: string;
  deactivatedAt: string | null;
}

export interface AppleCapacity {
  configured: boolean;
  strategy: string;
  registeredIphoneCount: number | null;
  remaining: number | null;
  limit: number;
  pendingRegistrations: number;
  registrationFailures: number;
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "AdminApiError";
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

type Opts = {
  method?: string;
  body?: unknown;
  token: string;
  query?: Record<string, string | number | boolean | undefined>;
};

function messageFrom(data: unknown, fallback: string): string {
  if (typeof data === "object" && data && "message" in data) {
    const m = (data as { message: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.join(", ");
  }
  return fallback;
}

async function adminFetch<T>(path: string, opts: Opts): Promise<T> {
  const url = resolveApiUrl(
    getApiBaseUrl(),
    path,
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1",
  );
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-Namat-Request"] = "1";
  }
  if (opts.token && opts.token !== "cookie") {
    headers.Authorization = `Bearer ${opts.token}`;
  }
  if (opts.body !== undefined && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body:
      opts.body instanceof FormData
        ? opts.body
        : opts.body !== undefined
          ? JSON.stringify(opts.body)
          : undefined,
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
    throw new AdminApiError(
      res.status,
      messageFrom(data, `Request failed (${res.status})`),
      data,
    );
  }

  return data as T;
}

export const adminApi = {
  requestOtp(email: string) {
    const url = resolveApiUrl(
      getApiBaseUrl(),
      "/auth/otp/request",
      typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1",
    );
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new AdminApiError(
          res.status,
          messageFrom(data, "OTP request failed"),
          data,
        );
      }
      return data as { ok: boolean; delivery?: "smtp" | "dev_log" | "pending_smtp" };
    });
  },

  verifyOtp(email: string, code: string) {
    const url = resolveApiUrl(
      getApiBaseUrl(),
      "/auth/otp/verify",
      typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1",
    );
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, code }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new AdminApiError(
          res.status,
          messageFrom(data, "OTP verify failed"),
          data,
        );
      }
      return data as { accessToken: string; user: NamatUser };
    });
  },

  me(token: string) {
    return adminFetch<
      NamatUser & { sessionPurpose?: "customer" | "staff" | "password_setup" | null }
    >("/me", { token });
  },

  requestOwnerCode(email: string) {
    return adminFetch<{ ok: boolean; delivery?: string }>("/auth/owner/code/request", {
      method: "POST",
      token: "",
      body: { email },
    });
  },

  forgotOwnerPassword(email: string) {
    return adminFetch<{ ok: boolean; delivery?: string }>("/auth/owner/password/forgot", {
      method: "POST",
      token: "",
      body: { email },
    });
  },

  verifyOwnerCode(email: string, code: string) {
    return adminFetch<{
      accessToken: string;
      passwordSetupRequired: boolean;
      user: NamatUser;
    }>("/auth/owner/code/verify", {
      method: "POST",
      token: "",
      body: { email, code },
    });
  },

  setOwnerPassword(password: string, confirmation: string) {
    return adminFetch<{
      accessToken: string;
      passwordSetupRequired: boolean;
      user: NamatUser;
    }>("/auth/owner/password", {
      method: "POST",
      token: "cookie",
      body: { password, confirmation },
    });
  },

  ownerLogin(email: string, password: string) {
    return adminFetch<{
      accessToken: string;
      passwordSetupRequired: boolean;
      user: NamatUser;
    }>("/auth/owner/login", {
      method: "POST",
      token: "",
      body: { email, password },
    });
  },

  dashboard(token: string) {
    return adminFetch<{
      customers: number;
      purchases: number;
      verifiedPaid: number;
      testPaid: number;
      refunds: number;
      testRefunds: number;
      activeIphones: number;
      checkoutAvailable: boolean;
      checkoutEnabled: boolean;
      paymentMode: "test" | "live";
      paymentReady: boolean;
    }>("/admin/overview", { token });
  },

  skins(token: string) {
    return adminFetch<Skin[]>("/admin/skins", { token });
  },

  createSkin(token: string, body: Partial<Skin> & { name: string; slug: string }) {
    return adminFetch<Skin>("/admin/skins", { token, body });
  },

  publishSkin(token: string, id: string) {
    return adminFetch<Skin>(`/admin/skins/${id}/publish`, {
      token,
      method: "POST",
    });
  },

  unpublishSkin(token: string, id: string) {
    return adminFetch<Skin>(`/admin/skins/${id}/unpublish`, {
      token,
      method: "POST",
    });
  },

  categories(token: string) {
    return adminFetch<Category[]>("/admin/categories", { token });
  },

  createCategory(
    token: string,
    body: { slug: string; name: string; nameAr?: string },
  ) {
    return adminFetch<Category>("/admin/categories", { token, body });
  },

  updateCategory(
    token: string,
    id: string,
    body: Partial<{ name: string; nameAr: string; slug: string; sortOrder: number; isActive: boolean }>,
  ) {
    return adminFetch<Category>(`/admin/categories/${id}`, { token, method: "PATCH", body });
  },

  deleteCategory(token: string, id: string) {
    return adminFetch<{ ok: true }>(`/admin/categories/${id}`, { token, method: "DELETE" });
  },

  packages(token: string) {
    return adminFetch<NamatPackage[]>("/admin/packages", { token });
  },

  createPackage(
    token: string,
    body: {
      code: string;
      nameEn: string;
      nameAr: string;
      priceMinor: number;
      currency?: string;
      maxDevices?: number;
      durationDays?: number;
      sortOrder?: number;
    },
  ) {
    return adminFetch<NamatPackage>("/admin/packages", { token, body });
  },

  updatePackage(
    token: string,
    id: string,
    body: Partial<{
      nameEn: string;
      nameAr: string;
      priceMinor: number;
      currency: string;
      maxDevices: number;
      durationDays: number | null;
      sortOrder: number;
      isPublished: boolean;
    }>,
  ) {
    return adminFetch<NamatPackage>(`/admin/packages/${id}`, {
      token,
      method: "PATCH",
      body,
    });
  },

  users(token: string) {
    return adminFetch<
      Array<NamatUser & { entitlement?: Entitlement | null }>
    >("/admin/users", { token });
  },

  issueEntitlement(token: string, userId: string, reason: string) {
    return adminFetch<Entitlement>(`/admin/entitlements/issue`, {
      token,
      method: "POST",
      body: { userId, reason },
    });
  },

  revokeEntitlement(token: string, userId: string, reason?: string) {
    return adminFetch<Entitlement>(`/admin/entitlements/revoke`, {
      token,
      method: "POST",
      body: { userId, reason },
    });
  },

  devices(token: string) {
    return adminFetch<Device[]>("/admin/devices", { token });
  },

  compatibility(token: string) {
    return adminFetch<CompatibilityRule[]>("/compatibility", { token });
  },

  createCompatibility(token: string, body: Partial<CompatibilityRule>) {
    return adminFetch<CompatibilityRule>("/admin/compatibility", {
      token,
      body,
    });
  },

  updateCompatibility(
    token: string,
    body: Partial<CompatibilityRule> & { id: string },
  ) {
    return adminFetch<CompatibilityRule>("/admin/compatibility", {
      token,
      body,
    });
  },

  deleteCompatibility(token: string, id: string) {
    return adminFetch<{ ok: true }>(`/admin/compatibility/${id}`, {
      token,
      method: "DELETE",
    });
  },

  appVersions(token: string) {
    return adminFetch<AppVersion[]>("/admin/app-versions", { token });
  },

  createAppVersion(token: string, body: Partial<AppVersion> & { version: string }) {
    return adminFetch<AppVersion>("/admin/app-versions", { token, body });
  },

  remoteConfig(token: string) {
    return adminFetch<RemoteConfig>("/admin/remote-config", { token });
  },

  updateRemoteConfig(token: string, body: Partial<RemoteConfig>) {
    return adminFetch<RemoteConfig>("/admin/remote-config", {
      token,
      method: "POST",
      body,
    });
  },

  analytics(token: string) {
    return adminFetch<AnalyticsEvent[]>("/admin/analytics", { token });
  },

  auditLogs(token: string) {
    return adminFetch<AuditLog[]>("/admin/audit-logs", { token });
  },

  aiGenerations(token: string) {
    return adminFetch<AiGeneration[]>("/admin/ai-generations", { token });
  },

  purchases(token: string) {
    return adminFetch<
      Array<{
        id: string;
        userId: string;
        status: string;
        amountMinor: number;
        currency: string;
        provider: string;
        customerReferenceNumber: string;
        nearpayTransactionId: string | null;
        nearpayJobId: string | null;
        nearpayMerchantId: string | null;
        nearpayTerminalId: string | null;
        retrievalReferenceNumber: string | null;
        providerMode?: string | null;
        providerState?: string | null;
        paymentMethodType?: string | null;
        paymentMethodBrand?: string | null;
        paymentMethodLast4?: string | null;
        createdAt: string;
      }>
    >("/admin/purchases", { token });
  },

  refundPurchase(token: string, id: string, reason: string) {
    return adminFetch<{
      ok: boolean;
      status: string;
      confirmed: boolean;
      idempotent: boolean;
    }>(`/admin/purchases/${id}/refund`, {
      token,
      method: "POST",
      body: { confirm: true, reason },
    });
  },

  reversePurchase(token: string, id: string, reason: string) {
    return adminFetch<{
      ok: boolean;
      status: string;
      confirmed: boolean;
      idempotent: boolean;
    }>(`/admin/purchases/${id}/reverse`, {
      token,
      method: "POST",
      body: { confirm: true, reason },
    });
  },

  updateSkin(
    token: string,
    id: string,
    body: { name?: string; nameAr?: string; description?: string; sortOrder?: number },
  ) {
    return adminFetch<Skin>(`/admin/skins/${id}`, { token, method: "PATCH", body });
  },

  revokeDevice(token: string, id: string, reason: string) {
    return adminFetch<{ ok: boolean }>(`/admin/devices/${id}/revoke`, {
      token,
      method: "POST",
      body: { confirm: true, reason },
    });
  },

  transferActivation(token: string, userId: string, reason: string) {
    return adminFetch<{ ok: boolean; revoked: number }>("/admin/devices/transfer", {
      token,
      method: "POST",
      body: { confirm: true, userId, reason },
    });
  },

  publishRelease(token: string, id: string) {
    return adminFetch<AppVersion>(`/admin/app-versions/${id}/publish`, {
      token,
      method: "POST",
    });
  },

  unpublishRelease(token: string, id: string) {
    return adminFetch<AppVersion>(`/admin/app-versions/${id}/unpublish`, {
      token,
      method: "POST",
    });
  },

  paymentSettings(token: string) {
    return adminFetch<{
      checkoutEnabled: boolean;
      mode: "test" | "live";
      ready: boolean;
      checkoutAvailable: boolean;
      reasons: string[];
      secretKey: string | null;
      publishableKey: string | null;
      webhookSecretConfigured: boolean;
      credentialReplacementAvailable: boolean;
    }>("/admin/payment-settings", { token });
  },

  updatePaymentSettings(
    token: string,
    body: {
      checkoutEnabled?: boolean;
      mode?: "test" | "live";
      secretKey?: string;
      publishableKey?: string;
      webhookSecret?: string;
      clearSecretKey?: boolean;
      clearPublishableKey?: boolean;
      clearWebhookSecret?: boolean;
    },
  ) {
    return adminFetch<{ ok: boolean; reasons?: string[]; settings?: unknown }>(
      "/admin/payment-settings",
      { token, method: "PUT", body },
    );
  },

  customers(token: string, q: string, page = 1) {
    return adminFetch<{
      page: number;
      limit: number;
      total: number;
      customers: Array<{
        id: string;
        email: string;
        role: string;
        isActive: boolean;
        entitlement: { status: string; plan: string; grantSource: string | null } | null;
      }>;
    }>("/admin/customers", { token, query: { q, page } });
  },

  customer(token: string, id: string) {
    return adminFetch<{
      customer: {
        id: string;
        email: string;
        entitlement: { status: string; plan: string; grantSource: string | null } | null;
      };
      purchases: Array<{
        id: string;
        reference: string;
        createdAt: string;
        amountMinor: number;
        currency: string;
        provider: string;
        mode: string | null;
        status: string;
        method: string | null;
        brand: string | null;
        last4: string | null;
      }>;
      devices: Array<{ id: string; label: string; status: string; iosVersion: string | null }>;
      notes: Array<{
        id: string;
        body: string;
        status: string;
        outcome: string | null;
        actorEmail: string | null;
        createdAt: string;
        purchaseId: string | null;
      }>;
    }>(`/admin/customers/${id}`, { token });
  },

  supportNotes(token: string, q = "") {
    return adminFetch<
      Array<{
        id: string;
        userId: string;
        purchaseId: string | null;
        actorEmail: string | null;
        source: "customer" | "staff";
        subject: string | null;
        body: string;
        status: string;
        outcome: string | null;
        reply: string | null;
        repliedByEmail: string | null;
        repliedAt: string | null;
        createdAt: string;
      }>
    >("/admin/support-notes", { token, query: { q } });
  },

  createSupportNote(
    token: string,
    body: { userId: string; purchaseId?: string; body: string },
  ) {
    return adminFetch<{ id: string }>("/admin/support-notes", { token, method: "POST", body });
  },

  updateSupportNote(
    token: string,
    id: string,
    body: { status?: "open" | "resolved"; outcome?: string; reply?: string },
  ) {
    return adminFetch<{ id: string }>(`/admin/support-notes/${id}`, {
      token,
      method: "PATCH",
      body,
    });
  },

  system(token: string) {
    return adminFetch<{
      nodeEnv: string;
      nearpayConfigured: boolean;
      mockEntitlementAllowed: boolean;
      smtpConfigured: boolean;
      aiConfigured: boolean;
      ownerBootstrapConfigured: boolean;
      checkoutAvailable: boolean;
      paymentMode: "test" | "live";
      paymentReady: boolean;
    }>("/admin/system", { token });
  },

  logout(token: string) {
    return adminFetch<{ ok: boolean }>("/auth/logout", {
      token,
      method: "POST",
      body: {},
    });
  },

  uploadArtwork(token: string, skinId: string, file: File) {
    const body = new FormData();
    body.set("file", file);
    return adminFetch<Skin>(`/admin/skins/${skinId}/artwork`, {
      token,
      method: "POST",
      body,
    });
  },

  skinVersions(token: string, skinId: string) {
    return adminFetch<
      Array<{
        id: string;
        version: number;
        contentHash: string;
        artworkPath?: string | null;
        createdAt: string;
      }>
    >(`/admin/skins/${skinId}/versions`, { token });
  },

  rollbackSkin(token: string, skinId: string, version: number) {
    return adminFetch<Skin>(`/admin/skins/${skinId}/rollback/${version}`, {
      token,
      method: "POST",
    });
  },

  setUserRole(token: string, userId: string, role: "user" | "admin" | "owner") {
    return adminFetch<NamatUser>(`/admin/users/${userId}/role`, {
      token,
      method: "POST",
      body: { role },
    });
  },

  setUserActive(token: string, userId: string, isActive: boolean) {
    return adminFetch<NamatUser>(`/admin/users/${userId}/active`, {
      token,
      method: "POST",
      body: { isActive },
    });
  },

  uploadIpa(token: string, versionId: string, file: File) {
    const body = new FormData();
    body.set("file", file);
    return adminFetch<AppVersion>(`/admin/app-versions/${versionId}/ipa`, {
      token,
      method: "POST",
      body,
    });
  },

  setAppVersionFlags(
    token: string,
    versionId: string,
    body: { isActive?: boolean; isMandatory?: boolean },
  ) {
    return adminFetch<AppVersion>(`/admin/app-versions/${versionId}/flags`, {
      token,
      method: "POST",
      body,
    });
  },

  deviceEnrollments(token: string) {
    return adminFetch<AdminEnrollment[]>("/admin/device-enrollments", { token });
  },

  appleCapacity(token: string) {
    return adminFetch<AppleCapacity>("/admin/device-enrollments/capacity", {
      token,
    });
  },

  signedBuild(token: string) {
    return adminFetch<{
      available: boolean;
      jobId: string | null;
      appVersion: string | null;
      buildNumber: string | null;
      ipaSha256: string | null;
      sizeBytes: number | null;
      createdAt: string | null;
    }>("/admin/device-enrollments/signed-build", { token });
  },

  /** Owner build download: fetches the signed IPA as a blob (owner session only). */
  async downloadSignedBuild(token: string): Promise<Blob> {
    const res = await fetch(
      `${getApiBaseUrl()}/admin/device-enrollments/signed-build/download`,
      {
        headers: { Authorization: `Bearer ${token}`, "x-namat-request": "1" },
        credentials: "include",
      },
    );
    if (!res.ok) {
      throw new AdminApiError(res.status, `Download failed (${res.status})`);
    }
    return res.blob();
  },

  retryEnrollmentSigning(token: string, id: string) {
    return adminFetch<AdminEnrollment>(
      `/admin/device-enrollments/${id}/retry-signing`,
      { token, method: "POST", body: {} },
    );
  },

  retryEnrollmentProvisioning(token: string, id: string) {
    return adminFetch<AdminEnrollment>(
      `/admin/device-enrollments/${id}/retry-provisioning`,
      { token, method: "POST", body: {} },
    );
  },

  deactivateEnrollment(token: string, id: string) {
    return adminFetch<{ ok: boolean }>(
      `/admin/device-enrollments/${id}/deactivate`,
      { token, method: "POST", body: {} },
    );
  },

  moderateAi(token: string, id: string, status: "moderated" | "completed") {
    return adminFetch<AiGeneration>(`/admin/ai-generations/${id}/moderate`, {
      token,
      method: "POST",
      body: { status },
    });
  },
};
