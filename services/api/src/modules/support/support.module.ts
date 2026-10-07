import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportNoteEntity } from '../../database/entities';
import { AuditModule } from '../audit/audit.module';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SupportNoteEntity]), AuditModule],
  providers: [SupportService],
  controllers: [SupportController],
  exports: [SupportService],
})
export class SupportModule {}
