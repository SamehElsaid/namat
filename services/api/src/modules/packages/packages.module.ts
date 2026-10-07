import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackageEntity } from '../../database/entities/package.entity';
import { PackagesService } from './packages.service';
import {
  AdminPackagesController,
  PublicPackagesController,
} from './packages.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([PackageEntity]), AuditModule],
  providers: [PackagesService],
  controllers: [PublicPackagesController, AdminPackagesController],
  exports: [PackagesService],
})
export class PackagesModule {}
