import { NotFoundException } from '@nestjs/common';
import { CompatibilityService } from './compatibility.service';

function make() {
  const rules = {
    rows: [] as any[],
    findOne: jest.fn(async ({ where: { id } }: any) => rules.rows.find((r) => r.id === id) ?? null),
    remove: jest.fn(async (r: any) => { rules.rows = rules.rows.filter((x) => x !== r); return r; }),
  };
  const service = Object.create(CompatibilityService.prototype) as CompatibilityService;
  Object.assign(service, { rules });
  return { service, rules };
}

describe('compatibility rule deletion', () => {
  it('removes an existing rule', async () => {
    const { service, rules } = make();
    rules.rows.push({ id: 'r1' });
    await expect(service.deleteRule('r1')).resolves.toEqual({ ok: true });
    expect(rules.rows).toHaveLength(0);
  });
  it('rejects a missing rule', async () => {
    const { service } = make();
    await expect(service.deleteRule('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
