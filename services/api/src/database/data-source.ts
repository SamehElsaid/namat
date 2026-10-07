import { DataSource, DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities';
import { InitialSchema1710000000000 } from './migrations/1710000000000-InitialSchema';
import { RemediationColumns1710000001000 } from './migrations/1710000001000-RemediationColumns';
import { NearpayJobId1710000002000 } from './migrations/1710000002000-NearpayJobId';
import { DeviceEnrollment1710000003000 } from './migrations/1710000003000-DeviceEnrollment';
import { EnrollmentChallenge1710000004000 } from './migrations/1710000004000-EnrollmentChallenge';
import { EnrollmentCmsDiagnostic1710000005000 } from './migrations/1710000005000-EnrollmentCmsDiagnostic';
import { AccountIdentities1710000006000 } from './migrations/1710000006000-AccountIdentities';
import { OneDeviceActivation1710000007000 } from './migrations/1710000007000-OneDeviceActivation';
import { MoyasarOwnerControl1710000008000 } from './migrations/1710000008000-MoyasarOwnerControl';
import { IpaVerificationEvidence1710000009000 } from './migrations/1710000009000-IpaVerificationEvidence';
import { OwnerPasswordLogin1710000010000 } from './migrations/1710000010000-OwnerPasswordLogin';
import { EnrollmentManifestIndex1710000011000 } from './migrations/1710000011000-EnrollmentManifestIndex';
import { Packages1710000012000 } from './migrations/1710000012000-Packages';
import { CustomerSupport1710000013000 } from './migrations/1710000013000-CustomerSupport';
import { DeviceAppAttest1710000014000 } from './migrations/1710000014000-DeviceAppAttest';
import { Telegram1710000015000 } from './migrations/1710000015000-Telegram';

export function buildDataSourceOptions(): DataSourceOptions {
  const isTest = process.env.NODE_ENV === 'test';

  if (isTest || process.env.DATABASE_DRIVER === 'sqlite') {
    return {
      type: 'better-sqlite3',
      database: process.env.SQLITE_PATH ?? ':memory:',
      entities: ALL_ENTITIES,
      synchronize: true,
      logging: false,
    };
  }

  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'namat',
    password: process.env.DATABASE_PASSWORD ?? '',
    database: process.env.DATABASE_NAME ?? 'namat',
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
    entities: ALL_ENTITIES,
    migrations: [
      InitialSchema1710000000000,
      RemediationColumns1710000001000,
      NearpayJobId1710000002000,
      DeviceEnrollment1710000003000,
      EnrollmentChallenge1710000004000,
      EnrollmentCmsDiagnostic1710000005000,
      AccountIdentities1710000006000,
      OneDeviceActivation1710000007000,
      MoyasarOwnerControl1710000008000,
      IpaVerificationEvidence1710000009000,
      OwnerPasswordLogin1710000010000,
      EnrollmentManifestIndex1710000011000,
      Packages1710000012000,
      CustomerSupport1710000013000,
      DeviceAppAttest1710000014000,
      Telegram1710000015000,
    ],
    synchronize: process.env.TYPEORM_SYNC === 'true',
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}

export default new DataSource(buildDataSourceOptions());
