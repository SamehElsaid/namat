import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaymentCredentialEntity,
  PaymentSettingsEntity,
} from '../../../database/entities';
import { AuditService } from '../../audit/audit.service';
import {
  checkoutReadiness,
  maskKey,
  PaymentMode,
} from './moyasar-facts';
import {
  decryptSecret,
  encryptSecret,
  paymentConfigKey,
} from './secret-box';

export interface ResolvedPaymentConfig {
  checkoutEnabled: boolean;
  mode: PaymentMode;
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  publicBaseUrl: string;
  ready: boolean;
  reasons: string[];
  checkoutAvailable: boolean;
}

@Injectable()
export class PaymentSettingsService {
  constructor(
    @InjectRepository(PaymentSettingsEntity)
    private readonly settings: Repository<PaymentSettingsEntity>,
    @InjectRepository(PaymentCredentialEntity)
    private readonly credentials: Repository<PaymentCredentialEntity>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async resolve(): Promise<ResolvedPaymentConfig> {
    const row = await this.ensureSettings();
    const stored = await this.credentials.findOne({ where: { id: 'default' } });
    const key = paymentConfigKey(this.config.get<string>('app.paymentConfigKey'));
    const secretKey = this.pick(
      stored?.secretKeyCipher,
      this.config.get<string>('app.moyasarSecretKey') ?? '',
      key,
    );
    const publishableKey = this.pick(
      stored?.publishableKeyCipher,
      this.config.get<string>('app.moyasarPublishableKey') ?? '',
      key,
    );
    const webhookSecret = this.pick(
      stored?.webhookSecretCipher,
      this.config.get<string>('app.moyasarWebhookSecret') ?? '',
      key,
    );
    const publicBaseUrl = (this.config.get<string>('app.publicBaseUrl') ?? '').replace(/\/$/, '');
    const readiness = checkoutReadiness({
      mode: row.mode,
      secretKey,
      publishableKey,
      webhookSecret,
      publicBaseUrl,
    });
    return {
      checkoutEnabled: row.checkoutEnabled,
      mode: row.mode,
      secretKey,
      publishableKey,
      webhookSecret,
      publicBaseUrl,
      ready: readiness.ready,
      reasons: readiness.reasons,
      checkoutAvailable: row.checkoutEnabled && readiness.ready,
    };
  }

  async view() {
    const resolved = await this.resolve();
    return {
      checkoutEnabled: resolved.checkoutEnabled,
      mode: resolved.mode,
      ready: resolved.ready,
      checkoutAvailable: resolved.checkoutAvailable,
      reasons: resolved.reasons,
      secretKey: maskKey(resolved.secretKey),
      publishableKey: maskKey(resolved.publishableKey),
      webhookSecretConfigured: resolved.webhookSecret.trim().length >= 16,
      credentialReplacementAvailable: paymentConfigKey(
        this.config.get<string>('app.paymentConfigKey'),
      ) != null,
    };
  }

  async update(
    input: {
      checkoutEnabled?: boolean;
      mode?: PaymentMode;
      secretKey?: string;
      publishableKey?: string;
      webhookSecret?: string;
      clearSecretKey?: boolean;
      clearPublishableKey?: boolean;
      clearWebhookSecret?: boolean;
    },
    actor: { userId: string | null; email: string | null },
  ) {
    const current = await this.resolve();
    // A cleared credential reverts to the environment fallback (often empty).
    const envSecret = (this.config.get<string>('app.moyasarSecretKey') ?? '').trim();
    const envPublishable = (this.config.get<string>('app.moyasarPublishableKey') ?? '').trim();
    const envWebhook = (this.config.get<string>('app.moyasarWebhookSecret') ?? '').trim();
    const mode = input.mode ?? current.mode;
    const secretKey = input.clearSecretKey
      ? envSecret
      : blank(input.secretKey)
        ? current.secretKey
        : input.secretKey!.trim();
    const publishableKey = input.clearPublishableKey
      ? envPublishable
      : blank(input.publishableKey)
        ? current.publishableKey
        : input.publishableKey!.trim();
    const webhookSecret = input.clearWebhookSecret
      ? envWebhook
      : blank(input.webhookSecret)
        ? current.webhookSecret
        : input.webhookSecret!.trim();
    const checkoutEnabled = input.checkoutEnabled ?? current.checkoutEnabled;
    const readiness = checkoutReadiness({
      mode,
      secretKey,
      publishableKey,
      webhookSecret,
      publicBaseUrl: current.publicBaseUrl,
    });
    if (checkoutEnabled && !readiness.ready) {
      await this.audit.record({
        action: 'payment_settings.update',
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'owner',
        resourceType: 'payment_settings',
        resourceId: 'default',
        result: 'failure',
        metadata: { reasons: readiness.reasons, checkoutEnabled: false },
      });
      return { ok: false as const, reasons: readiness.reasons };
    }

    // Clearing a stored credential removes its ciphertext; the resolver then
    // falls back to the environment value (if any). It needs no encryption key.
    const clearing =
      input.clearSecretKey || input.clearPublishableKey || input.clearWebhookSecret;
    if (clearing) {
      const existing = await this.credentials.findOne({ where: { id: 'default' } });
      if (existing) {
        if (input.clearSecretKey) existing.secretKeyCipher = null;
        if (input.clearPublishableKey) existing.publishableKeyCipher = null;
        if (input.clearWebhookSecret) existing.webhookSecretCipher = null;
        await this.credentials.save(existing);
      }
      await this.audit.record({
        action: 'payment_settings.clear_credentials',
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'owner',
        resourceType: 'payment_credentials',
        resourceId: 'default',
        result: 'success',
        metadata: {
          secretKey: Boolean(input.clearSecretKey),
          publishableKey: Boolean(input.clearPublishableKey),
          webhookSecret: Boolean(input.clearWebhookSecret),
        },
      });
    }

    const replacing =
      !blank(input.secretKey) || !blank(input.publishableKey) || !blank(input.webhookSecret);
    if (replacing) {
      const key = paymentConfigKey(this.config.get<string>('app.paymentConfigKey'));
      if (!key) {
        await this.audit.record({
          action: 'payment_settings.replace_credentials',
          actorUserId: actor.userId,
          actorEmail: actor.email,
          actorType: 'owner',
          resourceType: 'payment_credentials',
          resourceId: 'default',
          result: 'failure',
          metadata: { reason: 'encryption_key_missing' },
        });
        return { ok: false as const, reasons: ['encryption_key'] };
      }
      const existing =
        (await this.credentials.findOne({ where: { id: 'default' } })) ??
        this.credentials.create({ id: 'default' });
      if (!blank(input.secretKey)) existing.secretKeyCipher = encryptSecret(secretKey, key);
      if (!blank(input.publishableKey)) {
        existing.publishableKeyCipher = encryptSecret(publishableKey, key);
      }
      if (!blank(input.webhookSecret)) {
        existing.webhookSecretCipher = encryptSecret(webhookSecret, key);
      }
      await this.credentials.save(existing);
    }

    const row = await this.ensureSettings();
    row.mode = mode;
    row.checkoutEnabled = checkoutEnabled;
    await this.settings.save(row);
    await this.audit.record({
      action: 'payment_settings.update',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'owner',
      resourceType: 'payment_settings',
      resourceId: 'default',
      result: 'success',
      metadata: {
        checkoutEnabled,
        mode,
        ready: readiness.ready,
        secretKey: maskKey(secretKey),
        publishableKey: maskKey(publishableKey),
        webhookSecretConfigured: webhookSecret.trim().length >= 16,
      },
    });
    return { ok: true as const, settings: await this.view() };
  }

  private async ensureSettings(): Promise<PaymentSettingsEntity> {
    const existing = await this.settings.findOne({ where: { id: 'default' } });
    if (existing) return existing;
    return this.settings.save(
      this.settings.create({ id: 'default', checkoutEnabled: false, mode: 'test' }),
    );
  }

  private pick(cipher: string | null | undefined, envValue: string, key: Buffer | null): string {
    if (cipher && key) {
      const plain = decryptSecret(cipher, key);
      if (plain) return plain;
    }
    return envValue.trim();
  }
}

function blank(value: string | undefined): boolean {
  return !value || value.trim() === '';
}
