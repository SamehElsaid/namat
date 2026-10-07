/** Shared non-UI types and constants for NAMAT web/admin/api. */

export const NAMAT_PRODUCT_NAME = "NAMAT";
export const NAMAT_PRODUCT_NAME_AR = "نَمَط";
export const NAMAT_PRODUCTION_ORIGIN = "https://namat.shara.sa";
export const NAMAT_ADMIN_ORIGIN = "https://admin.namat.shara.sa";
/** Historical hostname. Production API is same-origin under NAMAT_API_PUBLIC_BASE. */
export const NAMAT_API_ORIGIN = "https://namat.shara.sa";
/** Single public API base used by iOS, web, and admin. */
export const NAMAT_API_PUBLIC_BASE = "https://namat.shara.sa/api/v1";
export const NAMAT_API_DEFAULT_BASE = "http://127.0.0.1:3302/api/v1";

/** Wallet cardBackgroundCombined sizes from the audited AirCard ImageEngine. */
export const CARD_ARTWORK_WIDTH = 1536;
export const CARD_ARTWORK_HEIGHT = 969;
export const CARD_ARTWORK_2X_WIDTH = 1024;
export const CARD_ARTWORK_2X_HEIGHT = 646;

/** Commercial model — one-time purchase, lifetime entitlement. */
export const NAMAT_PRICE_SAR = 299;
export const NAMAT_PRICE_MINOR = 29900;
export const NAMAT_CURRENCY = "SAR";
export const NAMAT_MAX_DEVICES = 1;
/** @deprecated Prefer NAMAT_MAX_DEVICES */
export const MAX_ACTIVE_INSTALLATIONS = NAMAT_MAX_DEVICES;
export const NAMAT_PLAN = "lifetime";

/**
 * Field names the API must never accept or persist.
 * Wallet secrets stay on-device.
 */
export const FORBIDDEN_PAYLOAD_FIELDS = [
  "pan",
  "cvv",
  "cvc",
  "pin",
  "cardNumber",
  "card_number",
  "walletLocalKey",
  "wallet_local_key",
  "walletCardId",
  "wallet_card_id",
  "passHash",
  "pass_hash",
  "applePayToken",
  "apple_pay_token",
  "paymentToken",
  "payment_token",
  "primaryAccountNumber",
  "udid",
  "imei",
  "iccid",
] as const;

export type ForbiddenPayloadField = (typeof FORBIDDEN_PAYLOAD_FIELDS)[number];

export interface RemoteConfigPublic {
  killSwitchApply: boolean;
  killSwitchRestore: boolean;
  minAppVersion: string;
  minIosVersion: string;
  maintenanceMode: boolean;
  message?: string;
}

export interface SkinManifestEntry {
  id: string;
  slug: string;
  name: string;
  categoryId: string | null;
  version: number;
  contentHash: string;
  thumbnailUrl: string;
  artworkUrl: string;
  updatedAt: string;
}

export type UserRole = "user" | "admin" | "owner";

export type CompatibilityState =
  | "SUPPORTED"
  | "TESTING"
  | "UNSUPPORTED"
  | "BLOCKED";

export interface NamatUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface Entitlement {
  id: string;
  userId: string;
  status: "active" | "revoked";
  plan: string;
  maxDevices: number;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
}

export interface Device {
  id: string;
  userId: string;
  installationId: string;
  /** Human label. Do not present installationId as the primary name. */
  label: string;
  appVersion: string | null;
  iosVersion: string | null;
  status: "active" | "inactive";
  lastSeenAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
}

export interface Purchase {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected" | "reversed" | "refunded";
  amountMinor: number;
  currency: string;
  provider: string;
  customerReferenceNumber: string;
  createdAt: string;
}

export interface NearPaySessionResult {
  provider: "nearpay";
  mode: "live" | "mock";
  customerReferenceNumber: string;
  checkoutReference: string;
  amountMinor: number;
  currency: string;
  sandboxBaseUrl: string;
  purchaseId?: string;
  jobId?: string | null;
  /** mock = no terminal call; initiated = remote purchase sent; blocked = missing credentials. */
  terminalPurchase?: "mock" | "initiated" | "blocked";
  blockedReason?: string | null;
  transactionId?: string | null;
}

export interface NamatPackage {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  currency: string;
  maxDevices: number;
  durationDays: number | null;
  isPublished: boolean;
  sortOrder: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Skin {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  categoryId: string | null;
  status: "draft" | "published" | "archived";
  currentVersion: number;
  contentHash: string | null;
  thumbnailPath: string | null;
  artworkPath: string | null;
  sortOrder: number;
  publishedAt: string | null;
}

export interface CompatibilityRule {
  id: string;
  minIosVersion: string;
  maxIosVersion: string | null;
  supportedModels: string[] | null;
  isSupported: boolean;
  state?: CompatibilityState;
  minAppVersion?: string | null;
  notes: string | null;
}

export interface AppVersion {
  id: string;
  version: string;
  isMandatory: boolean;
  isActive: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
  checksum?: string | null;
  ipaPath?: string | null;
  signatureVerified?: boolean;
  signatureStatus?: string;
  published?: boolean;
  publishedAt?: string | null;
  createdAt: string;
}

export interface RemoteConfig {
  id: string;
  key: string;
  killSwitchApply: boolean;
  killSwitchRestore: boolean;
  minAppVersion: string;
  minIosVersion: string;
  maintenanceMode: boolean;
  message: string | null;
  extras: Record<string, unknown> | null;
}

export interface AuditLog {
  id: string;
  actorEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  result: "success" | "failure" | "pending" | null;
  createdAt: string;
}

export interface AnalyticsEvent {
  id: string;
  name: string;
  properties: Record<string, unknown> | null;
  createdAt: string;
}

export {
  compareVersions,
  evaluateApply,
  evaluateCompatibility,
  evaluateRestore,
} from "./policy";
export type {
  ApplyDecision,
  CompatibilityInput,
  RemotePolicy,
} from "./policy";

export { messages } from "./i18n";
export type { Locale, MessageKey } from "./i18n";

export interface AiGeneration {
  id: string;
  userId: string;
  prompt: string;
  stylePresetId: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "moderated";
  resultAssetPath: string | null;
  errorMessage: string | null;
  createdAt: string;
}
