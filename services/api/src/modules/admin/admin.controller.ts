import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  AdminOnly,
  AuthUser,
  CurrentUser,
  OwnerOnly,
} from '../../common/decorators/auth.decorators';
import { SkinsService } from '../skins/skins.service';
import { UsersService } from '../users/users.service';
import { PurchasesService } from '../purchases/purchases.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { CompatibilityService } from '../compatibility/compatibility.service';
import { RemoteConfigService } from '../remote-config/remote-config.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuditService } from '../audit/audit.service';
import { DevicesService } from '../devices/devices.service';
import { AiGenerationsService } from '../ai/ai-generations.service';

class CreateSkinBody {
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsString()
  @Length(1, 128)
  name!: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

class CreateCategoryBody {
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsString()
  @Length(1, 128)
  name!: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  sortOrder?: number;
}

class UpdateCategoryBody {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdateRemoteConfigBody {
  @IsOptional()
  @IsBoolean()
  killSwitchApply?: boolean;

  @IsOptional()
  @IsString()
  minAppVersion?: string;

  @IsOptional()
  @IsString()
  minIosVersion?: string;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsString()
  message?: string;
}

class IssueBody {
  @IsUUID()
  userId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;
}

class SkinPatchBody {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class DeviceActionBody {
  @IsBoolean()
  confirm!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;
}

class TransferDeviceBody extends DeviceActionBody {
  @IsUUID()
  userId!: string;
}

class RevokeBody {
  @IsUUID()
  userId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;
}

class CompatBody {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  minIosVersion!: string;

  @IsOptional()
  @IsString()
  maxIosVersion?: string;

  @IsOptional()
  @IsString({ each: true })
  supportedModels?: string[];

  @IsOptional()
  @IsBoolean()
  isSupported?: boolean;

  @IsOptional()
  @IsIn(['SUPPORTED', 'TESTING', 'UNSUPPORTED', 'BLOCKED'])
  state?: 'SUPPORTED' | 'TESTING' | 'UNSUPPORTED' | 'BLOCKED';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  minAppVersion?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class AppVersionBody {
  @IsString()
  @Length(1, 32)
  version!: string;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  @IsOptional()
  @IsString()
  releaseNotes?: string;
}

class ModerateAiBody {
  @IsIn(['moderated', 'completed'])
  status!: 'moderated' | 'completed';
}

@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly skins: SkinsService,
    private readonly users: UsersService,
    private readonly purchases: PurchasesService,
    private readonly entitlements: EntitlementsService,
    private readonly compatibility: CompatibilityService,
    private readonly remoteConfig: RemoteConfigService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly devices: DevicesService,
    private readonly ai: AiGenerationsService,
  ) {}

  private actorId(user: AuthUser): string | null {
    return user.userId === 'admin-token' ? null : user.userId;
  }

  private actorEmail(user: AuthUser): string | null {
    return user.userId === 'admin-token' ? null : user.email;
  }

  @Get('skins')
  listSkins() {
    return this.skins.listAll();
  }

  @Post('skins')
  createSkin(@Body() body: CreateSkinBody) {
    return this.skins.create(body);
  }

  @Post('skins/:id/publish')
  publishSkin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.skins.publish(id, this.actorId(user));
  }

  @Post('skins/:id/unpublish')
  unpublishSkin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.skins.unpublish(id, this.actorId(user));
  }

  @Patch('skins/:id')
  updateSkin(@Param('id') id: string, @Body() body: SkinPatchBody) {
    return this.skins.update(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    });
  }

  @Get('categories')
  listCategories() {
    return this.skins.listAllCategories();
  }

  @Post('categories')
  createCategory(@Body() body: CreateCategoryBody) {
    return this.skins.createCategory(body);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: UpdateCategoryBody) {
    return this.skins.updateCategory(id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.skins.deleteCategory(id);
  }

  @Get('users')
  async listUsers() {
    const rows = await this.users.list();
    return rows.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      entitlement: user.entitlements?.[0]
        ? {
            id: user.entitlements[0].id,
            userId: user.id,
            status: user.entitlements[0].status,
            plan: user.entitlements[0].plan,
            maxDevices: user.entitlements[0].maxDevices,
            grantSource: user.entitlements[0].grantSource,
            revokedAt: user.entitlements[0].revokedAt,
            revokeReason: user.entitlements[0].revokeReason,
            createdAt: user.entitlements[0].createdAt,
          }
        : null,
    }));
  }

  @Get('entitlements')
  listEntitlements() {
    return this.entitlements.listAll();
  }

  @OwnerOnly()
  @Post('entitlements/issue')
  issue(@CurrentUser() user: AuthUser, @Body() body: IssueBody) {
    return this.purchases.issueManualEntitlement(
      body.userId,
      this.actorId(user),
      body.reason,
      this.actorEmail(user),
    );
  }

  @OwnerOnly()
  @Post('entitlements/revoke')
  revoke(@CurrentUser() user: AuthUser, @Body() body: RevokeBody) {
    return this.entitlements.revoke(
      body.userId,
      body.reason,
      this.actorId(user),
      this.actorEmail(user),
    );
  }

  @Get('devices')
  async listDevices() {
    const rows = await this.devices.listAll();
    return rows.map((device) => ({
      id: device.id,
      userId: device.userId,
      label: device.label,
      status: device.status,
      appVersion: device.appVersion,
      iosVersion: device.iosVersion,
      publicKeyFingerprint: device.publicKeyFingerprint,
      lastSeenAt: device.lastSeenAt,
      deactivatedAt: device.deactivatedAt,
    }));
  }

  @OwnerOnly()
  @Post('devices/:id/revoke')
  async revokeDevice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: DeviceActionBody,
  ) {
    if (body.confirm !== true) {
      throw new BadRequestException('Confirmation is required');
    }
    const rows = await this.devices.listAll();
    const device = rows.find((row) => row.id === id);
    if (!device) {
      await this.audit.record({
        action: 'device.remove',
        actorUserId: this.actorId(user),
        actorEmail: this.actorEmail(user),
        actorType: 'owner',
        resourceType: 'device',
        resourceId: id,
        result: 'failure',
        metadata: { reason: body.reason },
      });
      return { ok: false };
    }
    await this.devices.deactivate(device.userId, device.id);
    await this.audit.record({
      action: 'device.remove',
      actorUserId: this.actorId(user),
      actorEmail: this.actorEmail(user),
      actorType: 'owner',
      resourceType: 'device',
      resourceId: device.id,
      result: 'success',
      metadata: { userId: device.userId, reason: body.reason },
    });
    return { ok: true };
  }

  @OwnerOnly()
  @Post('devices/transfer')
  async transferDevice(@CurrentUser() user: AuthUser, @Body() body: TransferDeviceBody) {
    if (body.confirm !== true) {
      throw new BadRequestException('Confirmation and customer are required');
    }
    const result = await this.devices.transfer(body.userId);
    await this.audit.record({
      action: 'device.transfer',
      actorUserId: this.actorId(user),
      actorEmail: this.actorEmail(user),
      actorType: 'owner',
      resourceType: 'user',
      resourceId: body.userId,
      result: 'success',
      metadata: { reason: body.reason, revoked: result.revoked },
    });
    return result;
  }

  @Get('remote-config')
  getRemoteConfig() {
    return this.remoteConfig.getDefault();
  }

  @OwnerOnly()
  @Post('remote-config')
  updateRemoteConfig(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateRemoteConfigBody,
  ) {
    return this.remoteConfig.update(body, this.actorId(user));
  }

  @Get('compatibility')
  listCompat() {
    return this.compatibility.listRules();
  }

  @Post('compatibility')
  upsertCompat(@Body() body: CompatBody) {
    return this.compatibility.upsertRule(body);
  }

  @Delete('compatibility/:id')
  deleteCompat(@Param('id') id: string) {
    return this.compatibility.deleteRule(id);
  }

  @Get('app-versions')
  listAppVersions() {
    return this.compatibility.listAppVersions();
  }

  @Post('app-versions')
  createAppVersion(@Body() body: AppVersionBody) {
    return this.compatibility.createAppVersion(body);
  }

  @Get('analytics')
  analyticsList() {
    return this.analytics.list();
  }

  @Get('audit-logs')
  auditLogs() {
    return this.audit.list();
  }

  @Get('ai-generations')
  listAi() {
    return this.ai.listAll();
  }

  @Post('ai-generations/:id/moderate')
  moderateAi(@Param('id') id: string, @Body() body: ModerateAiBody) {
    return this.ai.moderate(id, body.status);
  }
}
