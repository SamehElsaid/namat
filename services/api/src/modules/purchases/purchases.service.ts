import {
  Injectable,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { EntityManager, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MAX_ACTIVE_INSTALLATIONS } from '@namat/shared';
import { paymentFactsAllowEntitlement } from '../payments/payment-facts';
import {
  fullRefundConfirmed,
  moyasarPaymentGrantsEntitlement,
  MoyasarPaymentView,
  PaymentMode,
} from '../payments/moyasar/moyasar-facts';
import { presentCustomerPurchase } from './customer-purchase';
import {
  PurchaseEntity,
  PurchaseStatusDb,
} from '../../database/entities/purchase.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { AuditService } from '../audit/audit.service';
import { StructuredLogger } from '../../common/logging/logger';

export interface ApplyPaymentEventInput {
  customerReferenceNumber: string | null;
  transactionId: string | null;
  status: PurchaseStatusDb;
  amountMinor: number | null;
  currency: string | null;
  merchantId: string | null;
  expectedMerchantId?: string | null;
  terminalId: string | null;
  expectedTerminalId?: string | null;
  retrievalReferenceNumber: string | null;
}

@Injectable()
export class PurchasesService {
  private readonly log = new StructuredLogger('PurchasesService');

  constructor(
    @InjectRepository(PurchaseEntity)
    private readonly purchases: Repository<PurchaseEntity>,
    @InjectRepository(EntitlementEntity)
    private readonly entitlements: Repository<EntitlementEntity>,
    private readonly audit: AuditService,
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  async createPending(params: {
    userId: string;
    amountMinor: number;
    currency: string;
  }): Promise<PurchaseEntity> {
    const customerReferenceNumber = `namat_${uuidv4().replace(/-/g, '')}`;
    const purchase = this.purchases.create({
      userId: params.userId,
      status: 'pending',
      amountMinor: params.amountMinor,
      currency: params.currency,
      provider: 'nearpay',
      customerReferenceNumber,
      nearpayTransactionId: null,
      nearpayMerchantId: null,
      nearpayTerminalId: null,
      retrievalReferenceNumber: null,
    });
    return this.purchases.save(purchase);
  }

  async rememberNearpayJob(
    customerReferenceNumber: string,
    jobId: string,
  ): Promise<void> {
    const purchase = await this.findByCustomerRef(customerReferenceNumber);
    if (!purchase) return;
    purchase.nearpayJobId = jobId;
    await this.purchases.save(purchase);
  }

  async getById(id: string): Promise<PurchaseEntity> {
    const row = await this.purchases.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Purchase not found');
    return row;
  }

  async findByCustomerRef(ref: string): Promise<PurchaseEntity | null> {
    return this.purchases.findOne({ where: { customerReferenceNumber: ref } });
  }

  async applyPaymentEvent(input: ApplyPaymentEventInput): Promise<{
    purchaseId: string | null;
    entitlementId: string | null;
  }> {
    let purchase: PurchaseEntity | null = null;
    if (input.customerReferenceNumber) {
      purchase = await this.findByCustomerRef(input.customerReferenceNumber);
    }
    if (!purchase && input.transactionId) {
      purchase = await this.purchases.findOne({
        where: { nearpayTransactionId: input.transactionId },
      });
    }
    if (!purchase) {
      this.log.warn('Payment event for unknown purchase', {
        customerReferenceNumber: input.customerReferenceNumber,
        transactionId: input.transactionId,
      });
      return { purchaseId: null, entitlementId: null };
    }

    // Idempotent: already approved — return existing entitlement
    if (purchase.status === 'approved' && input.status === 'approved') {
      const existing = await this.entitlements.findOne({
        where: { userId: purchase.userId },
      });
      return {
        purchaseId: purchase.id,
        entitlementId: existing?.id ?? null,
      };
    }

    if (input.transactionId) {
      purchase.nearpayTransactionId = input.transactionId;
    }
    if (input.terminalId) purchase.nearpayTerminalId = input.terminalId;
    if (input.retrievalReferenceNumber) {
      purchase.retrievalReferenceNumber = input.retrievalReferenceNumber;
    }

    let entitlementId: string | null = null;
    if (input.status === 'approved') {
      const facts = paymentFactsAllowEntitlement({
        status: input.status,
        amountMinor: input.amountMinor,
        expectedAmountMinor: purchase.amountMinor,
        currency: input.currency,
        expectedCurrency: purchase.currency,
        merchantId: input.merchantId,
        expectedMerchantId: input.expectedMerchantId ?? '',
        transactionId: input.transactionId,
        customerReferenceNumber: input.customerReferenceNumber,
        expectedReference: purchase.customerReferenceNumber,
        terminalId: input.terminalId,
        expectedTerminalId: input.expectedTerminalId ?? '',
      });
      if (!facts.ok) {
        purchase.status = 'rejected';
        await this.purchases.save(purchase);
        this.log.warn('Payment approval rejected: facts did not match', {
          purchaseId: purchase.id,
          reasons: facts.reasons,
        });
        await this.audit.record({
          action: 'purchase.rejected_facts',
          actorType: 'nearpay_webhook',
          resourceType: 'purchase',
          resourceId: purchase.id,
          metadata: { reasons: facts.reasons },
        });
        return { purchaseId: purchase.id, entitlementId: null };
      }
      purchase.status = 'approved';
      if (input.merchantId) purchase.nearpayMerchantId = input.merchantId;
      const ent = await this.ensureEntitlementForPurchase(purchase);
      entitlementId = ent.id;
      await this.purchases.save(purchase);
    } else {
      purchase.status = input.status;
      if (input.merchantId) purchase.nearpayMerchantId = input.merchantId;
      if (input.amountMinor != null) purchase.amountMinor = input.amountMinor;
      await this.purchases.save(purchase);
    }

    if (input.status === 'reversed' || input.status === 'refunded') {
      await this.revokeMatchingPurchase(purchase, `payment_${input.status}`);
    }

    await this.audit.record({
      action: `purchase.${input.status}`,
      actorType: 'nearpay_webhook',
      resourceType: 'purchase',
      resourceId: purchase.id,
      metadata: {
        customerReferenceNumber: purchase.customerReferenceNumber,
        transactionId: purchase.nearpayTransactionId,
      },
    });

    return { purchaseId: purchase.id, entitlementId };
  }

  /** Snapshot the package terms recorded on the purchase into entitlement fields. */
  private entitlementGrantFromPurchase(purchase: PurchaseEntity): {
    plan: string;
    maxDevices: number;
    packageCode: string | null;
    expiresAt: Date | null;
  } {
    const maxDevices =
      typeof purchase.packageMaxDevices === 'number' && purchase.packageMaxDevices > 0
        ? purchase.packageMaxDevices
        : MAX_ACTIVE_INSTALLATIONS;
    const durationDays = purchase.packageDurationDays;
    const hasDuration = typeof durationDays === 'number' && durationDays > 0;
    return {
      plan: hasDuration ? 'subscription' : 'lifetime',
      maxDevices,
      packageCode: purchase.packageCode ?? null,
      expiresAt: hasDuration ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null,
    };
  }

  async ensureEntitlementForPurchase(
    purchase: PurchaseEntity,
  ): Promise<EntitlementEntity> {
    const grant = this.entitlementGrantFromPurchase(purchase);
    let ent = await this.entitlements.findOne({
      where: { userId: purchase.userId },
    });
    if (ent) {
      if (ent.grantSource === 'manual' || ent.grantSource === 'owner_test') {
        return ent;
      }
      if (ent.status !== 'active') {
        ent.status = 'active';
        ent.revokedAt = null;
        ent.revokeReason = null;
      }
      ent.purchaseId = purchase.id;
      ent.grantSource = 'purchase';
      ent.plan = grant.plan;
      ent.maxDevices = grant.maxDevices;
      ent.packageCode = grant.packageCode;
      ent.expiresAt = grant.expiresAt;
      return this.entitlements.save(ent);
    }
    try {
      ent = await this.entitlements.save(
        this.entitlements.create({
          userId: purchase.userId,
          purchaseId: purchase.id,
          status: 'active',
          plan: grant.plan,
          maxDevices: grant.maxDevices,
          grantSource: 'purchase',
          packageCode: grant.packageCode,
          expiresAt: grant.expiresAt,
        }),
      );
      return ent;
    } catch (err) {
      // Race: unique userId
      const again = await this.entitlements.findOne({
        where: { userId: purchase.userId },
      });
      if (again) return again;
      throw err;
    }
  }

  /**
   * Revoke only the entitlement created by this purchase.
   * Manual grants and entitlements from another purchase stay active.
   */
  private async revokeMatchingPurchase(purchase: PurchaseEntity, reason: string) {
    const ent = await this.entitlements.findOne({
      where: { userId: purchase.userId },
    });
    if (!ent || ent.status === 'revoked') return;
    if (ent.grantSource === 'manual' || ent.grantSource === 'owner_test') return;
    if (!ent.purchaseId || ent.purchaseId !== purchase.id) return;
    ent.status = 'revoked';
    ent.revokedAt = new Date();
    ent.revokeReason = reason;
    await this.entitlements.save(ent);
  }

  async lockActiveEntitlement(manager: EntityManager, userId: string) {
    const repo = manager.getRepository(EntitlementEntity);
    const postgres = manager.connection.options.type === 'postgres';
    return repo.findOne({
      where: { userId, status: 'active' },
      lock: postgres ? { mode: 'pessimistic_write' } : undefined,
    });
  }

  async applyMoyasarVerification(input: {
    purchaseId: string;
    mode: PaymentMode;
    payment: MoyasarPaymentView;
  }): Promise<{ entitlementId: string | null; status: string }> {
    const purchase = await this.purchases.findOne({ where: { id: input.purchaseId } });
    if (!purchase || purchase.provider !== 'moyasar') {
      return { entitlementId: null, status: 'ignored' };
    }
    if (purchase.status === 'refunded') {
      return { entitlementId: null, status: 'refunded' };
    }
    if (input.payment.status === 'refunded') {
      if (!fullRefundConfirmed(input.payment, purchase.amountMinor)) {
        return { entitlementId: null, status: purchase.status };
      }
      purchase.moyasarPaymentId = input.payment.id;
      purchase.providerMode = input.mode;
      purchase.status = 'refunded';
      purchase.providerState = 'refunded';
      await this.purchases.save(purchase);
      await this.revokeMatchingPurchase(purchase, 'payment_refunded');
      return { entitlementId: null, status: 'refunded' };
    }
    if (purchase.status === 'approved' && input.payment.status === 'paid') {
      const existing = await this.entitlements.findOne({ where: { userId: purchase.userId } });
      return { entitlementId: existing?.id ?? null, status: purchase.status };
    }
    if (purchase.status === 'test_paid' && input.payment.status === 'paid') {
      return { entitlementId: null, status: 'test_paid' };
    }
    if (
      (input.payment.status === 'failed' || input.payment.status === 'voided') &&
      (purchase.status === 'approved' || purchase.status === 'test_paid')
    ) {
      return { entitlementId: null, status: purchase.status };
    }
    purchase.moyasarPaymentId = input.payment.id;
    purchase.paymentMethodType = input.payment.sourceType;
    purchase.paymentMethodBrand = input.payment.brand;
    purchase.paymentMethodLast4 = input.payment.last4;
    purchase.providerMode = input.mode;
    if (input.payment.status === 'failed' || input.payment.status === 'voided') {
      if (purchase.status === 'pending' || purchase.status === 'reserving') {
        purchase.status = input.payment.status === 'voided' ? 'cancelled' : 'rejected';
        purchase.providerState = input.payment.status;
        await this.purchases.save(purchase);
      }
      return { entitlementId: null, status: purchase.status };
    }
    const facts = moyasarPaymentGrantsEntitlement({
      mode: input.mode,
      payment: input.payment,
      purchaseId: purchase.id,
      invoiceId: purchase.moyasarInvoiceId,
      expectedAmountMinor: purchase.amountMinor,
      expectedCurrency: purchase.currency,
    });
    const testPayment = input.mode === 'test' || input.payment.live === false;
    if (input.payment.status === 'paid' && testPayment) {
      const priceMatches =
        input.payment.amount === purchase.amountMinor &&
        input.payment.currency.toUpperCase() === purchase.currency.toUpperCase();
      if (!priceMatches) {
        purchase.status = 'rejected';
        purchase.providerState = 'facts_rejected';
        await this.purchases.save(purchase);
        return { entitlementId: null, status: 'rejected' };
      }
      purchase.status = 'test_paid';
      purchase.providerState = 'paid_test';
      await this.purchases.save(purchase);
      await this.audit.record({
        action: 'purchase.test_paid',
        actorType: 'moyasar',
        resourceType: 'purchase',
        resourceId: purchase.id,
        result: 'success',
        metadata: { mode: 'test' },
      });
      return { entitlementId: null, status: 'test_paid' };
    }
    if (!facts.ok) {
      if (purchase.status === 'approved' || purchase.status === 'test_paid') {
        return { entitlementId: null, status: purchase.status };
      }
      if (input.payment.status === 'paid') {
        purchase.status = 'rejected';
        purchase.providerState = 'facts_rejected';
        await this.purchases.save(purchase);
        await this.audit.record({
          action: 'purchase.rejected_facts',
          actorType: 'moyasar',
          resourceType: 'purchase',
          resourceId: purchase.id,
          result: 'failure',
          metadata: { reasons: facts.reasons },
        });
      }
      return { entitlementId: null, status: purchase.status };
    }
    purchase.status = 'approved';
    purchase.providerState = 'paid_live';
    const ent = await this.ensureEntitlementForPurchase(purchase);
    await this.purchases.save(purchase);
    this.notifications?.emit({ type: 'PURCHASE_COMPLETED', userId: purchase.userId });
    await this.audit.record({
      action: 'purchase.approved',
      actorType: 'moyasar',
      resourceType: 'purchase',
      resourceId: purchase.id,
      result: 'success',
      metadata: { mode: 'live' },
    });
    return { entitlementId: ent.id, status: 'approved' };
  }

  async markRefunded(purchaseId: string): Promise<void> {
    const purchase = await this.getById(purchaseId);
    purchase.status = 'refunded';
    await this.purchases.save(purchase);
    await this.revokeMatchingPurchase(purchase, 'payment_refunded');
  }

  presentOwned(purchase: PurchaseEntity) {
    return presentCustomerPurchase(purchase);
  }

  async listAll(limit = 200): Promise<PurchaseEntity[]> {
    return this.purchases.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getForUser(userId: string): Promise<PurchaseEntity[]> {
    return this.purchases.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async requireOwned(id: string, userId: string): Promise<PurchaseEntity> {
    const p = await this.purchases.findOne({ where: { id, userId } });
    if (!p) throw new NotFoundException('Purchase not found');
    return p;
  }

  /** Mock helper: approve pending purchase by customer ref (tests / mock mode). */
  async mockApprove(customerReferenceNumber: string, transactionId?: string) {
    const purchase = await this.findByCustomerRef(customerReferenceNumber);
    if (!purchase) {
      return { purchaseId: null, entitlementId: null };
    }
    return this.applyPaymentEvent({
      customerReferenceNumber,
      transactionId: transactionId ?? `mock_tx_${uuidv4()}`,
      status: 'approved',
      amountMinor: purchase.amountMinor,
      currency: purchase.currency,
      merchantId: null,
      expectedMerchantId: '',
      terminalId: 'mock_terminal',
      retrievalReferenceNumber: null,
    });
  }

  async issueManualEntitlement(
    userId: string,
    actorUserId: string | null,
    reason: string,
    actorEmail?: string | null,
  ): Promise<EntitlementEntity> {
    const existing = await this.entitlements.findOne({ where: { userId } });
    if (existing?.status === 'active') {
      throw new ConflictException('User already has an active entitlement');
    }
    if (existing) {
      existing.status = 'active';
      existing.purchaseId = null;
      existing.grantSource = 'manual';
      existing.revokedAt = null;
      existing.revokeReason = null;
      const saved = await this.entitlements.save(existing);
      await this.audit.record({
        action: 'entitlement.issue',
        actorUserId,
        actorEmail,
        actorType: 'owner',
        resourceType: 'entitlement',
        resourceId: saved.id,
        result: 'success',
        metadata: { reason, grantSource: 'manual' },
      });
      return saved;
    }
    const saved = await this.entitlements.save(
      this.entitlements.create({
        userId,
        purchaseId: null,
        status: 'active',
        plan: 'lifetime',
        maxDevices: MAX_ACTIVE_INSTALLATIONS,
        grantSource: 'manual',
      }),
    );
    await this.audit.record({
      action: 'entitlement.issue',
      actorUserId,
      actorEmail,
      actorType: 'owner',
      resourceType: 'entitlement',
      resourceId: saved.id,
      result: 'success',
      metadata: { reason, grantSource: 'manual' },
    });
    return saved;
  }

  /**
   * Owner-only physical-test activation. Grants a lifetime entitlement to the
   * authenticated owner and never accepts another customer's user id.
   */
  async ensureOwnerTestEntitlement(ownerUserId: string): Promise<EntitlementEntity> {
    const existing = await this.entitlements.findOne({
      where: { userId: ownerUserId },
    });
    if (existing?.status === 'active') {
      return existing;
    }
    if (existing) {
      existing.status = 'active';
      existing.plan = 'lifetime';
      existing.maxDevices = MAX_ACTIVE_INSTALLATIONS;
      existing.purchaseId = null;
      existing.grantSource = 'owner_test';
      existing.revokedAt = null;
      existing.revokeReason = null;
      const saved = await this.entitlements.save(existing);
      await this.audit.record({
        action: 'entitlement.owner_test',
        actorUserId: ownerUserId,
        actorType: 'owner',
        resourceType: 'entitlement',
        resourceId: saved.id,
      });
      return saved;
    }
    const saved = await this.entitlements.save(
      this.entitlements.create({
        userId: ownerUserId,
        purchaseId: null,
        status: 'active',
        plan: 'lifetime',
        maxDevices: MAX_ACTIVE_INSTALLATIONS,
        grantSource: 'owner_test',
      }),
    );
    await this.audit.record({
      action: 'entitlement.owner_test',
      actorUserId: ownerUserId,
      actorType: 'owner',
      resourceType: 'entitlement',
      resourceId: saved.id,
    });
    return saved;
  }
}
