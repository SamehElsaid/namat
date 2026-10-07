import { inspectPrompt, withStylePreset } from './prompt-guard';

describe('AI prompt guard', () => {
  it('rejects a Luhn-valid PAN and redacts it', () => {
    const pan = '4111111111111111';
    const result = inspectPrompt(`please draw a card like ${pan}`);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('pan');
    expect(result.redacted).not.toContain(pan);
  });

  it('rejects CVV context, wallet hashes, and pairing material', () => {
    expect(inspectPrompt('cvv is 123 on the back').reasons).toContain('cvv');
    expect(
      inspectPrompt('pass 0123456789abcdef0123456789abcdef').reasons,
    ).toContain('wallet-hash');
    expect(inspectPrompt('import aircard_pairing.plist').reasons).toContain(
      'pairing',
    );
  });

  it('allows an ordinary style prompt', () => {
    expect(inspectPrompt('warm sandstone geometry at dusk').ok).toBe(true);
  });

  it('makes stylePresetId change the provider prompt', () => {
    const a = withStylePreset('dunes', 'sand');
    const b = withStylePreset('dunes', 'marble');
    expect(a).not.toBe(b);
    expect(a).toContain('Style preset: sand');
    expect(b).toContain('Style preset: marble');
  });
});
