export const SENSITIVE_LOG_KEYS = new Set([
  'password',
  'token',
  'authorization',
  'cookie',
  'pan',
  'cvv',
  'cvc',
  'pin',
  'cardNumber',
  'card_number',
  'walletLocalKey',
  'passHash',
  'applePayToken',
  'otp',
  'code',
  'apiKey',
  'api-key',
  'secret',
]);

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 500) return `${value.slice(0, 500)}…`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeForLog(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_LOG_KEYS.has(k) || SENSITIVE_LOG_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = sanitizeForLog(v, depth + 1);
    }
  }
  return out;
}

export class StructuredLogger {
  constructor(private readonly context: string) {}

  private write(level: string, message: string, meta?: Record<string, unknown>) {
    const line = {
      ts: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...(meta ? { meta: sanitizeForLog(meta) } : {}),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(line));
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.write('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    if ((process.env.LOG_LEVEL ?? 'info') === 'debug') {
      this.write('debug', message, meta);
    }
  }
}
