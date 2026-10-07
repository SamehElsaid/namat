import type { CompatibilityState } from "./index";

export interface RemotePolicy {
  killSwitchApply: boolean;
  killSwitchRestore: boolean;
  minAppVersion: string;
  minIosVersion: string;
  maintenanceMode: boolean;
  message?: string | null;
}

export interface ApplyDecision {
  allowed: boolean;
  code:
    | "allowed"
    | "maintenance"
    | "kill_switch_apply"
    | "kill_switch_restore"
    | "app_version"
    | "ios_version"
    | "compatibility_blocked"
    | "compatibility_unsupported"
    | "compatibility_testing";
  reason: string;
}

export interface CompatibilityInput {
  state: CompatibilityState;
  minIosVersion?: string | null;
  maxIosVersion?: string | null;
  minAppVersion?: string | null;
  supportedModels?: string[] | null;
  iosVersion: string;
  appVersion: string;
  deviceModel?: string | null;
}

/** Compare dotted numeric versions. Non-numeric suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * Apply is blocked by maintenance, killSwitchApply, or minimum versions.
 * Restore is intentionally independent so an operator can disable Apply
 * without trapping a customer who needs to restore original artwork.
 */
export function evaluateApply(
  policy: RemotePolicy,
  appVersion: string,
  iosVersion: string,
): ApplyDecision {
  if (policy.maintenanceMode) {
    return {
      allowed: false,
      code: "maintenance",
      reason: policy.message?.trim() || "NAMAT is temporarily unavailable.",
    };
  }
  if (policy.killSwitchApply) {
    return {
      allowed: false,
      code: "kill_switch_apply",
      reason:
        policy.message?.trim() ||
        "Applying skins is temporarily disabled.",
    };
  }
  if (
    policy.minAppVersion &&
    compareVersions(appVersion, policy.minAppVersion) < 0
  ) {
    return {
      allowed: false,
      code: "app_version",
      reason: `Update NAMAT to ${policy.minAppVersion} or newer before applying a skin.`,
    };
  }
  if (
    policy.minIosVersion &&
    compareVersions(iosVersion, policy.minIosVersion) < 0
  ) {
    return {
      allowed: false,
      code: "ios_version",
      reason: `This iOS version is below the minimum (${policy.minIosVersion}).`,
    };
  }
  return { allowed: true, code: "allowed", reason: "" };
}

export function evaluateRestore(policy: RemotePolicy): ApplyDecision {
  if (policy.killSwitchRestore) {
    return {
      allowed: false,
      code: "kill_switch_restore",
      reason:
        policy.message?.trim() ||
        "Restoring original artwork is temporarily disabled.",
    };
  }
  return { allowed: true, code: "allowed", reason: "" };
}

export function evaluateCompatibility(input: CompatibilityInput): ApplyDecision {
  if (input.state === "BLOCKED") {
    return {
      allowed: false,
      code: "compatibility_blocked",
      reason: "This device is blocked by the compatibility policy.",
    };
  }
  if (input.state === "UNSUPPORTED") {
    return {
      allowed: false,
      code: "compatibility_unsupported",
      reason: "This device or iOS version is not supported.",
    };
  }
  if (
    input.minIosVersion &&
    compareVersions(input.iosVersion, input.minIosVersion) < 0
  ) {
    return {
      allowed: false,
      code: "ios_version",
      reason: `iOS ${input.minIosVersion} or newer is required.`,
    };
  }
  if (
    input.maxIosVersion &&
    compareVersions(input.iosVersion, input.maxIosVersion) > 0
  ) {
    return {
      allowed: false,
      code: "ios_version",
      reason: `iOS newer than ${input.maxIosVersion} is not supported yet.`,
    };
  }
  if (
    input.minAppVersion &&
    compareVersions(input.appVersion, input.minAppVersion) < 0
  ) {
    return {
      allowed: false,
      code: "app_version",
      reason: `Update NAMAT to ${input.minAppVersion} or newer.`,
    };
  }
  if (
    input.deviceModel &&
    input.supportedModels &&
    input.supportedModels.length > 0 &&
    !input.supportedModels.includes(input.deviceModel)
  ) {
    return {
      allowed: false,
      code: "compatibility_unsupported",
      reason: "This device model is not in the supported list.",
    };
  }
  if (input.state === "TESTING") {
    return {
      allowed: true,
      code: "compatibility_testing",
      reason:
        "TESTING: this iOS, app, and model combination is not production-verified. Apply is allowed and the result is unverified.",
    };
  }
  return { allowed: true, code: "allowed", reason: "" };
}
