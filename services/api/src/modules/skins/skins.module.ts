import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SkinEntity,
  SkinVersionEntity,
  CategoryEntity,
  AssetEntity,
} from '../../database/entities';
import { SkinsService } from './skins.service';
import { SkinsController } from './skins.controller';
import { StorageModule } from '../../storage/storage.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SkinEntity,
      SkinVersionEntity,
      CategoryEntity,
      AssetEntity,
    ]),
    StorageModule,
    AuditModule,
  ],
  providers: [SkinsService],
  controllers: [SkinsController],
  exports: [SkinsService],
})
export class SkinsModule {}
