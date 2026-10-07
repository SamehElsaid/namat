/**
 * AI Skin Studio provider boundary.
 * Implementations must never accept Wallet card data, pass hashes, or pairing material.
 */
export interface AiSkinGenerateInput {
  prompt: string;
  stylePresetId?: string;
  /** Non-Wallet user reference image URL only. */
  referenceImageUrl?: string;
  width: number;
  height: number;
}

export interface AiSkinGenerateResult {
  provider: string;
  mode: 'mock' | 'live';
  png: Buffer;
  contentType: 'image/png';
  moderated: boolean;
  notes?: string[];
}

export interface AiSkinProvider {
  readonly name: string;
  generate(input: AiSkinGenerateInput): Promise<AiSkinGenerateResult>;
}
