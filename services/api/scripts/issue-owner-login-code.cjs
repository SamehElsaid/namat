#!/usr/bin/env node
/**
 * Issue one owner login code when email delivery is unavailable.
 *
 * Stores only a bcrypt hash. Writes the plaintext to --out (mode 600).
 * Does not print the code, create a user, change a role, or grant an entitlement.
 *
 * Usage (inside the API container, env already loaded):
 *   node scripts/issue-owner-login-code.cjs --out /tmp/owner-login-code --ttl 7200
 */
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

function generateCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function main() {
  const outPath = arg('--out', '');
  const ttl = Number(arg('--ttl', '900'));
  const email = String(process.env.OWNER_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  if (!outPath) {
    console.error('Missing --out');
    process.exit(2);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('OWNER_BOOTSTRAP_EMAIL is not configured');
    process.exit(2);
  }
  if (!Number.isFinite(ttl) || ttl < 60 || ttl > 7200) {
    console.error('TTL must be between 60 and 7200 seconds');
    process.exit(2);
  }

  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || 'namat',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'namat',
  });
  await client.connect();
  try {
    const found = await client.query(
      `SELECT id, email, role, "isActive", "passwordHash" IS NOT NULL AS has_password
       FROM users
       WHERE lower(btrim(email)) = $1`,
      [email],
    );
    if (found.rowCount !== 1) {
      console.error('Existing account was not found');
      process.exit(1);
    }
    const user = found.rows[0];
    if (!user.isActive) {
      console.error('Account is disabled');
      process.exit(1);
    }
    const recent = await client.query(
      `SELECT count(*)::int AS n
       FROM login_codes
       WHERE email = $1 AND "createdAt" > now() - interval '15 minutes'`,
      [user.email],
    );
    if (recent.rows[0].n >= 3) {
      console.error('Rate limit reached');
      process.exit(1);
    }
    const code = generateCode(12);
    const codeHash = await bcrypt.hash(code, 10);
    const purpose = user.has_password ? 'password_reset' : 'owner_setup';
    await client.query('BEGIN');
    await client.query(
      `UPDATE login_codes SET "consumedAt" = now()
       WHERE email = $1 AND "consumedAt" IS NULL`,
      [user.email],
    );
    await client.query(
      `INSERT INTO login_codes
        (id, "userId", email, purpose, "codeHash", attempts, "expiresAt", "consumedAt", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, now() + ($5::int * interval '1 second'), NULL, now())`,
      [user.id, user.email, purpose, codeHash, String(ttl)],
    );
    await client.query('COMMIT');
    const grouped = code.replace(/(.{4})/g, '$1-').replace(/-$/, '');
    fs.writeFileSync(outPath, `${grouped}\n`, { mode: 0o600 });
    fs.chmodSync(outPath, 0o600);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        delivery: 'local-file',
        purpose,
        userReused: true,
        userId: user.id,
        expiresInSeconds: ttl,
      })}\n`,
    );
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* already closed */
    }
    console.error(err instanceof Error ? err.name : 'issue failed');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
