import { createSign } from 'crypto';

export class AppleProvisioningError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AppleProvisioningError';
  }
}

export interface AppleDeviceRegistration {
  appleDeviceId: string;
  alreadyRegistered: boolean;
}

export interface AppleProfileResult {
  profileId: string;
  profileContentBase64: string;
}

export interface AppleCapacity {
  registeredIphoneCount: number;
  limit: number;
  remaining: number;
}

export interface AppleProvisioningProvider {
  isConfigured(): boolean;
  registerDevice(input: {
    udid: string;
    name: string;
  }): Promise<AppleDeviceRegistration>;
  capacity(): Promise<AppleCapacity | null>;
  regenerateProfile(deviceIds: string[]): Promise<AppleProfileResult>;
}

export class UnconfiguredAppleProvisioningProvider
  implements AppleProvisioningProvider
{
  isConfigured(): boolean {
    return false;
  }

  async registerDevice(): Promise<AppleDeviceRegistration> {
    throw new AppleProvisioningError('apple_not_configured');
  }

  async capacity(): Promise<AppleCapacity | null> {
    return null;
  }

  async regenerateProfile(): Promise<AppleProfileResult> {
    throw new AppleProvisioningError('apple_not_configured');
  }
}

export interface AppleApiConfig {
  issuerId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
  bundleResourceId: string;
  certificateId: string;
  deviceLimit: number;
}

type FetchLike = typeof fetch;

interface AscDevice {
  id: string;
  attributes?: { deviceClass?: string; udid?: string };
}

interface AscList {
  data?: AscDevice[];
  links?: { next?: string };
}

/** App Store Connect devices and profiles. Does not log request bodies. */
export class AppStoreConnectProvisioningProvider
  implements AppleProvisioningProvider
{
  constructor(
    private readonly opts: AppleApiConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.opts.issuerId &&
        this.opts.keyId &&
        this.opts.privateKey &&
        this.opts.certificateId &&
        (this.opts.bundleResourceId || this.opts.bundleId),
    );
  }

  async registerDevice(input: {
    udid: string;
    name: string;
  }): Promise<AppleDeviceRegistration> {
    const cap = await this.capacity();
    if (cap && cap.remaining <= 0) {
      const existing = await this.findDeviceId(input.udid);
      if (existing) {
        return { appleDeviceId: existing, alreadyRegistered: true };
      }
      throw new AppleProvisioningError('capacity_exhausted');
    }
    const created = await this.request('POST', '/v1/devices', {
      data: {
        type: 'devices',
        attributes: {
          name: input.name.slice(0, 50),
          platform: 'IOS',
          udid: input.udid,
        },
      },
    });
    if (created.status === 409) {
      const existing = await this.findDeviceId(input.udid);
      if (!existing) throw new AppleProvisioningError('apple_register_failed');
      return { appleDeviceId: existing, alreadyRegistered: true };
    }
    if (!created.ok) throw new AppleProvisioningError('apple_register_failed');
    const body = (await created.json()) as { data?: { id?: string } };
    const id = body.data?.id;
    if (!id) throw new AppleProvisioningError('apple_register_failed');
    return { appleDeviceId: id, alreadyRegistered: false };
  }

  async capacity(): Promise<AppleCapacity | null> {
    const devices = await this.listDevices();
    const registeredIphoneCount = devices.filter(
      (d) => (d.attributes?.deviceClass ?? 'IPHONE') === 'IPHONE',
    ).length;
    const limit = this.opts.deviceLimit > 0 ? this.opts.deviceLimit : 100;
    return {
      registeredIphoneCount,
      limit,
      remaining: Math.max(0, limit - registeredIphoneCount),
    };
  }

  async regenerateProfile(deviceIds: string[]): Promise<AppleProfileResult> {
    const bundleId = await this.resolveBundleResourceId();
    if (!this.opts.certificateId || !bundleId) {
      throw new AppleProvisioningError('apple_profile_unconfigured');
    }
    const unique = [...new Set(deviceIds)];
    const created = await this.request('POST', '/v1/profiles', {
      data: {
        type: 'profiles',
        attributes: {
          name: `NAMAT Ad Hoc ${new Date().toISOString().slice(0, 16)}`,
          profileType: 'IOS_APP_ADHOC',
        },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: bundleId } },
          certificates: {
            data: [{ type: 'certificates', id: this.opts.certificateId }],
          },
          devices: {
            data: unique.map((id) => ({ type: 'devices', id })),
          },
        },
      },
    });
    if (!created.ok) throw new AppleProvisioningError('apple_profile_failed');
    const body = (await created.json()) as {
      data?: { id?: string; attributes?: { profileContent?: string } };
    };
    const profileId = body.data?.id;
    const profileContentBase64 = body.data?.attributes?.profileContent;
    if (!profileId || !profileContentBase64) {
      throw new AppleProvisioningError('apple_profile_failed');
    }
    return { profileId, profileContentBase64 };
  }

  private async listDevices(): Promise<AscDevice[]> {
    const all: AscDevice[] = [];
    let path = '/v1/devices?filter[platform]=IOS&limit=200';
    while (path) {
      const res = await this.request('GET', path);
      if (!res.ok) throw new AppleProvisioningError('apple_list_failed');
      const body = (await res.json()) as AscList;
      all.push(...(body.data ?? []));
      const next = body.links?.next;
      if (!next) break;
      path = next.startsWith('http')
        ? next.replace('https://api.appstoreconnect.apple.com', '')
        : next;
    }
    return all;
  }

  private async findDeviceId(udid: string): Promise<string | null> {
    const res = await this.request(
      'GET',
      `/v1/devices?filter[udid]=${encodeURIComponent(udid)}&limit=1`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as AscList;
    return body.data?.[0]?.id ?? null;
  }

  private async resolveBundleResourceId(): Promise<string> {
    if (this.opts.bundleResourceId) return this.opts.bundleResourceId;
    const res = await this.request(
      'GET',
      `/v1/bundleIds?filter[identifier]=${encodeURIComponent(this.opts.bundleId)}&limit=1`,
    );
    if (!res.ok) throw new AppleProvisioningError('apple_profile_unconfigured');
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const id = body.data?.[0]?.id;
    if (!id) throw new AppleProvisioningError('apple_profile_unconfigured');
    return id;
  }

  private async request(
    method: string,
    path: string,
    jsonBody?: unknown,
  ): Promise<Response> {
    const token = appleJwt(
      this.opts.keyId,
      this.opts.issuerId,
      this.opts.privateKey,
    );
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    let body: string | undefined;
    if (jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(jsonBody);
    }
    const url = path.startsWith('http')
      ? path
      : `https://api.appstoreconnect.apple.com${path}`;
    return this.fetchImpl(url, { method, headers, body });
  }
}

export function appleJwt(
  keyId: string,
  issuerId: string,
  privateKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(
    JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }),
  );
  const payload = base64url(
    JSON.stringify({
      iss: issuerId,
      iat: nowSeconds,
      exp: nowSeconds + 15 * 60,
      aud: 'appstoreconnect-v1',
    }),
  );
  const data = `${header}.${payload}`;
  const signer = createSign('SHA256');
  signer.update(data);
  signer.end();
  const der = signer.sign(privateKey);
  const raw = derToJose(der, 32);
  return `${data}.${raw.toString('base64url')}`;
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

export function derToJose(der: Buffer, size: number): Buffer {
  if (der[0] !== 0x30) throw new Error('bad der');
  let offset = 2;
  if (der[1] & 0x80) {
    offset = 2 + (der[1] & 0x7f);
  }
  const readInt = () => {
    if (der[offset] !== 0x02) throw new Error('bad int');
    const len = der[offset + 1];
    const start = offset + 2;
    const end = start + len;
    offset = end;
    let value = der.subarray(start, end);
    if (value[0] === 0x00) value = value.subarray(1);
    if (value.length > size) throw new Error('int too big');
    const out = Buffer.alloc(size);
    value.copy(out, size - value.length);
    return out;
  };
  return Buffer.concat([readInt(), readInt()]);
}
