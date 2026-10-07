import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { FORBIDDEN_PAYLOAD_FIELDS } from '@namat/shared';

const FORBIDDEN = new Set<string>(
  FORBIDDEN_PAYLOAD_FIELDS.map((f) => f.toLowerCase()),
);

export function isNearPayWebhook(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('payments/nearpay/webhook');
}

export function isMoyasarCallback(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('payments/moyasar/webhook') || url.includes('payments/moyasar/invoice-callback');
}

/** Drop forbidden keys in place. Used only on the provider webhook boundary. */
export function stripForbiddenKeys(value: unknown): string[] {
  const removed: string[] = [];
  const walk = (node: unknown) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (FORBIDDEN.has(key.toLowerCase())) {
        removed.push(key);
        delete record[key];
        continue;
      }
      walk(record[key]);
    }
  };
  walk(value);
  return removed;
}

function collectForbiddenKeys(
  value: unknown,
  path = '',
  found: string[] = [],
): string[] {
  if (value == null || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      collectForbiddenKeys(item, `${path}[${i}]`, found),
    );
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = path ? `${path}.${key}` : key;
    if (FORBIDDEN.has(key.toLowerCase())) {
      found.push(next);
    }
    collectForbiddenKeys(child, next, found);
  }
  return found;
}

/**
 * Hard privacy gate: reject any request body that includes Wallet/payment
 * secret field names (PAN, CVV, PIN, walletLocalKey, etc.).
 */
@Injectable()
export class PrivacyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      body?: unknown;
      originalUrl?: string;
      url?: string;
    }>();
    const url = req.originalUrl ?? req.url;
    if (Buffer.isBuffer(req.body)) return true;
    if (isNearPayWebhook(url) || isMoyasarCallback(url)) {
      stripForbiddenKeys(req.body);
      return true;
    }
    const hits = collectForbiddenKeys(req.body);
    if (hits.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'PrivacyViolation',
        message:
          'Request contains forbidden wallet/payment fields. NAMAT never accepts card secrets or Wallet identifiers.',
        fields: hits,
      });
    }
    return true;
  }
}

export { collectForbiddenKeys };
