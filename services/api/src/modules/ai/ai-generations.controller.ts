import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CurrentUser, AuthUser } from '../../common/decorators/auth.decorators';
import { AiGenerationsService } from './ai-generations.service';
import { LocalFileStorage } from '../../storage/local-file.storage';

class CreateGenerationBody {
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

@Controller('ai/generations')
export class AiGenerationsController {
  constructor(
    private readonly ai: AiGenerationsService,
    private readonly storage: LocalFileStorage,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateGenerationBody,
  ) {
    const row = await this.ai.create({
      userId: user.userId,
      prompt: body.prompt,
      stylePresetId: body.stylePresetId,
      referenceImageUrl: body.referenceImageUrl,
    });
    return {
      id: row.id,
      status: row.status,
      prompt: row.prompt,
      stylePresetId: row.stylePresetId,
      resultUrl: row.resultAssetPath
        ? this.storage.publicUrl(row.resultAssetPath)
        : null,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.ai.listForUser(user.userId);
  }
}
