import { SupportService } from './support.service';
import { SupportNoteEntity } from '../../database/entities';

function serviceWith(initial: Partial<SupportNoteEntity>[] = []) {
  const store = initial.map((r) => ({ ...r })) as SupportNoteEntity[];
  const repo = {
    create: jest.fn((row: Partial<SupportNoteEntity>) => ({ id: `note-${store.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...row })),
    save: jest.fn(async (row: SupportNoteEntity) => {
      store.push(row);
      return row;
    }),
    find: jest.fn(async ({ where }: { where: { userId: string } }) =>
      store.filter((n) => n.userId === where.userId),
    ),
  };
  const audit = { record: jest.fn() };
  return { service: new SupportService(repo as never, audit as never), repo, audit, store };
}

describe('SupportService (customer threads)', () => {
  it('creates a customer-sourced note linked to the account and audits it', async () => {
    const { service, audit } = serviceWith();
    const created = await service.createFromCustomer({
      userId: 'u1',
      email: 'c@example.com',
      subject: 'Install help',
      body: 'The profile will not install.',
    });
    expect(created.source).toBe('customer');
    expect(created.subject).toBe('Install help');
    expect(created.status).toBe('open');
    expect(created.reply).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'support_note.customer_open', actorType: 'customer' }),
    );
  });

  it('returns only the customer own requests without internal fields', async () => {
    const { service } = serviceWith([
      { userId: 'u1', subject: 'A', body: 'x', status: 'open', source: 'customer', reply: null },
      { userId: 'u2', subject: 'B', body: 'y', status: 'open', source: 'customer', reply: null },
    ]);
    const rows = await service.listForCustomer('u1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('outcome');
    expect(rows[0]).not.toHaveProperty('actorEmail');
  });

  it('trims and caps an overlong subject', async () => {
    const { service } = serviceWith();
    const created = await service.createFromCustomer({
      userId: 'u1',
      email: null,
      subject: ' '.repeat(2) + 'x'.repeat(300),
      body: 'body text',
    });
    expect(created.subject!.length).toBe(200);
  });
});
