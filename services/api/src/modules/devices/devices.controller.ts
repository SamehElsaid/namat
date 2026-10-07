import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CurrentUser, AuthUser } from '../../common/decorators/auth.decorators';
import { DevicesService, presentDevice } from './devices.service';

class RegisterDeviceBody {
  @IsString()
  @Length(8, 128)
  installationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iosVersion?: string;

  /** App-generated activation secret. Not an Apple UDID. */
  @IsOptional()
  @IsString()
  @Length(16, 128)
  installationToken?: string;

  /** Uncompressed P-256 public point, base64. The private key stays on the iPhone. */
  @IsOptional()
  @IsString()
  @Length(80, 180)
  publicKeyPoint?: string;
}

class ActivationChallengeBody {
  @IsString()
  @Length(8, 128)
  installationId!: string;
}

class ActivationProveBody {
  @IsString()
  @Length(16, 80)
  challengeId!: string;

  @IsString()
  @Length(16, 128)
  nonce!: string;

  @IsString()
  @Length(8, 256)
  signature!: string;
}

class RenameDeviceBody {
  @IsString()
  @Length(1, 64)
  label!: string;
}

class AttestationChallengeBody {
  @IsString()
  @Length(8, 128)
  installationId!: string;
}

class AttestationSubmitBody {
  @IsString()
  @Length(8, 128)
  installationId!: string;

  @IsString()
  @Length(16, 80)
  challengeId!: string;

  @IsString()
  @Length(16, 128)
  challenge!: string;

  @IsString()
  @Length(16, 128)
  keyId!: string;

  @IsString()
  @Length(100, 20000)
  attestationObject!: string;
}

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('register')
  async register(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceBody) {
    const device = await this.devices.register({
      userId: user.userId,
      installationId: body.installationId,
      appVersion: body.appVersion,
      iosVersion: body.iosVersion,
      installationToken: body.installationToken,
      publicKeyPoint: body.publicKeyPoint,
    });
    return presentDevice(device);
  }

  @Post('transfer')
  transfer(@CurrentUser() user: AuthUser) {
    return this.devices.transfer(user.userId);
  }

  @Post('activation/challenge')
  challenge(@CurrentUser() user: AuthUser, @Body() body: ActivationChallengeBody) {
    return this.devices.beginApplyProof(user.userId, body.installationId);
  }

  @Post('activation/prove')
  prove(@CurrentUser() user: AuthUser, @Body() body: ActivationProveBody) {
    return this.devices.completeApplyProof(
      user.userId,
      body.challengeId,
      body.nonce,
      body.signature,
    );
  }

  @Post('attestation/challenge')
  attestationChallenge(
    @CurrentUser() user: AuthUser,
    @Body() body: AttestationChallengeBody,
  ) {
    return this.devices.beginAttestation(user.userId, body.installationId);
  }

  @Post('attestation')
  attestation(@CurrentUser() user: AuthUser, @Body() body: AttestationSubmitBody) {
    return this.devices.submitAttestation({
      userId: user.userId,
      installationId: body.installationId,
      challengeId: body.challengeId,
      challenge: body.challenge,
      keyId: body.keyId,
      attestationObject: body.attestationObject,
    });
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.devices.listForUser(user.userId);
    return rows.map(presentDevice);
  }

  @Delete(':id')
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.devices.deactivate(user.userId, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RenameDeviceBody,
  ) {
    return this.devices.rename(user.userId, id, body.label);
  }
}
