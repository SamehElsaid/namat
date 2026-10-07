import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import {
  CARD_ARTWORK_WIDTH,
  CARD_ARTWORK_HEIGHT,
} from '@namat/shared';
import { AiGenerationEntity } from '../../database/entities/ai-generation.entity';
import { LocalFileStorage } from '../../storage/local-file.storage';
import { SkinsService } from '../skins/skins.service';
import { ConfigService } from '@nestjs/config';
import { MockAiSkinProvider } from './mock-ai.provider';
import { OpenAiImageProvider } from './openai-image.provider';
import { AiSkinProvider } from './ai-provider.interface';
import { inspectPrompt, withStylePreset } from './prompt-guard';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AiGenerationsService {
  private readonly provider: AiSkinProvider;

  constructor(
    @InjectRepository(AiGenerationEntity)
    private readonly gens: Repository<AiGenerationEntity>,
    private readonly storage: LocalFileStorage,
    private readonly config: ConfigService,
    mockProvider: MockAiSkinProvider,
    liveProvider: OpenAiImageProvider,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {
    const key = (this.config.get<string>('app.aiApiKey') ?? '').trim();
    this.provider = key ? liveProvider : mockProvider;
  }

  isLive(): boolean {
    return this.provider.name !== 'mock';
  }

  async create(input: {
    userId: string;
    prompt: string;
    stylePresetId?: string;
    referenceImageUrl?: string;
  }): Promise<AiGenerationEntity> {
    const nodeEnv = this.config.get<string>('app.nodeEnv') ?? 'development';
    if (!this.isLive() && nodeEnv === 'production') {
      throw new ServiceUnavailableException(
        'AI generation is unavailable until AI_API_KEY is configured.',
      );
    }
    const { entitlement } = await this.entitlements.getForUser(input.userId);
    if (!entitlement || entitlement.status !== 'active') {
      throw new ForbiddenException(
        'An active entitlement is required for AI generation.',
      );
    }
    const inspection = inspectPrompt(input.prompt);
    if (!inspection.ok) {
      await this.audit.record({
        action: 'ai.prompt_rejected',
        actorUserId: input.userId,
        actorType: 'user',
        resourceType: 'ai_generation',
        metadata: { reasons: inspection.reasons },
      });
      throw new ServiceUnavailableException(
        'Prompt rejected: card, Wallet, or pairing material is not allowed.',
      );
    }
    const limit = this.config.get<number>('app.aiMonthlyGenerationLimit') ?? 20;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const used = await this.gens.count({
      where: { userId: input.userId, createdAt: MoreThan(monthStart) },
    });
    if (used >= limit) {
      throw new HttpException(
        'AI generation limit reached for this month.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const styledPrompt = withStylePreset(inspection.redacted, input.stylePresetId);
    const row = await this.gens.save(
      this.gens.create({
        userId: input.userId,
        prompt: inspection.redacted.slice(0, 4000),
        stylePresetId: input.stylePresetId ?? null,
        referenceImageUrl: input.referenceImageUrl ?? null,
        status: 'processing',
        metadata: {
          width: CARD_ARTWORK_WIDTH,
          height: CARD_ARTWORK_HEIGHT,
          provider: this.provider.name,
        },
      }),
    );

    let result;
    try {
      result = await this.provider.generate({
        prompt: styledPrompt,
        stylePresetId: input.stylePresetId,
        width: CARD_ARTWORK_WIDTH,
        height: CARD_ARTWORK_HEIGHT,
      });
    } catch {
      row.status = 'failed';
      row.metadata = {
        ...(row.metadata ?? {}),
        notes: ['provider_error'],
      };
      await this.gens.save(row);
      throw new ServiceUnavailableException('AI generation failed.');
    }

    const hash = SkinsService.hashBuffer(result.png);
    const relative = `ai/${input.userId}/${row.id}.png`;
    await this.storage.writeBuffer(relative, result.png, result.contentType);
    row.status = result.moderated ? 'moderated' : 'completed';
    row.resultAssetPath = relative;
    row.metadata = {
      ...(row.metadata ?? {}),
      contentHash: hash,
      width: CARD_ARTWORK_WIDTH,
      height: CARD_ARTWORK_HEIGHT,
      provider: result.provider,
      mode: result.mode,
      notes: result.notes ?? [],
      stylePresetId: input.stylePresetId ?? null,
    };
    await this.audit.record({
      action: 'ai.generation_completed',
      actorUserId: input.userId,
      actorType: 'user',
      resourceType: 'ai_generation',
      resourceId: row.id,
      metadata: {
        provider: result.provider,
        stylePresetId: input.stylePresetId ?? null,
        monthCount: used + 1,
        limit,
      },
    });
    return this.gens.save(row);
  }

  async listForUser(userId: string): Promise<AiGenerationEntity[]> {
    return this.gens.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async listAll(): Promise<AiGenerationEntity[]> {
    return this.gens.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  async moderate(
    id: string,
    status: 'moderated' | 'completed',
  ): Promise<AiGenerationEntity> {
    const row = await this.gens.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('AI generation not found');
    }
    row.status = status;
    return this.gens.save(row);
  }
}
