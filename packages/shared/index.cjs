/** Shared non-UI types and constants for NAMAT web/admin/api. (CJS runtime entry) */
'use strict';

const NAMAT_PRODUCT_NAME = 'NAMAT';
const NAMAT_PRODUCT_NAME_AR = 'نَمَط';
const NAMAT_PRODUCTION_ORIGIN = 'https://namat.shara.sa';
const NAMAT_ADMIN_ORIGIN = 'https://admin.namat.shara.sa';
const NAMAT_API_ORIGIN = 'https://namat.shara.sa';
const NAMAT_API_PUBLIC_BASE = 'https://namat.shara.sa/api/v1';
const NAMAT_API_DEFAULT_BASE = 'http://127.0.0.1:3302/api/v1';

const CARD_ARTWORK_WIDTH = 1536;
const CARD_ARTWORK_HEIGHT = 969;
const CARD_ARTWORK_2X_WIDTH = 1024;
const CARD_ARTWORK_2X_HEIGHT = 646;

const NAMAT_PRICE_SAR = 299;
const NAMAT_PRICE_MINOR = 29900;
const NAMAT_CURRENCY = 'SAR';
const NAMAT_MAX_DEVICES = 1;
const MAX_ACTIVE_INSTALLATIONS = NAMAT_MAX_DEVICES;
const NAMAT_PLAN = 'lifetime';

const FORBIDDEN_PAYLOAD_FIELDS = [
  'pan',
  'cvv',
  'cvc',
  'pin',
  'cardNumber',
  'card_number',
  'walletLocalKey',
  'wallet_local_key',
  'walletCardId',
  'wallet_card_id',
  'passHash',
  'pass_hash',
  'applePayToken',
  'apple_pay_token',
  'paymentToken',
  'payment_token',
  'primaryAccountNumber',
  'udid',
  'imei',
  'iccid',
];

function compareVersions(a, b) {
  const pa = String(a).split('.').map((p) => parseInt(p, 10) || 0);
  const pb = String(b).split('.').map((p) => parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function evaluateApply(policy, appVersion, iosVersion) {
  if (policy.maintenanceMode) {
    return {
      allowed: false,
      code: 'maintenance',
      reason: (policy.message && String(policy.message).trim()) || 'NAMAT is temporarily unavailable.',
    };
  }
  if (policy.killSwitchApply) {
    return {
      allowed: false,
      code: 'kill_switch_apply',
      reason: (policy.message && String(policy.message).trim()) || 'Applying skins is temporarily disabled.',
    };
  }
  if (policy.minAppVersion && compareVersions(appVersion, policy.minAppVersion) < 0) {
    return {
      allowed: false,
      code: 'app_version',
      reason: `Update NAMAT to ${policy.minAppVersion} or newer before applying a skin.`,
    };
  }
  if (policy.minIosVersion && compareVersions(iosVersion, policy.minIosVersion) < 0) {
    return {
      allowed: false,
      code: 'ios_version',
      reason: `This iOS version is below the minimum (${policy.minIosVersion}).`,
    };
  }
  return { allowed: true, code: 'allowed', reason: '' };
}

function evaluateRestore(policy) {
  if (policy.killSwitchRestore) {
    return {
      allowed: false,
      code: 'kill_switch_restore',
      reason: (policy.message && String(policy.message).trim()) || 'Restoring original artwork is temporarily disabled.',
    };
  }
  return { allowed: true, code: 'allowed', reason: '' };
}

function evaluateCompatibility(input) {
  if (input.state === 'BLOCKED') {
    return { allowed: false, code: 'compatibility_blocked', reason: 'This device is blocked by the compatibility policy.' };
  }
  if (input.state === 'UNSUPPORTED') {
    return { allowed: false, code: 'compatibility_unsupported', reason: 'This device or iOS version is not supported.' };
  }
  if (input.minIosVersion && compareVersions(input.iosVersion, input.minIosVersion) < 0) {
    return { allowed: false, code: 'ios_version', reason: `iOS ${input.minIosVersion} or newer is required.` };
  }
  if (input.maxIosVersion && compareVersions(input.iosVersion, input.maxIosVersion) > 0) {
    return { allowed: false, code: 'ios_version', reason: `iOS newer than ${input.maxIosVersion} is not supported yet.` };
  }
  if (input.minAppVersion && compareVersions(input.appVersion, input.minAppVersion) < 0) {
    return { allowed: false, code: 'app_version', reason: `Update NAMAT to ${input.minAppVersion} or newer.` };
  }
  if (input.deviceModel && input.supportedModels && input.supportedModels.length > 0 && !input.supportedModels.includes(input.deviceModel)) {
    return { allowed: false, code: 'compatibility_unsupported', reason: 'This device model is not in the supported list.' };
  }
  if (input.state === 'TESTING') {
    return {
      allowed: true,
      code: 'compatibility_testing',
      reason: 'TESTING: this iOS, app, and model combination is not production-verified. Apply is allowed and the result is unverified.',
    };
  }
  return { allowed: true, code: 'allowed', reason: '' };
}

module.exports = {
  NAMAT_PRODUCT_NAME,
  NAMAT_PRODUCT_NAME_AR,
  NAMAT_PRODUCTION_ORIGIN,
  NAMAT_ADMIN_ORIGIN,
  NAMAT_API_ORIGIN,
  NAMAT_API_PUBLIC_BASE,
  NAMAT_API_DEFAULT_BASE,
  CARD_ARTWORK_WIDTH,
  CARD_ARTWORK_HEIGHT,
  CARD_ARTWORK_2X_WIDTH,
  CARD_ARTWORK_2X_HEIGHT,
  NAMAT_PRICE_SAR,
  NAMAT_PRICE_MINOR,
  NAMAT_CURRENCY,
  NAMAT_MAX_DEVICES,
  MAX_ACTIVE_INSTALLATIONS,
  NAMAT_PLAN,
  FORBIDDEN_PAYLOAD_FIELDS,
  compareVersions,
  evaluateApply,
  evaluateRestore,
  evaluateCompatibility,
};
