import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Equals, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ConfigService } from '@nestjs/config';
import {
  AdminOnly,
  AuthUser,
  CurrentUser,
  OwnerOnly,
} from '../../common/decorators/auth.decorators';
import { SkinsService } from '../skins/skins.service';
import { UsersService } from '../users/users.service';
import { PurchasesService } from '../purchases/purchases.service';
import { CompatibilityService } from '../compatibility/compatibility.service';
import { PaymentsService } from '../payments/payments.service';
import { MoyasarCheckoutService } from '../payments/moyasar/moyasar-checkout.service';
import { PaymentSettingsService } from '../payments/moyasar/payment-settings.service';
import { SmtpMailer } from '../auth/smtp.mailer';

class SetRoleBody {
  @IsIn(['user', 'admin', 'owner'])
  role!: 'user' | 'admin' | 'owner';
}

class SetActiveBody {
  @IsBoolean()
  isActive!: boolean;
}

class RefundBody {
  @IsBoolean()
  confirm!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason!: string;
}

class IpaAttestationBody {
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  sha256!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  bundleId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  executable!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  profileExpiresAt!: string;

  @Equals(true)
  distribution!: true;

  @Equals('codesign_distribution')
  reason!: 'codesign_distribution';

  @IsString()
  @MinLength(16)
  signature!: string;
}

class PublishReleaseBody {
  @IsOptional()
  @ValidateNested()
  @Type(() => IpaAttestationBody)
  attestation?: IpaAttestationBody;
}

class AppVersionFlagsBody {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isMandatory?: boolean;
}

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

@AdminOnly()
@Controller('admin')
export class AdminOperationsController {
  constructor(
    private readonly skins: SkinsService,
    private readonly users: UsersService,
    private readonly purchases: PurchasesService,
    private readonly compatibility: CompatibilityService,
    private readonly payments: PaymentsService,
    private readonly checkout: MoyasarCheckoutService,
    private readonly paymentSettings: PaymentSettingsService,
    private readonly mailer: SmtpMailer,
    private readonly config: ConfigService,
  ) {}

  private actorId(user: AuthUser): string | null {
    return user.userId === 'admin-token' ? null : user.userId;
  }

  private actor(user: AuthUser) {
    return {
      userId: this.actorId(user),
      email: user.userId === 'admin-token' ? null : user.email,
    };
  }

  @Get('purchases')
  listPurchases() {
    return this.purchases.listAll();
  }

  @OwnerOnly()
  @Post('purchases/:id/refund')
  refundPurchase(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RefundBody,
  ) {
    if (body.confirm !== true) {
      throw new BadRequestException('Confirmation is required');
    }
    return this.checkout.refund(id, this.actor(user), body.reason);
  }

  @OwnerOnly()
  @Post('purchases/:id/reverse')
  async reversePurchase(
    @Param('id') id: string,
    @Body() body: RefundBody,
  ) {
    if (body.confirm !== true) {
      throw new BadRequestException('Confirmation is required');
    }
    const purchase = await this.purchases.getById(id);
    if (purchase.provider !== 'nearpay') {
      throw new BadRequestException('Only historical terminal purchases can be reversed here.');
    }
    return this.payments.requestAdjustment(id, 'reverse');
  }

  @OwnerOnly()
  @Get('smtp/status')
  smtpStatus() {
    return this.mailer.status();
  }

  @OwnerOnly()
  @Post('smtp/probe')
  probeSmtp() {
    return this.mailer.probe();
  }

  @OwnerOnly()
  @Post('entitlements/owner-test')
  ownerTestEntitlement(@CurrentUser() user: AuthUser) {
    if (!user.userId || user.userId === 'admin-token') {
      throw new BadRequestException('Owner session required');
    }
    return this.purchases.ensureOwnerTestEntitlement(user.userId);
  }

  @Get('system')
  async system() {
    const nodeEnv = this.config.get<string>('app.nodeEnv') ?? 'development';
    const payment = await this.paymentSettings.resolve();
    return {
      nodeEnv,
      nearpayConfigured: !this.payments.isMockMode(),
      mockEntitlementAllowed: this.payments.allowsMockEntitlement(),
      smtpConfigured: this.mailer.isConfigured(),
      aiConfigured: Boolean(this.config.get<string>('app.aiApiKey')),
      ownerBootstrapConfigured: Boolean(
        (this.config.get<string>('app.ownerBootstrapEmail') ?? '').trim(),
      ),
      checkoutAvailable: payment.checkoutAvailable,
      paymentMode: payment.mode,
      paymentReady: payment.ready,
    };
  }

  @Get('skins/:id/versions')
  versions(@Param('id') id: string) {
    return this.skins.listVersions(id);
  }

  @Post('skins/:id/artwork')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadArtwork(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: UploadFile,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Artwork file is required');
    }
    return this.skins.uploadArtwork({
      skinId: id,
      bytes: file.buffer,
      mimeType: file.mimetype || 'application/octet-stream',
      actorUserId: this.actorId(user),
    });
  }

  @Post('skins/:id/rollback/:version')
  rollback(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.skins.rollbackToVersion(id, version, this.actorId(user));
  }

  @Post('app-versions/:id/flags')
  setAppVersionFlags(@Param('id') id: string, @Body() body: AppVersionFlagsBody) {
    return this.compatibility.setAppVersionFlags(id, body);
  }

  @OwnerOnly()
  @Post('app-versions/:id/publish')
  publishRelease(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: PublishReleaseBody,
  ) {
    return this.compatibility.publishRelease(id, this.actor(user), undefined, body?.attestation ?? null);
  }

  @OwnerOnly()
  @Post('app-versions/:id/unpublish')
  unpublishRelease(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.compatibility.unpublishRelease(id, this.actor(user));
  }

  @Post('app-versions/:id/ipa')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 80 * 1024 * 1024 },
    }),
  )
  uploadIpa(@Param('id') id: string, @UploadedFile() file?: UploadFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('IPA file is required');
    }
    return this.compatibility.attachIpa(
      id,
      file.buffer,
      file.originalname || 'app.ipa',
    );
  }

  @OwnerOnly()
  @Post('users/:id/role')
  setRole(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: SetRoleBody,
  ) {
    return this.users.setRole(actor, id, body.role);
  }

  @OwnerOnly()
  @Post('users/:id/active')
  setActive(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: SetActiveBody,
  ) {
    return this.users.setActive(actor, id, body.isActive);
  }
}
