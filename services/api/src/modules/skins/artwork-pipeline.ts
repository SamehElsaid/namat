import { BadRequestException } from '@nestjs/common';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';
import { createHash } from 'crypto';
import {
  CARD_ARTWORK_2X_HEIGHT,
  CARD_ARTWORK_2X_WIDTH,
  CARD_ARTWORK_HEIGHT,
  CARD_ARTWORK_WIDTH,
} from '@namat/shared';

/** Audited AirCard targets: cardBackgroundCombined@3x 1536×969, @2x 1024×646. */
export const ARTWORK_3X = {
  width: CARD_ARTWORK_WIDTH,
  height: CARD_ARTWORK_HEIGHT,
  filename: 'cardBackgroundCombined@3x.png',
};
export const ARTWORK_2X = {
  width: CARD_ARTWORK_2X_WIDTH,
  height: CARD_ARTWORK_2X_HEIGHT,
  filename: 'cardBackgroundCombined@2x.png',
};
export const ARTWORK_THUMB = {
  width: 480,
  height: 303,
  filename: 'thumbnail.png',
};

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg']);

export interface PreparedArtwork {
  x3: Buffer;
  x2: Buffer;
  thumbnail: Buffer;
  contentHash: string;
  width: number;
  height: number;
  sourceMime: string;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function decodeToRgba(
  input: Buffer,
  mime: string,
): { width: number; height: number; data: Buffer } {
  if (mime === 'image/png' || looksLikePng(input)) {
    const png = PNG.sync.read(input);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg' || looksLikeJpeg(input)) {
    const decoded = jpeg.decode(input, { useTArray: true, formatAsRGBA: true });
    if (!decoded?.width || !decoded?.height) {
      throw new BadRequestException('JPEG could not be decoded');
    }
    return {
      width: decoded.width,
      height: decoded.height,
      data: Buffer.from(decoded.data),
    };
  }
  throw new BadRequestException('Unsupported image format. Upload PNG or JPEG.');
}

function looksLikePng(buf: Buffer): boolean {
  return (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function looksLikeJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
}

/** Center cover-fit. Alpha is preserved. @2x is a real resample, not a copy of @3x. */
export function coverFit(
  src: { width: number; height: number; data: Buffer },
  width: number,
  height: number,
): PNG {
  if (src.width < 8 || src.height < 8) {
    throw new BadRequestException('Image is too small');
  }
  const scale = Math.max(width / src.width, height / src.height);
  const scaledW = src.width * scale;
  const scaledH = src.height * scale;
  const ox = (scaledW - width) / 2;
  const oy = (scaledH - height) / 2;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(
      src.height - 1,
      Math.max(0, Math.floor((y + oy) / scale)),
    );
    for (let x = 0; x < width; x++) {
      const sx = Math.min(
        src.width - 1,
        Math.max(0, Math.floor((x + ox) / scale)),
      );
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = src.data[si] ?? 0;
      out.data[di + 1] = src.data[si + 1] ?? 0;
      out.data[di + 2] = src.data[si + 2] ?? 0;
      out.data[di + 3] = src.data[si + 3] ?? 255;
    }
  }
  return out;
}

export function prepareArtwork(input: Buffer, mimeType: string): PreparedArtwork {
  if (!input?.length) {
    throw new BadRequestException('Empty artwork upload');
  }
  if (input.length > MAX_BYTES) {
    throw new BadRequestException('Artwork exceeds 8 MB');
  }
  const mime = mimeType.toLowerCase();
  if (!ALLOWED.has(mime) && !looksLikePng(input) && !looksLikeJpeg(input)) {
    throw new BadRequestException('Unsupported image format. Upload PNG or JPEG.');
  }
  let decoded: { width: number; height: number; data: Buffer };
  try {
    decoded = decodeToRgba(input, mime);
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('Image could not be decoded');
  }
  if (decoded.width < 64 || decoded.height < 64) {
    throw new BadRequestException('Image dimensions are below 64×64');
  }
  const x3 = coverFit(decoded, ARTWORK_3X.width, ARTWORK_3X.height);
  const x2 = coverFit(decoded, ARTWORK_2X.width, ARTWORK_2X.height);
  const thumb = coverFit(decoded, ARTWORK_THUMB.width, ARTWORK_THUMB.height);
  const x3Buf = PNG.sync.write(x3);
  const x2Buf = PNG.sync.write(x2);
  const thumbBuf = PNG.sync.write(thumb);
  if (x3Buf.equals(x2Buf)) {
    throw new BadRequestException('Variant generation produced identical bytes');
  }
  return {
    x3: x3Buf,
    x2: x2Buf,
    thumbnail: thumbBuf,
    contentHash: sha256(x3Buf),
    width: decoded.width,
    height: decoded.height,
    sourceMime: looksLikePng(input) ? 'image/png' : mime,
  };
}
