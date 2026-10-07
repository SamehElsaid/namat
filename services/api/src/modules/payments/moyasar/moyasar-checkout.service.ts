import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { NAMAT_CURRENCY, NAMAT_PRICE_MINOR } from '@namat/shared';
import {
  PaymentWebhookEventEntity,
  PurchaseEntity,
} from '../../../database/entities';
import { AuditService } from '../../audit/audit.service';
import { PurchasesService } from '../../purchases/purchases.service';
import { PackagesService } from '../../packages/packages.service';
import { PackageEntity } from '../../../database/entities/package.entity';
import { PaymentsService } from '../payments.service';
import { MoyasarClient, MoyasarInvoice } from './moyasar.client';
import {
  CHECKOUT_UNAVAILABLE_AR,
  fullRefundConfirmed,
  isMoyasarPaymentEvent,
  modeOfSecretKey,
  MoyasarPaymentView,
  readMoyasarPayment,
  redactPaymentPayload,
} from './moyasar-facts';
import { PaymentSettingsService } from './payment-settings.service';
import { secretsEqual } from './secret-box';
import { StructuredLogger } from '../../../common/logging/logger';

const OPEN_STATUSES = ['pending', 'reserving'] as const;

@Injectable()
export class MoyasarCheckoutService {
  private readonly log = new StructuredLogger('MoyasarCheckout');

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PurchaseEntity)
    private readonly purchases: Repository<PurchaseEntity>,
    @InjectRepository(PaymentWebhookEventEntity)
    private readonly webhooks: Repository<PaymentWebhookEventEntity>,
    private readonly settings: PaymentSettingsService,
    private readonly client: MoyasarClient,
    private readonly purchasesService: PurchasesService,
    private readonly packagesService: PackagesService,
    private readonly nearpay: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Resolve the package a checkout is for. An explicit, published code wins;
   * otherwise the storefront default. Falls back to the legacy single product
   * so checkout keeps working before any package row exists.
   */
  private async resolvePackage(packageCode?: string | null): Promise<{
    code: string | null;
    priceMinor: number;
    currency: string;
    maxDevices: number;
    durationDays: number | null;
    nameEn: string;
  }> {
    let pkg: PackageEntity | null = null;
    if (packageCode) {
      pkg = await this.packagesService.requirePublishedByCode(packageCode);
    } else {
      pkg = await this.packagesService.defaultPublished();
    }
    if (!pkg) {
      return {
        code: null,
        priceMinor: NAMAT_PRICE_MINOR,
        currency: NAMAT_CURRENCY,
        maxDevices: 1,
        durationDays: null,
        nameEn: 'NAMAT lifetime',
      };
    }
    return {
      code: pkg.code,
      priceMinor: pkg.priceMinor,
      currency: pkg.currency.toUpperCase(),
      maxDevices: pkg.maxDevices,
      durationDays: pkg.durationDays,
      nameEn: pkg.nameEn,
    };
  }

  async availability(packageCode?: string) {
    const config = await this.settings.resolve();
    const pkg = await this.resolvePackage(packageCode).catch(() => null);
    const price = {
      priceMinor: pkg?.priceMinor ?? NAMAT_PRICE_MINOR,
      currency: pkg?.currency ?? NAMAT_CURRENCY,
      packageCode: pkg?.code ?? null,
      test: config.mode === 'test',
    };
    if (!config.checkoutAvailable) {
      return { available: false, message: CHECKOUT_UNAVAILABLE_AR, ...price };
    }
    return { available: true, message: null, ...price };
  }

  async start(userId: string, packageCode?: string) {
    const config = await this.settings.resolve();
    if (!config.checkoutAvailable) {
      throw new ServiceUnavailableException({
        error: 'checkout_unavailable',
        message: CHECKOUT_UNAVAILABLE_AR,
      });
    }
    const pkg = await this.resolvePackage(packageCode);
    const open = await this.reserve(userId, config.mode, pkg);
    if (this.hasReusableInvoice(open)) return this.presentExistingInvoice(open, config);

    const claimed = await this.claimInvoiceCreation(open);
    if (!claimed) {
      const fresh = await this.purchases.findOne({ where: { id: open.id } });
      if (fresh && this.hasReusableInvoice(fresh)) return this.presentExistingInvoice(fresh, config);
      return this.publicSession(fresh ?? open, config.mode);
    }
    const current = (await this.purchases.findOne({ where: { id: open.id } })) ?? open;
    if (open.providerState === 'unknown' || open.providerState === 'creating') {
      const recovered = await this.recoverInvoice(current, config.secretKey, config.mode);
      if (recovered.kind === 'found') {
        return { ...this.publicSession(recovered.purchase, config.mode), invoiceUrl: recovered.url };
      }
      if (recovered.kind === 'blocked') {
        current.providerState = 'unknown';
        current.status = 'reserving';
        await this.purchases.save(current);
        return this.publicSession(current, config.mode);
      }
    }

    const expires = new Date(Date.now() + 30 * 60 * 1000);
    const origin = config.publicBaseUrl;
    const created = await this.client.createInvoice(config.secretKey, {
      purchaseId: open.id,
      callbackUrl: `${origin}/api/v1/payments/moyasar/invoice-callback`,
      successUrl: `${origin}/checkout/return?purchaseId=${open.id}`,
      backUrl: `${origin}/checkout/return?purchaseId=${open.id}`,
      expiredAt: expires.toISOString(),
      amountMinor: current.amountMinor,
      currency: current.currency,
      description: pkg.nameEn,
    });
    if (!created.ok) {
      if (created.uncertain) {
        const recovered = await this.recoverInvoice(current, config.secretKey, config.mode);
        if (recovered.kind === 'found') {
          return { ...this.publicSession(recovered.purchase, config.mode), invoiceUrl: recovered.url };
        }
        current.providerState = 'unknown';
        current.status = 'reserving';
        await this.purchases.save(current);
        this.log.warn('Moyasar invoice response was uncertain', { purchaseId: current.id });
        return this.publicSession(current, config.mode);
      }
      current.status = 'rejected';
      current.providerState = 'failed';
      await this.purchases.save(current);
      throw new ServiceUnavailableException({
        error: 'payment_failed',
        message: 'تعذر بدء الدفع.',
      });
    }
    if (
      created.value.amount !== current.amountMinor ||
      created.value.currency.toUpperCase() !== current.currency.toUpperCase() ||
      (created.value.metadataPurchaseId && created.value.metadataPurchaseId !== current.id)
    ) {
      await this.client.cancelInvoice(config.secretKey, created.value.id);
      current.status = 'rejected';
      current.providerState = 'amount_mismatch';
      current.moyasarInvoiceId = created.value.id;
      await this.purchases.save(current);
      throw new ServiceUnavailableException({
        error: 'checkout_unavailable',
        message: CHECKOUT_UNAVAILABLE_AR,
      });
    }
    current.moyasarInvoiceId = created.value.id;
    current.providerState = 'invoice_open';
    current.status = 'pending';
    current.invoiceExpiresAt = expires;
    await this.purchases.save(current);
    return {
      ...this.publicSession(current, config.mode),
      invoiceUrl: created.value.url,
    };
  }

  async refresh(userId: string, purchaseId: string) {
    const purchase = await this.purchases.findOne({ where: { id: purchaseId, userId } });
    if (!purchase) throw new NotFoundException('Purchase not found');
    if (purchase.provider === 'moyasar' && purchase.moyasarInvoiceId) {
      const config = await this.settings.resolve();
      if (config.secretKey) {
        const fetched = await this.client.fetchInvoice(config.secretKey, purchase.moyasarInvoiceId);
        const verifiedMode = modeOfSecretKey(config.secretKey);
        if (fetched.ok && verifiedMode) {
          await this.applyInvoice(purchase, fetched.value, verifiedMode);
        }
      }
    }
    const fresh = await this.purchases.findOne({ where: { id: purchaseId, userId } });
    return this.purchasesService.presentOwned(fresh ?? purchase);
  }

  /**
   * Moyasar webhook auth is fail-closed: missing or wrong `secret_token`
   * is rejected before any event parsing, idempotency write, or payment
   * fetch. Knowing the payment id is not a substitute for authentication.
   */
  async handleWebhook(body: unknown) {
    const config = await this.settings.resolve();
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const token = typeof record.secret_token === 'string' ? record.secret_token : '';
    const authenticated =
      config.webhookSecret.length > 0 && token.length > 0 && secretsEqual(token, config.webhookSecret);
    if (!authenticated) {
      return { ok: false, authenticated: false };
    }
    const eventId = typeof record.id === 'string' ? record.id : null;
    const paymentEvent = isMoyasarPaymentEvent(record.type);
    if (!paymentEvent) return { ok: true, ignored: true, authenticated: true };
    const hinted = readMoyasarPayment(record.data);
    if (eventId) {
      const replay = await this.rememberEvent(eventId, record.type, hinted);
      if (replay) return { ok: true, idempotent: true, authenticated: true };
    }
    if (hinted?.id && config.secretKey) {
      const fetched = await this.client.fetchPayment(config.secretKey, hinted.id);
      const verifiedMode = modeOfSecretKey(config.secretKey);
      // Fetch Payment does not document a live flag. The webhook envelope does.
      // A test event must not be applied through a live secret key.
      if (fetched.ok && verifiedMode && !(record.live === false && verifiedMode === 'live')) {
        await this.applyPayment(fetched.value, verifiedMode);
        if (eventId) await this.markProcessed(eventId);
        return { ok: true, idempotent: false, authenticated: true };
      }
    }
    return { ok: true, authenticated: true, pending: true };
  }

  async handleInvoiceCallback(body: unknown) {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const invoiceId = typeof record.id === 'string' ? record.id : null;
    if (!invoiceId) return { ok: true, ignored: true };
    const purchase = await this.purchases.findOne({ where: { moyasarInvoiceId: invoiceId } });
    if (!purchase) return { ok: true, ignored: true };
    const config = await this.settings.resolve();
    if (!config.secretKey) return { ok: true, pending: true };
    const fetched = await this.client.fetchInvoice(config.secretKey, invoiceId);
    const verifiedMode = modeOfSecretKey(config.secretKey);
    if (!fetched.ok || !verifiedMode) return { ok: false, pending: true };
    await this.applyInvoice(purchase, fetched.value, verifiedMode);
    return { ok: true };
  }

  async refund(
    purchaseId: string,
    actor: { userId: string | null; email: string | null },
    reason: string,
  ) {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      throw new ConflictException({ error: 'reason_required', message: 'A refund reason is required.' });
    }
    const purchase = await this.purchasesService.getById(purchaseId);
    if (purchase.provider === 'nearpay') {
      const result = await this.nearpay.requestAdjustment(purchaseId, 'refund');
      await this.audit.record({
        action: 'purchase.refund',
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'owner',
        resourceType: 'purchase',
        resourceId: purchaseId,
        result: result.confirmed ? 'success' : 'pending',
        metadata: { provider: 'nearpay', reason: cleanReason, status: result.status },
      });
      return result;
    }
    if (purchase.provider !== 'moyasar' || !purchase.moyasarPaymentId) {
      throw new ConflictException({ error: 'refund_unavailable', message: 'This purchase cannot be refunded.' });
    }
    if (purchase.status === 'refunded') {
      return { ok: true, status: 'refunded', confirmed: true, idempotent: true };
    }
    if (purchase.providerState === 'refund_pending' || !(await this.claimRefund(purchase))) {
      return this.reconcileRefund(purchase, actor, cleanReason);
    }
    const config = await this.settings.resolve();
    const key = config.secretKey;
    if (!key) {
      purchase.providerState = purchase.providerMode === 'test' ? 'paid_test' : 'paid_live';
      await this.purchases.save(purchase);
      throw new ServiceUnavailableException({ error: 'refund_unavailable', message: 'Refunds are not configured.' });
    }
    const sent = await this.client.refundPayment(key, purchase.moyasarPaymentId);
    if (!sent.ok && sent.uncertain) {
      await this.audit.record({
        action: 'purchase.refund',
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'owner',
        resourceType: 'purchase',
        resourceId: purchaseId,
        result: 'pending',
        metadata: { provider: 'moyasar', reason: cleanReason },
      });
      return { ok: true, status: purchase.status, confirmed: false, idempotent: false };
    }
    const fetched = await this.client.fetchPayment(key, purchase.moyasarPaymentId);
    if (fetched.ok && fullRefundConfirmed(fetched.value, purchase.amountMinor)) {
      await this.purchasesService.markRefunded(purchase.id);
      await this.audit.record({
        action: 'purchase.refund',
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'owner',
        resourceType: 'purchase',
        resourceId: purchaseId,
        result: 'success',
        metadata: { provider: 'moyasar', reason: cleanReason, mode: purchase.providerMode },
      });
      return { ok: true, status: 'refunded', confirmed: true, idempotent: false };
    }
    const stillPaid = fetched.ok && fetched.value.status === 'paid' && fetched.value.refunded === 0;
    if (!sent.ok && !sent.uncertain && stillPaid) {
      purchase.providerState = purchase.providerMode === 'test' ? 'paid_test' : 'paid_live';
      await this.purchases.save(purchase);
      await this.audit.record({
        action: 'purchase.refund',
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'owner',
        resourceType: 'purchase',
        resourceId: purchaseId,
        result: 'failure',
        metadata: { provider: 'moyasar', reason: cleanReason },
      });
      return { ok: true, status: purchase.status, confirmed: false, idempotent: false };
    }
    await this.audit.record({
      action: 'purchase.refund',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'owner',
      resourceType: 'purchase',
      resourceId: purchaseId,
      result: 'pending',
      metadata: { provider: 'moyasar', reason: cleanReason },
    });
    return { ok: true, status: purchase.status, confirmed: false, idempotent: false };
  }

  private async reconcileRefund(
    purchase: PurchaseEntity,
    actor: { userId: string | null; email: string | null },
    reason: string,
  ) {
    const config = await this.settings.resolve();
    const fetched = config.secretKey && purchase.moyasarPaymentId
      ? await this.client.fetchPayment(config.secretKey, purchase.moyasarPaymentId)
      : null;
    if (fetched?.ok && fullRefundConfirmed(fetched.value, purchase.amountMinor)) {
      await this.purchasesService.markRefunded(purchase.id);
      await this.audit.record({
        action: 'purchase.refund',
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'owner',
        resourceType: 'purchase',
        resourceId: purchase.id,
        result: 'success',
        metadata: { provider: 'moyasar', reason, reconciled: true },
      });
      return { ok: true, status: 'refunded', confirmed: true, idempotent: true };
    }
    return { ok: true, status: purchase.status, confirmed: false, idempotent: true };
  }

  private async reserve(
    userId: string,
    mode: 'test' | 'live',
    pkg: {
      code: string | null;
      priceMinor: number;
      currency: string;
      maxDevices: number;
      durationDays: number | null;
    },
  ): Promise<PurchaseEntity> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(PurchaseEntity);
        const entitlement = await this.purchasesService.lockActiveEntitlement(manager, userId);
        if (entitlement?.status === 'active') {
          throw new ConflictException({
            error: 'entitlement_active',
            message: 'نَمَط مفعّل على هذا الحساب.',
          });
        }
        const existing = await repo.findOne({
          where: [
            { userId, provider: 'moyasar', status: 'pending' },
            { userId, provider: 'moyasar', status: 'reserving' },
          ],
        });
        if (existing) {
          // Before an invoice is bound, a re-started checkout may switch package.
          if (!existing.moyasarInvoiceId && existing.packageCode !== pkg.code) {
            existing.amountMinor = pkg.priceMinor;
            existing.currency = pkg.currency;
            existing.packageCode = pkg.code;
            existing.packageMaxDevices = pkg.maxDevices;
            existing.packageDurationDays = pkg.durationDays;
            return repo.save(existing);
          }
          return existing;
        }
        const created = repo.create({
          userId,
          status: 'reserving',
          amountMinor: pkg.priceMinor,
          currency: pkg.currency,
          provider: 'moyasar',
          customerReferenceNumber: `namat_${cryptoRandom()}`,
          nearpayTransactionId: null,
          nearpayMerchantId: null,
          nearpayTerminalId: null,
          retrievalReferenceNumber: null,
          providerMode: mode,
          moyasarInvoiceId: null,
          moyasarPaymentId: null,
          providerState: 'reserving',
          paymentMethodType: null,
          paymentMethodBrand: null,
          paymentMethodLast4: null,
          invoiceExpiresAt: null,
          packageCode: pkg.code,
          packageMaxDevices: pkg.maxDevices,
          packageDurationDays: pkg.durationDays,
        });
        return repo.save(created);
      });
    } catch (error) {
      if (error instanceof QueryFailedError && uniqueViolation(error)) {
        const existing = await this.purchases.findOne({
          where: [
            { userId, provider: 'moyasar', status: 'pending' },
            { userId, provider: 'moyasar', status: 'reserving' },
          ],
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private hasReusableInvoice(purchase: PurchaseEntity): boolean {
    return Boolean(
      purchase.moyasarInvoiceId &&
      purchase.providerState !== 'unknown' &&
      purchase.providerState !== 'creating',
    );
  }

  private async presentExistingInvoice(
    purchase: PurchaseEntity,
    config: { secretKey: string; mode: 'test' | 'live' },
  ) {
    if (!purchase.moyasarInvoiceId) return this.publicSession(purchase, config.mode);
    const fetched = await this.client.fetchInvoice(config.secretKey, purchase.moyasarInvoiceId);
    const verifiedMode = modeOfSecretKey(config.secretKey);
    if (!fetched.ok || !verifiedMode) return this.publicSession(purchase, config.mode);
    await this.applyInvoice(purchase, fetched.value, verifiedMode);
    const fresh = await this.purchases.findOne({ where: { id: purchase.id } });
    const current = fresh ?? purchase;
    if (current.status === 'pending' && fetched.value.status === 'initiated') {
      return { ...this.publicSession(current, config.mode), invoiceUrl: fetched.value.url };
    }
    return this.publicSession(current, config.mode);
  }

  /** One in-flight create per purchase. A second caller must reuse or wait. */
  private async claimInvoiceCreation(purchase: PurchaseEntity): Promise<boolean> {
    const staleBefore = new Date(Date.now() - 90_000);
    const result = await this.purchases
      .createQueryBuilder()
      .update(PurchaseEntity)
      .set({ providerState: 'creating', status: 'reserving', updatedAt: new Date() })
      .where('id = :id', { id: purchase.id })
      .andWhere('"moyasarInvoiceId" IS NULL')
      .andWhere(
        `("providerState" IN (:...open) OR ("providerState" = 'creating' AND ("updatedAt" IS NULL OR "updatedAt" < :stale)))`,
        { open: ['reserving', 'unknown'], stale: staleBefore },
      )
      .execute();
    return (result.affected ?? 0) === 1;
  }

  /** One outbound refund. A timeout stays refund_pending until a later fetch confirms it. */
  private async claimRefund(purchase: PurchaseEntity): Promise<boolean> {
    const result = await this.purchases
      .createQueryBuilder()
      .update(PurchaseEntity)
      .set({ providerState: 'refund_pending', updatedAt: new Date() })
      .where('id = :id', { id: purchase.id })
      .andWhere('status IN (:...statuses)', { statuses: ['approved', 'test_paid'] })
      .andWhere(`("providerState" IS NULL OR "providerState" != 'refund_pending')`)
      .execute();
    return (result.affected ?? 0) === 1;
  }

  private async recoverInvoice(
    purchase: PurchaseEntity,
    secretKey: string,
    mode: 'test' | 'live',
  ): Promise<
    | { kind: 'found'; purchase: PurchaseEntity; url: string | null }
    | { kind: 'none' }
    | { kind: 'blocked' }
  > {
    if (!secretKey) return { kind: 'blocked' };
    const listed = await this.client.listInvoicesByPurchase(secretKey, purchase.id);
    if (!listed.ok || !listed.value.complete) return { kind: 'blocked' };
    const match = listed.value.invoices.filter(
      (invoice) =>
        invoice.metadataPurchaseId === purchase.id &&
        invoice.amount === purchase.amountMinor &&
        invoice.currency.toUpperCase() === purchase.currency.toUpperCase(),
    );
    if (match.length > 1) return { kind: 'blocked' };
    if (match.length === 0) return { kind: 'none' };
    purchase.moyasarInvoiceId = match[0].id;
    purchase.providerState = 'invoice_open';
    purchase.status = 'pending';
    await this.purchases.save(purchase);
    const verifiedMode = modeOfSecretKey(secretKey);
    if (verifiedMode) await this.applyInvoice(purchase, match[0], verifiedMode);
    const fresh = (await this.purchases.findOne({ where: { id: purchase.id } })) ?? purchase;
    return { kind: 'found', purchase: fresh, url: match[0].url };
  }

  private async applyInvoice(purchase: PurchaseEntity, invoice: MoyasarInvoice, mode: 'test' | 'live') {
    if (invoice.metadataPurchaseId && invoice.metadataPurchaseId !== purchase.id) return;
    if (invoice.status === 'expired' || invoice.status === 'canceled' || invoice.status === 'cancelled') {
      if (OPEN_STATUSES.includes(purchase.status as (typeof OPEN_STATUSES)[number])) {
        purchase.status = 'cancelled';
        purchase.providerState = invoice.status;
        await this.purchases.save(purchase);
      }
      return;
    }
    const paid = invoice.payments.find((payment) => payment.status === 'paid' || payment.status === 'refunded');
    if (!paid) return;
    if (paid.invoiceId && paid.invoiceId !== invoice.id) return;
    await this.applyPayment({ ...paid, invoiceId: paid.invoiceId ?? invoice.id }, mode, purchase.id);
  }

  private async applyPayment(payment: MoyasarPaymentView, mode: 'test' | 'live', knownPurchaseId?: string) {
    let purchaseId = payment.metadataPurchaseId;
    if (!purchaseId && payment.invoiceId) {
      const row = await this.purchases.findOne({ where: { moyasarInvoiceId: payment.invoiceId } });
      purchaseId = row?.id ?? knownPurchaseId ?? null;
    }
    if (!purchaseId) return;
    await this.purchasesService.applyMoyasarVerification({
      purchaseId,
      mode,
      payment,
    });
  }

  private async rememberEvent(eventId: string, type: unknown, payment: MoyasarPaymentView | null) {
    const existing = await this.webhooks.findOne({ where: { providerEventKey: `moyasar:${eventId}` } });
    if (existing?.processed) return true;
    if (!existing) {
      try {
        await this.webhooks.save(
          this.webhooks.create({
            providerEventKey: `moyasar:${eventId}`,
            provider: 'moyasar',
            eventType: typeof type === 'string' ? type.slice(0, 64) : 'unknown',
            transactionId: payment?.id ?? null,
            customerReferenceNumber: null,
            status: payment?.status ?? null,
            amountMinor: payment?.amount ?? null,
            currency: payment?.currency ?? null,
            merchantId: null,
            terminalId: null,
            processed: false,
          }),
        );
      } catch (error) {
        if (error instanceof QueryFailedError && uniqueViolation(error)) {
          const raced = await this.webhooks.findOne({ where: { providerEventKey: `moyasar:${eventId}` } });
          return Boolean(raced?.processed);
        }
        throw error;
      }
    }
    return false;
  }

  private async markProcessed(eventId: string) {
    const row = await this.webhooks.findOne({ where: { providerEventKey: `moyasar:${eventId}` } });
    if (!row) return;
    row.processed = true;
    await this.webhooks.save(row);
  }

  private publicSession(purchase: PurchaseEntity, mode: 'test' | 'live') {
    return {
      purchaseId: purchase.id,
      status: purchase.status === 'reserving' ? 'pending' : purchase.status,
      test: mode === 'test',
      invoiceUrl: null as string | null,
    };
  }
}

function cryptoRandom(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function uniqueViolation(error: QueryFailedError): boolean {
  const driver = error.driverError as { code?: string } | undefined;
  return driver?.code === '23505' || /unique/i.test(error.message);
}

export function webhookBodyForLog(body: unknown): unknown {
  return redactPaymentPayload(body);
}
