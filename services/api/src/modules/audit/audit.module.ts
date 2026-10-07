import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity, UserEntity } from '../../database/entities';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity, UserEntity])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
