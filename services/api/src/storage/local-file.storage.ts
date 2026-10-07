import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface StoredFile {
  relativePath: string;
  absolutePath: string;
  contentHash: string;
  byteSize: number;
  mimeType: string;
}

@Injectable()
export class LocalFileStorage {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = path.resolve(
      this.config.get<string>('app.uploadDir') ?? 'uploads',
    );
  }

  getRoot(): string {
    return this.root;
  }

  async ensureReady(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  resolveInsideRoot(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (
      !normalized ||
      normalized.includes('..') ||
      normalized.includes('\0')
    ) {
      throw new Error('Invalid storage path');
    }
    const abs = path.resolve(this.root, normalized);
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : this.root + path.sep;
    if (abs !== this.root && !abs.startsWith(rootWithSep)) {
      throw new Error('Invalid storage path');
    }
    return abs;
  }

  async writeBuffer(
    relativePath: string,
    data: Buffer,
    mimeType: string,
  ): Promise<StoredFile> {
    const abs = this.resolveInsideRoot(relativePath);
    const temp = `${abs}.tmp-${crypto.randomBytes(6).toString('hex')}`;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(temp, data);
    const readBack = await fs.readFile(temp);
    if (!readBack.equals(data)) {
      await fs.rm(temp, { force: true });
      throw new Error('Staged upload verification failed');
    }
    await fs.rename(temp, abs);
    const contentHash = crypto.createHash('sha256').update(data).digest('hex');
    return {
      relativePath,
      absolutePath: abs,
      contentHash,
      byteSize: data.length,
      mimeType,
    };
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolveInsideRoot(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async readBuffer(relativePath: string): Promise<Buffer> {
    return fs.readFile(this.resolveInsideRoot(relativePath));
  }

  async sizeOf(relativePath: string): Promise<number> {
    const stat = await fs.stat(this.resolveInsideRoot(relativePath));
    return stat.size;
  }

  publicUrl(relativePath: string): string {
    const base = (
      this.config.get<string>('app.publicBaseUrl') ?? 'http://localhost:3001'
    ).replace(/\/$/, '');
    return `${base}/uploads/${relativePath.replace(/^\/+/, '')}`;
  }
}
