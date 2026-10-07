export interface EnrolledDeviceAttributes {
  udid: string;
  product?: string;
  version?: string;
  challenge: string;
}

const UDID_RE = /^[0-9A-Fa-f-]{20,64}$/;

function readPlistString(xml: string, key: string): string | null {
  const re = new RegExp(
    `<key>\\s*${key}\\s*</key>\\s*<string>([^<]*)</string>`,
    'i',
  );
  const match = xml.match(re);
  const value = match?.[1]?.trim();
  return value || null;
}

/**
 * Parses a plist that has already been extracted from a verified CMS body.
 * The XML must be the whole payload. A raw or prefixed document is rejected.
 */
export function parseVerifiedDevicePlist(xml: string): EnrolledDeviceAttributes {
  const trimmed = xml.trimStart();
  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<plist')) {
    throw new Error('enrollment_plist_missing');
  }
  if (trimmed.includes('\0')) throw new Error('enrollment_plist_missing');
  const udid = readPlistString(trimmed, 'UDID');
  if (!udid || !UDID_RE.test(udid)) {
    throw new Error('enrollment_udid_missing');
  }
  const challenge = readPlistString(trimmed, 'CHALLENGE');
  if (!challenge || challenge.length > 128 || /[<>&"']/.test(challenge)) {
    throw new Error('enrollment_challenge_missing');
  }
  const product = readPlistString(trimmed, 'PRODUCT') ?? undefined;
  const version = readPlistString(trimmed, 'VERSION') ?? undefined;
  return { udid, product, version, challenge };
}
