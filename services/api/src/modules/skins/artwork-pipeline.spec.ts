import { PNG } from 'pngjs';
import { prepareArtwork } from './artwork-pipeline';

function solidPng(width: number, height: number, rgba: number[]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgba[0] ?? 0;
    png.data[i * 4 + 1] = rgba[1] ?? 0;
    png.data[i * 4 + 2] = rgba[2] ?? 0;
    png.data[i * 4 + 3] = rgba[3] ?? 255;
  }
  return PNG.sync.write(png);
}

describe('artwork pipeline', () => {
  it('builds distinct 3x and 2x variants at the audited sizes', () => {
    const src = solidPng(80, 80, [10, 20, 30, 255]);
    const prepared = prepareArtwork(src, 'image/png');
    const x3 = PNG.sync.read(prepared.x3);
    const x2 = PNG.sync.read(prepared.x2);
    expect(x3.width).toBe(1536);
    expect(x3.height).toBe(969);
    expect(x2.width).toBe(1024);
    expect(x2.height).toBe(646);
    expect(prepared.x3.equals(prepared.x2)).toBe(false);
    expect(prepared.contentHash).toHaveLength(64);
    expect(x3.data[3]).toBe(255);
  });

  it('rejects a non-image payload', () => {
    expect(() => prepareArtwork(Buffer.from('not-an-image'), 'text/plain')).toThrow(
      /Unsupported image/,
    );
  });
});
