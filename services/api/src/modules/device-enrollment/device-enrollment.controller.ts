import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import {
  AdminOnly,
  AuthUser,
  CurrentUser,
  OwnerOnly,
  Public,
} from '../../common/decorators/auth.decorators';
import { LocalFileStorage } from '../../storage/local-file.storage';
import { buildConfirmationProfile } from './mobileconfig';
import { DeviceEnrollmentService } from './device-enrollment.service';

class RenameEnrollmentBody {
  @IsString()
  @Length(1, 64)
  label!: string;
}

class CompleteSigningBody {
  @IsString()
  ipaSha256!: string;

  @IsString()
  profileIdentifier!: string;

  @IsString()
  appVersion!: string;

  @IsString()
  buildNumber!: string;

  @IsString()
  sourceCommit!: string;

  @IsString()
  airliftSha!: string;
}

@Controller('device-enrollment')
export class DeviceEnrollmentController {
  constructor(
    private readonly enrollment: DeviceEnrollmentService,
    private readonly storage: LocalFileStorage,
  ) {}

  @Post('start')
  start(@CurrentUser() user: AuthUser) {
    return this.enrollment.start(user.userId);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.enrollment.listForUser(user.userId);
  }

  @Public()
  @Get('profile/:token')
  async profile(@Param('token') token: string, @Res() res: Response) {
    const body = await this.enrollment.profileBody(token);
    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="namat.mobileconfig"',
    );
    res.send(body);
  }

  @Public()
  @Post('callback/:token')
  async callback(
    @Param('token') token: string,
    @Req() req: { body?: unknown; headers?: Record<string, string | undefined> },
    @Res() res: Response,
  ) {
    try {
      const contentType = req.headers?.['content-type'];
      await this.enrollment.completeCallback(token, asBuffer(req.body), contentType);
      res.setHeader('Content-Type', 'application/x-apple-aspen-config');
      res.status(200).send(buildConfirmationProfile());
    } catch (err) {
      const status = httpStatus(err);
      res
        .status(status)
        .type('text/plain')
        .send('NAMAT could not register this iPhone.');
    }
  }

  @Public()
  @Get('manifest/:token')
  async manifest(@Param('token') token: string, @Res() res: Response) {
    const xml = await this.enrollment.manifestForToken(token);
    res.setHeader('Content-Type', 'text/xml');
    res.send(xml);
  }

  @Public()
  @Get('ipa/:token')
  async ipa(@Param('token') token: string, @Res() res: Response) {
    const relative = await this.enrollment.ipaRelativePath(token);
    const abs = this.storage.resolveInsideRoot(relative);
    if (!existsSync(abs)) {
      res.status(404).json({ message: 'Install file is not ready' });
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="NAMAT.ipa"');
    createReadStream(abs).pipe(res);
  }

  @Public()
  @Post('jobs/:id/artifact')
  storeArtifact(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-namat-sha256') sha: string | undefined,
    @Req() req: { body?: unknown },
  ) {
    return this.enrollment.storeSignedIpa(
      id,
      bearer(authorization),
      asBuffer(req.body),
      sha ?? '',
    );
  }

  @Public()
  @Get('stable-manifest')
  stableManifest(@Headers('authorization') authorization: string | undefined) {
    return this.enrollment.stableManifest(bearer(authorization));
  }

  @Public()
  @Get('stable-payload')
  async stablePayload(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-namat-sha256') sha: string | undefined,
    @Res() res: Response,
  ) {
    const body = await this.enrollment.stablePayload(bearer(authorization), sha);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="Namat-unsigned.ipa"');
    res.send(body);
  }

  @Public()
  @Post('jobs/:id/complete')
  completeJob(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CompleteSigningBody,
  ) {
    return this.enrollment.completeSigningJob(id, bearer(authorization), body);
  }

  @Public()
  @Post('jobs/:id/fail')
  failJob(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.enrollment.failSigningJob(id, bearer(authorization));
  }

  @Public()
  @Get('jobs/:id/profile')
  async jobProfile(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ) {
    const body = await this.enrollment.jobProfile(id, bearer(authorization));
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(body);
  }

  @Get('sessions/:id')
  session(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.enrollment.getForUser(user.userId, id);
  }

  @Get('sessions/:id/cms-diagnostic')
  cmsDiagnostic(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.enrollment.cmsDiagnosticForUser(user.userId, id);
  }

  @Post('sessions/:id/install-link')
  installLink(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.enrollment.issueInstallLink(user.userId, id);
  }

  @Patch('sessions/:id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RenameEnrollmentBody,
  ) {
    return this.enrollment.rename(user.userId, id, body.label);
  }

  @Post('sessions/:id/deactivate')
  async deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.enrollment.deactivate(id, user.userId);
    return { ok: true };
  }
}

@Controller('admin/device-enrollments')
@AdminOnly()
export class AdminDeviceEnrollmentController {
  constructor(
    private readonly enrollment: DeviceEnrollmentService,
    private readonly storage: LocalFileStorage,
  ) {}

  @Get()
  list() {
    return this.enrollment.adminList();
  }

  /** Owner build access: metadata of the most recent signed IPA. */
  @OwnerOnly()
  @Get('signed-build')
  signedBuild() {
    return this.enrollment.latestSignedBuildMeta();
  }

  /** Owner build access: download the most recent signed IPA for device testing. */
  @OwnerOnly()
  @Get('signed-build/download')
  async downloadSignedBuild(@Res() res: Response) {
    const relative = await this.enrollment.latestSignedBuildPath();
    const abs = this.storage.resolveInsideRoot(relative);
    if (!existsSync(abs)) {
      res.status(404).json({ message: 'no_signed_build' });
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="NAMAT.ipa"');
    createReadStream(abs).pipe(res);
  }

  @Get('capacity')
  capacity() {
    return this.enrollment.adminCapacity();
  }

  @Post('stable-payload')
  publishStable(
    @Headers('x-namat-source-commit') sourceCommit: string | undefined,
    @Headers('x-namat-airlift-sha') airliftSha: string | undefined,
    @Headers('x-namat-app-version') appVersion: string | undefined,
    @Headers('x-namat-build-number') buildNumber: string | undefined,
    @Req() req: { body?: unknown },
  ) {
    return this.enrollment.publishStablePayload(asBuffer(req.body), {
      sourceCommit: sourceCommit ?? '',
      airliftSha: airliftSha ?? '',
      appVersion: appVersion ?? '',
      buildNumber: buildNumber ?? '',
    });
  }

  @Post(':id/retry-signing')
  retrySigning(@Param('id') id: string) {
    return this.enrollment.retrySigning(id);
  }

  @Post(':id/retry-provisioning')
  retryProvisioning(@Param('id') id: string) {
    return this.enrollment.retryProvisioning(id);
  }

  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    await this.enrollment.deactivate(id, null);
    return { ok: true };
  }
}

function bearer(authorization: string | undefined): string {
  if (!authorization?.toLowerCase().startsWith('bearer ')) return '';
  return authorization.slice(7).trim();
}

function asBuffer(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body && typeof body === 'object') {
    throw new BadRequestException('unsupported_enrollment_body');
  }
  return Buffer.alloc(0);
}

function httpStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'getStatus' in err) {
    const status = (err as { getStatus: () => number }).getStatus();
    if (typeof status === 'number') return status;
  }
  return 400;
}
