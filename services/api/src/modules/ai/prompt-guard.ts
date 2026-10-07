const PAIRING =
  /aircard_pairing|airlift_pairing|mobiledevicepairing|host_alt_irk|al_pairing_run_host|pairing\.plist/i;
const WALLET_HASH = /\b[0-9a-f]{32,}\b/i;
const PASS_HASH = /(?<![A-Za-z0-9])[A-Za-z0-9+/_-]{27,}={1,2}(?![A-Za-z0-9])/;
const CVV =
  /\b(cvv|cvc|cvn|security code|card code|pin)\b[^0-9]{0,16}\b\d{3,4}\b|\b\d{3,4}\b[^a-z]{0,16}\b(cvv|cvc|cvn|security code|card code)\b/i;

export interface PromptInspection {
  ok: boolean;
  redacted: string;
  reasons: string[];
}

export function withStylePreset(prompt: string, stylePresetId?: string | null): string {
  const style = (stylePresetId ?? '').trim();
  if (!style) return prompt;
  return `${prompt}\n\nStyle preset: ${style}. Apply this visual style to the card artwork.`;
}

function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0 && digits.length >= 13 && digits.length <= 19;
}

function findPans(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:\d[ -]?){13,19}/g;
  for (const match of text.matchAll(pattern)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) {
      found.push(digits);
    }
  }
  return found;
}

export function inspectPrompt(prompt: string): PromptInspection {
  const reasons: string[] = [];
  let redacted = prompt;
  const pans = findPans(prompt);
  if (pans.length > 0) {
    reasons.push('pan');
    for (const pan of pans) {
      redacted = redacted.split(pan).join('[redacted-pan]');
    }
  }
  if (CVV.test(prompt)) {
    reasons.push('cvv');
    redacted = redacted.replace(CVV, '[redacted-card-secret]');
  }
  if (WALLET_HASH.test(prompt) || PASS_HASH.test(prompt)) {
    reasons.push('wallet-hash');
    redacted = redacted.replace(WALLET_HASH, '[redacted-hash]');
  }
  if (PAIRING.test(prompt)) {
    reasons.push('pairing');
    redacted = redacted.replace(PAIRING, '[redacted-pairing]');
  }
  return { ok: reasons.length === 0, redacted, reasons };
}
