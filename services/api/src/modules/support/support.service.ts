import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportNoteEntity } from '../../database/entities';
import { AuditService } from '../audit/audit.service';

export interface CustomerSupportInput {
  userId: string;
  email: string | null;
  subject: string;
  body: string;
}

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportNoteEntity)
    private readonly notes: Repository<SupportNoteEntity>,
    private readonly audit: AuditService,
  ) {}

  async createFromCustomer(input: CustomerSupportInput) {
    const saved = await this.notes.save(
      this.notes.create({
        userId: input.userId,
        purchaseId: null,
        actorUserId: input.userId,
        actorEmail: input.email,
        source: 'customer',
        subject: input.subject.trim().slice(0, 200),
        body: input.body.trim(),
        status: 'open',
        outcome: null,
        reply: null,
        repliedByEmail: null,
        repliedAt: null,
      }),
    );
    await this.audit.record({
      action: 'support_note.customer_open',
      actorUserId: input.userId,
      actorEmail: input.email,
      actorType: 'customer',
      resourceType: 'support_note',
      resourceId: saved.id,
      result: 'success',
      metadata: { source: 'customer' },
    });
    return this.present(saved);
  }

  async listForCustomer(userId: string) {
    const rows = await this.notes.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((note) => this.present(note));
  }

  /** Customer-facing shape: no internal outcome or staff identity. */
  private present(note: SupportNoteEntity) {
    return {
      id: note.id,
      subject: note.subject ?? null,
      body: note.body,
      status: note.status,
      source: note.source ?? 'staff',
      reply: note.reply ?? null,
      repliedAt: note.repliedAt ?? null,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }
}
