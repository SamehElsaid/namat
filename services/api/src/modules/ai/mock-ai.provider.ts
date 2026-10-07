import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiSkinGenerateInput,
  AiSkinGenerateResult,
  AiSkinProvider,
} from './ai-provider.interface';
import { withStylePreset } from './prompt-guard';

/**
 * Default provider when AI_API_KEY / OPENAI_API_KEY is absent.
 * Produces a deterministic placeholder PNG for local/dev and sandbox.
 */
@Injectable()
export class MockAiSkinProvider implements AiSkinProvider {
  readonly name = 'mock';

  constructor(private readonly config: ConfigService) {}

  async generate(input: AiSkinGenerateInput): Promise<AiSkinGenerateResult> {
    void this.config;
    const styled = withStylePreset(input.prompt, input.stylePresetId);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    return {
      provider: this.name,
      mode: 'mock',
      png,
      contentType: 'image/png',
      moderated: false,
      notes: [
        'Mock AI provider active — set AI_API_KEY to enable a live provider.',
        `style:${input.stylePresetId ?? 'none'}`,
        `prompt-bytes:${styled.length}`,
      ],
    };
  }
}
