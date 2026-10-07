import { readFileSync } from 'fs';
import { signIpaAttestation, verifyIpaSignature } from './ipa-signature';

/**
 * macOS/CI entry point. Prints verification JSON.
 * When IPA_VERIFICATION_PRIVATE_KEY is set and the IPA passes, also prints a
 * signed attestation the Linux API can check against the IPA SHA-256.
 * This is not an owner override.
 */
async function main(): Promise<void> {
  const ipa = process.argv[2];
  if (!ipa) {
    process.stderr.write('usage: attest-ipa.cli.ts <file.ipa>\n');
    process.exit(2);
  }
  const result = await verifyIpaSignature(readFileSync(ipa));
  const privateKey = process.env.IPA_VERIFICATION_PRIVATE_KEY ?? '';
  if (
    result.verified &&
    result.bundleId &&
    result.executable &&
    result.profileExpiresAt &&
    privateKey.trim()
  ) {
    const attestation = signIpaAttestation(
      {
        sha256: result.sha256,
        bundleId: result.bundleId,
        executable: result.executable,
        profileExpiresAt: result.profileExpiresAt,
      },
      privateKey,
    );
    process.stdout.write(`${JSON.stringify(attestation)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.verified) process.exit(result.reason === 'verifier_unavailable' ? 3 : 1);
}

void main();
