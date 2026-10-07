const ZIP_MAGICS = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];

/** Accepts a zip IPA that contains an app bundle. Does not trust the filename. */
export function assertIpaBytes(bytes: Buffer, maxBytes: number): void {
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > maxBytes) {
    throw new Error('ipa_invalid');
  }
  const magic = bytes.subarray(0, 4);
  if (!ZIP_MAGICS.some((expected) => magic.equals(expected))) {
    throw new Error('ipa_invalid');
  }
  if (bytes.indexOf(Buffer.from('Payload/')) < 0) throw new Error('ipa_invalid');
  if (bytes.indexOf(Buffer.from('.app/')) < 0) throw new Error('ipa_invalid');
}
