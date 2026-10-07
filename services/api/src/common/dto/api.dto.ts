import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @IsEmail()
  email!: string;
}

export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 8)
  @Matches(/^\d+$/)
  code!: string;
}

export class RegisterDeviceDto {
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
}

export class CreateAiGenerationDto {
  @IsString()
  @Length(3, 4000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stylePresetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  referenceImageUrl?: string;
}

export class TrackAnalyticsDto {
  @IsString()
  @Length(2, 64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  installationId?: string;

  @IsOptional()
  properties?: Record<string, unknown>;
}

export class CreateSkinDto {
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsString()
  @Length(1, 128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nameAr?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class UpdateRemoteConfigDto {
  @IsOptional()
  killSwitchApply?: boolean;

  @IsOptional()
  killSwitchRestore?: boolean;

  @IsOptional()
  @IsString()
  minAppVersion?: string;

  @IsOptional()
  @IsString()
  minIosVersion?: string;

  @IsOptional()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsString()
  message?: string;
}

export class IssueEntitlementDto {
  @IsString()
  userId!: string;
}

export class RevokeEntitlementDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
