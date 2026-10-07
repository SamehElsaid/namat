import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  AuthUser,
  CurrentUser,
  Public,
} from '../../common/decorators/auth.decorators';
import { CompatibilityService } from './compatibility.service';

@Controller()
export class CompatibilityController {
  constructor(private readonly compatibility: CompatibilityService) {}

  @Public()
  @Get('compatibility')
  get() {
    return this.compatibility.getPublic();
  }

  @Public()
  @Get('app-versions/latest')
  async latest() {
    const row = await this.compatibility.latestActive();
    if (!row) return { version: null };
    return {
      id: row.id,
      version: row.version,
      isMandatory: row.isMandatory,
      releaseNotes: row.releaseNotes,
      checksum: row.checksum,
      downloadAvailable: this.compatibility.customerDownloadAllowed(row),
    };
  }

  @Get('app-versions/:id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.compatibility.readIpaForUser(user.userId, id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader('X-Checksum-Sha256', file.checksum);
    res.send(file.bytes);
  }
}
