import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiSkinGenerateInput,
  AiSkinGenerateResult,
  AiSkinProvider,
} from './ai-provider.interface';
import { inspectPrompt, withStylePreset } from './prompt-guard';

const WALLET_HINT =
  /localkey|passhash|cardhash|walletcard|applepay|primaryaccount|\b[0-9a-f]{32,}\b/i;

/**
 * OpenAI-compatible image generation. Selected only when AI_API_KEY is set.
 * Prompts are text only. Wallet identifiers are rejected before the request.
 */
@Injectable()
export class OpenAiImageProvider implements AiSkinProvider {
  readonly name = 'openai-images';

  constructor(private readonly config: ConfigService) {}

  async generate(input: AiSkinGenerateInput): Promise<AiSkinGenerateResult> {
    const inspection = inspectPrompt(input.prompt);
    if (!inspection.ok || WALLET_HINT.test(inspection.redacted)) {
      throw new ServiceUnavailableException(
        'Prompt rejected: Wallet material is not allowed.',
      );
    }
    const prompt = withStylePreset(inspection.redacted, input.stylePresetId);
    const key = this.config.get<string>('app.aiApiKey') ?? '';
    const base = (
      this.config.get<string>('app.aiApiBaseUrl') ?? 'https://api.openai.com/v1'
    ).replace(/\/$/, '');
    const model = this.config.get<string>('app.aiModel') ?? 'gpt-image-1';
    if (!key) {
      throw new ServiceUnavailableException('AI provider is not configured');
    }
    const body = {
      model,
      prompt: prompt.slice(0, 4000),
      size: '1536x1024',
      quality: 'low',
      output_format: 'png',
      n: 1,
    };
    let lastError = 'AI provider request failed';
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      try {
        const response = await fetch(`${base}/images/generations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) {
          lastError = `AI provider HTTP ${response.status}`;
          if (response.status >= 500 && attempt === 0) continue;
          throw new ServiceUnavailableException(lastError);
        }
        const json = (await response.json()) as {
          data?: Array<{ b64_json?: string }>;
        };
        const b64 = json.data?.[0]?.b64_json;
        if (!b64) {
          throw new ServiceUnavailableException('AI provider returned no image');
        }
        return {
          provider: this.name,
          mode: 'live',
          png: Buffer.from(b64, 'base64'),
          contentType: 'image/png',
          moderated: false,
          notes: [`model:${model}`],
        };
      } catch (err) {
        if (err instanceof ServiceUnavailableException && attempt === 1) throw err;
        lastError = err instanceof Error ? err.message : lastError;
        if (attempt === 1) {
          throw new ServiceUnavailableException(lastError);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ServiceUnavailableException(lastError);
  }
}
