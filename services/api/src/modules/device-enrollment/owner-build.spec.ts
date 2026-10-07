import { NotFoundException } from '@nestjs/common';
import { DeviceEnrollmentService } from './device-enrollment.service';

function make(jobsRows: any[], files: Record<string, number> = {}) {
  const jobs = {
    find: jest.fn(async ({ where }: any = {}) =>
      jobsRows.filter((j) => (where?.status ? j.status === where.status : true)),
    ),
  };
  const storage = {
    exists: jest.fn(async (p: string) => p in files),
    sizeOf: jest.fn(async (p: string) => {
      if (!(p in files)) throw new Error('missing');
      return files[p];
    }),
  };
  const service = Object.create(DeviceEnrollmentService.prototype) as DeviceEnrollmentService;
  Object.assign(service, { jobs, storage });
  return { service, jobs, storage };
}

describe('owner signed-build access', () => {
  it('reports no build when nothing is READY with an artifact', async () => {
    const { service } = make([
      { id: 'j1', status: 'SIGNING', artifactRelativePath: null, createdAt: new Date() },
      { id: 'j2', status: 'READY', artifactRelativePath: null, createdAt: new Date() },
    ]);
    const meta = await service.latestSignedBuildMeta();
    expect(meta.available).toBe(false);
    await expect(service.latestSignedBuildPath()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the newest READY build with metadata and path', async () => {
    const older = { id: 'old', status: 'READY', artifactRelativePath: 'signed-ipa/old.ipa', appVersion: '1.0.0', buildNumber: '1', ipaSha256: 'aaa', createdAt: new Date('2026-01-01') };
    const newer = { id: 'new', status: 'READY', artifactRelativePath: 'signed-ipa/new.ipa', appVersion: '1.1.0', buildNumber: '7', ipaSha256: 'bbb', createdAt: new Date('2026-06-01') };
    const { service } = make([older, newer], { 'signed-ipa/new.ipa': 5803977, 'signed-ipa/old.ipa': 10 });
    const meta = await service.latestSignedBuildMeta();
    expect(meta).toMatchObject({ available: true, jobId: 'new', appVersion: '1.1.0', buildNumber: '7', ipaSha256: 'bbb', sizeBytes: 5803977 });
    expect(await service.latestSignedBuildPath()).toBe('signed-ipa/new.ipa');
  });

  it('refuses a path when the newest build file is missing on disk', async () => {
    const job = { id: 'j', status: 'READY', artifactRelativePath: 'signed-ipa/gone.ipa', createdAt: new Date() };
    const { service } = make([job], {});
    await expect(service.latestSignedBuildPath()).rejects.toBeInstanceOf(NotFoundException);
  });
});
