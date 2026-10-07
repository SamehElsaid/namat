import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  AdminOnly,
  AuthUser,
  CurrentUser,
  OwnerOnly,
  Public,
} from '../../common/decorators/auth.decorators';
import { PackagesService } from './packages.service';
import { PackageEntity } from '../../database/entities/package.entity';

function toPublic(p: PackageEntity) {
  return {
    id: p.id,
    code: p.code,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    priceMinor: p.priceMinor,
    currency: p.currency,
    maxDevices: p.maxDevices,
    durationDays: p.durationDays,
    isPublished: p.isPublished,
    sortOrder: p.sortOrder,
  };
}

class CreatePackageBody {
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/)
  code!: string;

  @IsString()
  @Length(1, 128)
  nameEn!: string;

  @IsString()
  @Length(1, 128)
  nameAr!: string;

  @IsInt()
  @Min(100)
  @Max(100_000_000)
  priceMinor!: number;

  @IsOptional()
  @IsString()
  @Length(3, 8)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxDevices?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class UpdatePackageBody {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  nameAr?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  priceMinor?: number;

  @IsOptional()
  @IsString()
  @Length(3, 8)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxDevices?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

@Controller('packages')
export class PublicPackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Public()
  @Get()
  async list() {
    const rows = await this.packages.listPublished();
    return { packages: rows.map(toPublic) };
  }
}

@Controller('admin/packages')
@AdminOnly()
export class AdminPackagesController {
  constructor(private readonly packages: PackagesService) {}

  private actor(user: AuthUser) {
    return {
      userId: user.userId === 'admin-token' ? null : user.userId,
      email: user.email ?? null,
    };
  }

  @Get()
  async list() {
    const rows = await this.packages.listAll();
    return rows.map(toPublic);
  }

  @OwnerOnly()
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreatePackageBody) {
    return toPublic(await this.packages.create(body, this.actor(user)));
  }

  @OwnerOnly()
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdatePackageBody,
  ) {
    return toPublic(await this.packages.update(id, body, this.actor(user)));
  }
}
