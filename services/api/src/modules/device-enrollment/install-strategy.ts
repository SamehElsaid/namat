export const INSTALL_STRATEGIES = [
  'AD_HOC_SELF_SERVICE',
  'TESTFLIGHT',
  'USER_SIDE_SIGNING',
  'UNAVAILABLE',
] as const;

export type InstallStrategy = (typeof INSTALL_STRATEGIES)[number];

export interface StableBuildIdentity {
  sourceCommit: string;
  airliftSha: string;
  appVersion: string;
}

export function parseInstallStrategy(value: string | undefined): InstallStrategy {
  if (
    value === 'AD_HOC_SELF_SERVICE' ||
    value === 'TESTFLIGHT' ||
    value === 'USER_SIDE_SIGNING' ||
    value === 'UNAVAILABLE'
  ) {
    return value;
  }
  return 'AD_HOC_SELF_SERVICE';
}

/**
 * Full rebuild when the verified Release identity changed.
 * Re-sign when that identity is unchanged and only the device profile changed.
 */
export function chooseSigningMode(
  stable: StableBuildIdentity | null,
  current: StableBuildIdentity,
): 'RESIGN' | 'FULL_REBUILD' {
  if (!stable) return 'FULL_REBUILD';
  if (!stable.sourceCommit || !stable.airliftSha || !stable.appVersion) {
    return 'FULL_REBUILD';
  }
  if (
    stable.sourceCommit === current.sourceCommit &&
    stable.airliftSha === current.airliftSha &&
    stable.appVersion === current.appVersion
  ) {
    return 'RESIGN';
  }
  return 'FULL_REBUILD';
}

export function customerMessage(code: string | null): string | null {
  switch (code) {
    case null:
    case '':
      return null;
    case 'capacity_exhausted':
      return 'Installation is currently unavailable because device capacity is full. Your purchase stays active.';
    case 'device_limit':
      return 'Two active installations are already in use. Deactivate one to continue.';
    case 'device_owned_by_another_account':
      return 'This iPhone is already linked to another NAMAT account.';
    case 'expired':
      return 'This registration link expired. Start again from your account.';
    case 'replay':
      return 'This registration link was already used. Start again from your account.';
    case 'install_unavailable':
    case 'testflight_not_configured':
    case 'signing_dispatcher_unconfigured':
    case 'apple_not_configured':
    case 'enrollment_key_missing':
      return 'Installation is currently unavailable. Your purchase stays active.';
    default:
      return 'NAMAT could not be prepared for this iPhone. Try again from your account.';
  }
}

export function developerModeRequired(strategy: string): boolean {
  return strategy === 'AD_HOC_SELF_SERVICE' || strategy === 'USER_SIDE_SIGNING';
}
