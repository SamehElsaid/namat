import { ConflictException, NotFoundException } from '@nestjs/common';
import { SkinsService } from './skins.service';

function make() {
  const categories = {
    rows: [] as any[],
    findOne: jest.fn(async ({ where: { id } }: any) => categories.rows.find((r) => r.id === id) ?? null),
    find: jest.fn(async () => categories.rows),
    save: jest.fn(async (r: any) => { if (!categories.rows.includes(r)) categories.rows.push(r); return r; }),
    create: jest.fn((r: any) => r),
    remove: jest.fn(async (r: any) => { categories.rows = categories.rows.filter((x) => x !== r); return r; }),
  };
  const skins = { count: jest.fn(async () => 0) };
  const service = Object.create(SkinsService.prototype) as SkinsService;
  Object.assign(service, { categories, skins });
  return { service, categories, skins };
}

describe('category admin management', () => {
  it('updates name, slug, order, and active flag', async () => {
    const { service, categories } = make();
    categories.rows.push({ id: 'c1', name: 'Old', nameAr: null, slug: 'old', sortOrder: 0, isActive: true });
    const saved = await service.updateCategory('c1', { name: 'New', slug: 'new', sortOrder: 5, isActive: false });
    expect(saved).toMatchObject({ name: 'New', slug: 'new', sortOrder: 5, isActive: false });
  });

  it('rejects update of a missing category', async () => {
    const { service } = make();
    await expect(service.updateCategory('nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an unused category', async () => {
    const { service, categories, skins } = make();
    categories.rows.push({ id: 'c1', name: 'Empty' });
    skins.count.mockResolvedValue(0);
    await expect(service.deleteCategory('c1')).resolves.toEqual({ ok: true });
    expect(categories.rows).toHaveLength(0);
  });

  it('refuses to delete a category still used by designs', async () => {
    const { service, categories, skins } = make();
    categories.rows.push({ id: 'c1', name: 'Used' });
    skins.count.mockResolvedValue(3);
    await expect(service.deleteCategory('c1')).rejects.toBeInstanceOf(ConflictException);
    expect(categories.rows).toHaveLength(1);
  });

  it('lists all categories for admin including inactive', async () => {
    const { service, categories } = make();
    categories.rows.push({ id: 'a', isActive: false }, { id: 'b', isActive: true });
    const all = await service.listAllCategories();
    expect(all).toHaveLength(2);
  });
});
