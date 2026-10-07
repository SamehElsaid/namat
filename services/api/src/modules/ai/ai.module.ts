import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiGenerationEntity } from '../../database/entities';
import { AiGenerationsService } from './ai-generations.service';
import { AiGenerationsController } from './ai-generations.controller';
import { StorageModule } from '../../storage/storage.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AuditModule } from '../audit/audit.module';
import { SkinsModule } from '../skins/skins.module';
import { MockAiSkinProvider } from './mock-ai.provider';
import { OpenAiImageProvider } from './openai-image.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiGenerationEntity]),
    StorageModule,
    SkinsModule,
    EntitlementsModule,
    AuditModule,
  ],
  providers: [MockAiSkinProvider, OpenAiImageProvider, AiGenerationsService],
  controllers: [AiGenerationsController],
  exports: [AiGenerationsService],
})
export class AiModule {}
