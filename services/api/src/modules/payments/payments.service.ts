import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NAMAT_CURRENCY, NAMAT_PRICE_MINOR } from '@namat/shared';
import { PaymentWebhookEventEntity } from '../../database/entities';
import { NearPayProvider } from './nearpay/nearpay.provider';
import { PurchasesService } from '../purchases/purchases.service';
import { StructuredLogger } from '../../common/logging/logger';
import { CreatePaymentSessionInput } from './payment-provider.interface';
import { allowMockEntitlement } from './payment-facts';

@Injectable()
export class PaymentsService {
  private readonly log = new StructuredLogger('PaymentsService');

  constructor(
    private readonly nearpay: NearPayProvider,
    @Inject(forwardRef(() => PurchasesService))
    private readonly purchases: PurchasesService,
    private readonly config: ConfigService,
    @InjectRepository(PaymentWebhookEventEntity)
    private readonly webhookRepo: Repository<PaymentWebhookEventEntity>,
  ) {}

  async createCheckoutSession(input: CreatePaymentSessionInput) {
    const session = await this.nearpay.createSession(input);
    if (session.jobId) {
      await this.purchases.rememberNearpayJob(
        input.customerReferenceNumber,
        session.jobId,
      );
    }
    return session;
  }

  isMockMode(): boolean {
    return this.nearpay.isMockMode();
  }

  /** Mock auto-approval is never allowed when NODE_ENV=production. */
  allowsMockEntitlement(): boolean {
    const nodeEnv = this.config.get<string>('app.nodeEnv');
    return this.isMockMode() && allowMockEntitlement(nodeEnv);
  }

  defaultAmountMinor(): number {
    return this.config.get<number>('app.nearpayAmountHalalas') ?? NAMAT_PRICE_MINOR;
  }

  defaultCurrency(): string {
    return this.config.get<string>('app.nearpayCurrency') ?? NAMAT_CURRENCY;
  }

  /** Confirms a transaction id returned by remote purchase initiation. */
  confirmInitiatedTransaction(transactionId: string) {
    const secret = this.config.get<string>('app.nearpayWebhookSecret') ?? '';
    const headers: Record<string, string> = {};
    if (secret) headers['api-key'] = secret;
    return this.handleNearPayWebhook(
      { payload: { id: transactionId, is_approved: true } },
      headers,
    );
  }

  async handleNearPayWebhook(
    rawBody: unknown,
    headers: Record<string, string | string[] | undefined>,
    rawForSig?: Buffer | string,
  ) {
    const bodyForSig =
      rawForSig ??
      (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody ?? {}));

    if (!this.nearpay.verifyWebhookSignature(bodyForSig, headers)) {
      throw new UnauthorizedException('Invalid NearPay webhook signature');
    }

    const event = await this.nearpay.normalizeWebhook(rawBody, headers);
    if (!event.customerReferenceNumber && !event.transactionId) {
      throw new BadRequestException(
        'Webhook missing customer_reference_number and transaction id',
      );
    }

    const existing = await this.webhookRepo.findOne({
      where: { providerEventKey: event.providerEventKey },
    });
    if (existing?.processed) {
      this.log.info('Idempotent webhook replay ignored', {
        providerEventKey: event.providerEventKey,
      });
      return {
        ok: true,
        idempotent: true,
        purchaseId: null as string | null,
        entitlementId: null as string | null,
        status: existing.status,
      };
    }

    const saved =
      existing ??
      (await this.webhookRepo.save(
        this.webhookRepo.create({
          providerEventKey: event.providerEventKey,
          provider: 'nearpay',
          eventType: event.eventType,
          transactionId: event.transactionId,
          customerReferenceNumber: event.customerReferenceNumber,
          status: event.status,
          amountMinor: event.amountMinor,
          currency: event.currency,
          merchantId: event.merchantId,
          terminalId: event.terminalId,
          processed: false,
        }),
      ));

    let status = event.status;
    let amountMinor = event.amountMinor;
    let currency = event.currency;
    let merchantId = event.merchantId;
    let terminalId = event.terminalId;
    let customerReferenceNumber = event.customerReferenceNumber;

    const stateChanging =
      status === 'approved' || status === 'reversed' || status === 'refunded';
    if (!this.isMockMode() && stateChanging) {
      if (!event.transactionId) {
        throw new BadRequestException(
          'Live NearPay state changes require a transaction id. customer_reference_number alone is not accepted.',
        );
      }
      const authoritative = await this.nearpay.fetchAuthoritativeTransaction(
        event.transactionId,
      );
      if (!authoritative) {
        throw new BadRequestException(
          'NearPay transaction could not be confirmed with the POS API',
        );
      }
      if (!authoritative.customerReferenceNumber) {
        throw new BadRequestException(
          'Authoritative NearPay transaction has no customer_reference_number. Refusing an unbound state change.',
        );
      }
      const purchase = await this.purchases.findByCustomerRef(
        authoritative.customerReferenceNumber,
      );
      if (
        purchase?.nearpayJobId &&
        authoritative.jobId &&
        purchase.nearpayJobId !== authoritative.jobId
      ) {
        throw new BadRequestException(
          'Authoritative NearPay transaction does not match the NAMAT purchase job.',
        );
      }
      customerReferenceNumber = authoritative.customerReferenceNumber;
      amountMinor = authoritative.amountMinor;
      currency = authoritative.currency;
      merchantId = authoritative.merchantId ?? merchantId;
      terminalId = authoritative.terminalId ?? terminalId;
      if (authoritative.reversed) status = 'reversed';
      else if (authoritative.refunded) status = 'refunded';
      else if (authoritative.approved) status = 'approved';
      else status = 'rejected';
    }

    if (
      this.isMockMode() &&
      status === 'approved' &&
      !this.allowsMockEntitlement()
    ) {
      throw new ServiceUnavailableException(
        'NearPay is not configured. Checkout cannot grant an entitlement.',
      );
    }

    const result = await this.purchases.applyPaymentEvent({
      customerReferenceNumber,
      transactionId: event.transactionId,
      status,
      amountMinor,
      currency,
      merchantId,
      expectedMerchantId:
        this.config.get<string>('app.nearpayMerchantId') ?? '',
      terminalId,
      expectedTerminalId:
        this.config.get<string>('app.nearpayTerminalId') ?? '',
      retrievalReferenceNumber: event.retrievalReferenceNumber,
    });

    saved.processed = true;
    await this.webhookRepo.save(saved);

    return {
      ok: true,
      idempotent: false,
      purchaseId: result.purchaseId,
      entitlementId: result.entitlementId,
      status,
    };
  }

  /**
   * Operator refund or reversal. The terminal call must succeed and the
   * authoritative lookup must confirm the new status before entitlement changes.
   * Mock mode throws and leaves the purchase untouched.
   */
  async requestAdjustment(purchaseId: string, action: 'refund' | 'reverse') {
    const purchase = await this.purchases.getById(purchaseId);
    if (purchase.status === 'refunded' || purchase.status === 'reversed') {
      return {
        ok: true,
        status: purchase.status,
        confirmed: true,
        idempotent: true,
      };
    }
    if (!purchase.nearpayTransactionId) {
      throw new BadRequestException(
        'Purchase has no NearPay transaction id to refund or reverse.',
      );
    }
    await this.nearpay.requestAdjustment({
      action,
      transactionId: purchase.nearpayTransactionId,
      amountMinor: purchase.amountMinor,
      customerReferenceNumber: purchase.customerReferenceNumber,
    });
    const authoritative = await this.nearpay.fetchAuthoritativeTransaction(
      purchase.nearpayTransactionId,
    );
    const confirmed =
      action === 'refund'
        ? Boolean(authoritative?.refunded)
        : Boolean(authoritative?.reversed);
    if (!authoritative || !confirmed) {
      return {
        ok: true,
        status: purchase.status,
        confirmed: false,
        idempotent: false,
      };
    }
    const status = authoritative.refunded ? 'refunded' : 'reversed';
    await this.purchases.applyPaymentEvent({
      customerReferenceNumber: purchase.customerReferenceNumber,
      transactionId: purchase.nearpayTransactionId,
      status,
      amountMinor: authoritative.amountMinor ?? purchase.amountMinor,
      currency: authoritative.currency ?? purchase.currency,
      merchantId: authoritative.merchantId,
      expectedMerchantId:
        this.config.get<string>('app.nearpayMerchantId') ?? '',
      terminalId: authoritative.terminalId,
      expectedTerminalId:
        this.config.get<string>('app.nearpayTerminalId') ?? '',
      retrievalReferenceNumber: purchase.retrievalReferenceNumber,
    });
    return { ok: true, status, confirmed: true, idempotent: false };
  }
}
