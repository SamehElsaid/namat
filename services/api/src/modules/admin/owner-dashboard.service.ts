import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DeviceEntity,
  EntitlementEntity,
  PurchaseEntity,
  SupportNoteEntity,
  UserEntity,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { PaymentSettingsService } from '../payments/moyasar/payment-settings.service';

@Injectable()
export class OwnerDashboardService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(PurchaseEntity)
    private readonly purchases: Repository<PurchaseEntity>,
    @InjectRepository(EntitlementEntity)
    private readonly entitlements: Repository<EntitlementEntity>,
    @InjectRepository(DeviceEntity)
    private readonly devices: Repository<DeviceEntity>,
    @InjectRepository(SupportNoteEntity)
    private readonly notes: Repository<SupportNoteEntity>,
    private readonly settings: PaymentSettingsService,
    private readonly audit: AuditService,
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  async overview() {
    const customers = await this.users.count();
    const purchases = await this.purchases.count();
    const verifiedPaid = await this.purchases
      .createQueryBuilder('purchase')
      .where('purchase.status = :approved', { approved: 'approved' })
      .andWhere(
        '(purchase.providerMode = :live OR (purchase.provider = :nearpay AND purchase.providerMode IS NULL))',
        { live: 'live', nearpay: 'nearpay' },
      )
      .getCount();
    const testPaid = await this.purchases
      .createQueryBuilder('purchase')
      .where(
        'purchase.status = :testPaid OR (purchase.status = :approved AND purchase.providerMode = :test)',
        { testPaid: 'test_paid', approved: 'approved', test: 'test' },
      )
      .getCount();
    const refunds = await this.purchases
      .createQueryBuilder('purchase')
      .where('purchase.status IN (:...statuses)', { statuses: ['refunded', 'reversed'] })
      .andWhere('(purchase.providerMode IS NULL OR purchase.providerMode = :live)', { live: 'live' })
      .getCount();
    const testRefunds = await this.purchases
      .createQueryBuilder('purchase')
      .where('purchase.status IN (:...statuses)', { statuses: ['refunded', 'reversed'] })
      .andWhere('purchase.providerMode = :test', { test: 'test' })
      .getCount();
    const activeIphones = await this.devices.count({ where: { status: 'active' } });
    const payment = await this.settings.resolve();
    return {
      customers,
      purchases,
      verifiedPaid,
      testPaid,
      refunds,
      testRefunds,
      activeIphones,
      checkoutAvailable: payment.checkoutAvailable,
      checkoutEnabled: payment.checkoutEnabled,
      paymentMode: payment.mode,
      paymentReady: payment.ready,
    };
  }

  async searchCustomers(query: string, page = 1, limit = 20) {
    const take = Math.min(50, Math.max(1, limit || 20));
    const current = Math.max(1, page || 1);
    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.entitlements', 'entitlement')
      .orderBy('user.createdAt', 'DESC')
      .skip((current - 1) * take)
      .take(take);
    const q = query.trim().toLowerCase();
    if (q) qb.where('LOWER(user.email) LIKE :q', { q: `%${q}%` });
    const [rows, total] = await qb.getManyAndCount();
    return {
      page: current,
      limit: take,
      total,
      customers: rows.map((user) => this.presentCustomer(user)),
    };
  }

  async customerDetail(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { entitlements: true },
    });
    if (!user) throw new NotFoundException('Customer not found');
    const [purchases, devices, notes] = await Promise.all([
      this.purchases.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.devices.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.notes.find({ where: { userId }, order: { createdAt: 'DESC' } }),
    ]);
    return {
      customer: this.presentCustomer(user),
      purchases: purchases.map((row) => ({
        id: row.id,
        reference: row.customerReferenceNumber,
        createdAt: row.createdAt,
        amountMinor: row.amountMinor,
        currency: row.currency,
        provider: row.provider,
        mode: row.providerMode,
        status: row.status,
        providerState: row.providerState,
        method: row.paymentMethodType,
        brand: row.paymentMethodBrand,
        last4: row.paymentMethodLast4,
      })),
      devices: devices.map((device) => ({
        id: device.id,
        label: device.label,
        status: device.status,
        appVersion: device.appVersion,
        iosVersion: device.iosVersion,
        lastSeenAt: device.lastSeenAt,
      })),
      notes: notes.map((note) => this.presentNote(note)),
    };
  }

  async listNotes(query: string) {
    const qb = this.notes
      .createQueryBuilder('note')
      .orderBy('note.createdAt', 'DESC')
      .take(100);
    const q = query.trim().toLowerCase();
    if (q)
      qb.where(
        "LOWER(note.body) LIKE :q OR LOWER(COALESCE(note.subject, '')) LIKE :q OR LOWER(COALESCE(note.actorEmail, '')) LIKE :q",
        { q: `%${q}%` },
      );
    const rows = await qb.getMany();
    return rows.map((note) => this.presentNote(note));
  }

  async createNote(
    input: { userId: string; purchaseId?: string; body: string },
    actor: { userId: string | null; email: string | null },
  ) {
    const user = await this.users.findOne({ where: { id: input.userId } });
    if (!user) throw new NotFoundException('Customer not found');
    const saved = await this.notes.save(
      this.notes.create({
        userId: input.userId,
        purchaseId: input.purchaseId ?? null,
        actorUserId: actor.userId,
        actorEmail: actor.email,
        body: input.body.trim(),
        status: 'open',
        outcome: null,
      }),
    );
    await this.audit.record({
      action: 'support_note.create',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'admin',
      resourceType: 'support_note',
      resourceId: saved.id,
      result: 'success',
      metadata: { userId: input.userId, purchaseId: input.purchaseId ?? null },
    });
    return this.presentNote(saved);
  }

  async updateNote(
    id: string,
    input: { status?: 'open' | 'resolved'; outcome?: string; body?: string; reply?: string },
    actor: { userId: string | null; email: string | null },
  ) {
    const note = await this.notes.findOne({ where: { id } });
    if (!note) throw new NotFoundException('Support note not found');
    if (input.status) note.status = input.status;
    if (input.outcome !== undefined) note.outcome = input.outcome.trim() || null;
    if (input.body !== undefined && input.body.trim()) note.body = input.body.trim();
    let replyAdded = false;
    if (input.reply !== undefined) {
      const reply = input.reply.trim();
      note.reply = reply || null;
      note.repliedByEmail = reply ? actor.email : null;
      note.repliedAt = reply ? new Date() : null;
      replyAdded = reply.length > 0;
    }
    const saved = await this.notes.save(note);
    if (replyAdded) {
      this.notifications?.emit({ type: 'SUPPORT_UPDATE', userId: saved.userId });
    }
    await this.audit.record({
      action: 'support_note.update',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'admin',
      resourceType: 'support_note',
      resourceId: saved.id,
      result: 'success',
      metadata: { status: saved.status, outcome: saved.outcome },
    });
    return this.presentNote(saved);
  }

  private presentCustomer(user: UserEntity) {
    const entitlement = user.entitlements?.[0] ?? null;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      entitlement: entitlement
        ? {
            id: entitlement.id,
            status: entitlement.status,
            plan: entitlement.plan,
            grantSource: entitlement.grantSource,
            maxDevices: entitlement.maxDevices,
          }
        : null,
    };
  }

  private presentNote(note: SupportNoteEntity) {
    return {
      id: note.id,
      userId: note.userId,
      purchaseId: note.purchaseId,
      actorEmail: note.actorEmail,
      source: note.source ?? 'staff',
      subject: note.subject ?? null,
      body: note.body,
      status: note.status,
      outcome: note.outcome,
      reply: note.reply ?? null,
      repliedByEmail: note.repliedByEmail ?? null,
      repliedAt: note.repliedAt ?? null,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }
}
