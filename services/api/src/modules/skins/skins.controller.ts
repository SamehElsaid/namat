import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/auth.decorators';
import { SkinsService } from './skins.service';

@Controller('skins')
export class SkinsController {
  constructor(private readonly skins: SkinsService) {}

  @Public()
  @Get('manifest')
  async manifest() {
    const items = await this.skins.listPublishedManifest();
    return { skins: items, generatedAt: new Date().toISOString() };
  }

  @Public()
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const skin = await this.skins.getPublishedById(id);
    return this.skins.toPublic(skin);
  }
}
