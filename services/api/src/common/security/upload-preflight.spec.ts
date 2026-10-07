import { UnauthorizedException } from '@nestjs/common';
import { AuthUser } from '../decorators/auth.decorators';
import { authorizeLargeUpload, UploadPreflightDeps } from './upload-preflight';

const staff: AuthUser = {
  userId: 'u1',
  email: 'owner@example.com',
  role: 'owner',
  sessionId: 's1',
  purpose: 'staff',
};

function deps(user: AuthUser | null): UploadPreflightDeps {
  return {
    signingCallbackToken: 'signing-secret',
    adminApiToken: 'admin-secret',
    validateAccessToken: async () => {
      if (!user) throw new UnauthorizedException();
      return user;
    },
  };
}

describe('large upload preflight', () => {
  it('requires the signing callback token for signed IPA artifacts', async () => {
    await expect(
      authorizeLargeUpload('signing-artifact', {}, deps(staff)),
    ).resolves.toBe(false);
    await expect(
      authorizeLargeUpload(
        'signing-artifact',
        { authorization: 'Bearer wrong' },
        deps(staff),
      ),
    ).resolves.toBe(false);
    await expect(
      authorizeLargeUpload(
        'signing-artifact',
        { authorization: 'Bearer signing-secret' },
        deps(null),
      ),
    ).resolves.toBe(true);
  });

  it('does not accept a staff session for signed IPA artifacts', async () => {
    await expect(
      authorizeLargeUpload(
        'signing-artifact',
        { authorization: 'Bearer staff-jwt' },
        deps(staff),
      ),
    ).resolves.toBe(false);
  });

  it('accepts the admin token or a staff session for the stable payload', async () => {
    await expect(
      authorizeLargeUpload('stable-payload', { authorization: 'Bearer admin-secret' }, deps(null)),
    ).resolves.toBe(true);
    await expect(
      authorizeLargeUpload('stable-payload', { authorization: 'Bearer staff-jwt' }, deps(staff)),
    ).resolves.toBe(true);
  });

  it('refuses anonymous, customer, and password-setup sessions for the stable payload', async () => {
    await expect(authorizeLargeUpload('stable-payload', {}, deps(staff))).resolves.toBe(false);
    await expect(
      authorizeLargeUpload('stable-payload', { authorization: 'Bearer x' }, deps(null)),
    ).resolves.toBe(false);
    await expect(
      authorizeLargeUpload(
        'stable-payload',
        { authorization: 'Bearer x' },
        deps({ ...staff, role: 'user', purpose: 'customer' }),
      ),
    ).resolves.toBe(false);
    await expect(
      authorizeLargeUpload(
        'stable-payload',
        { authorization: 'Bearer x' },
        deps({ ...staff, purpose: 'password_setup' }),
      ),
    ).resolves.toBe(false);
  });

  it('requires the CSRF header with a cookie session', async () => {
    const cookie = { cookie: 'namat_session=staff-jwt' };
    await expect(authorizeLargeUpload('stable-payload', cookie, deps(staff))).resolves.toBe(false);
    await expect(
      authorizeLargeUpload(
        'stable-payload',
        { ...cookie, 'x-namat-request': '1' },
        deps(staff),
      ),
    ).resolves.toBe(true);
  });
});
