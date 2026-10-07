import { NotFoundException } from '@nestjs/common';
import { SkinsService } from './skins.service';

describe('public skin lookup', () => {
  const findOne = jest.fn();
  const service = Object.create(SkinsService.prototype) as SkinsService;
  Object.assign(service, { skins: { findOne } });

  it('only matches published skins', async () => {
    findOne.mockResolvedValue(null);
    await expect(service.getPublishedById('draft-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 'draft-1', status: 'published' },
    });
  });
});
