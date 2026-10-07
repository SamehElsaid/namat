import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity, UserEntity } from '../../database/entities';
import { UsersService } from './users.service';
import { MeController } from './me.controller';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, SessionEntity]),
    EntitlementsModule,
    AuditModule,
  ],
  providers: [UsersService],
  controllers: [MeController],
  exports: [UsersService],
})
export class UsersModule {}
