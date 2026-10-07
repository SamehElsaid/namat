import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ALL_ENTITIES } from '../src/database/entities';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { SkinEntity } from '../src/database/entities/skin.entity';
import { SkinVersionEntity } from '../src/database/entities/skin-version.entity';
import { RemoteConfigEntity } from '../src/database/entities/remote-config.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import {
  CompatibilityRuleEntity,
  AppVersionEntity,
} from '../src/database/entities/compatibility.entity';

/** Minimal valid 1×1 PNG. */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  const isSqlite = process.env.DATABASE_DRIVER === 'sqlite';
  const ds = new DataSource(
    isSqlite
      ? {
          type: 'better-sqlite3',
          database: process.env.SQLITE_PATH ?? path.join(__dirname, '../uploads/seed.sqlite'),
          entities: ALL_ENTITIES,
          synchronize: true,
        }
      : {
          type: 'postgres',
          host: process.env.DATABASE_HOST ?? 'localhost',
          port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
          username: process.env.DATABASE_USER ?? 'namat',
          password: process.env.DATABASE_PASSWORD ?? '',
          database: process.env.DATABASE_NAME ?? 'namat',
          entities: ALL_ENTITIES,
          synchronize: process.env.TYPEORM_SYNC === 'true',
        },
  );

  await ds.initialize();
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');
  fs.mkdirSync(path.join(uploadRoot, 'skins'), { recursive: true });

  const categories = ds.getRepository(CategoryEntity);
  const skins = ds.getRepository(SkinEntity);
  const versions = ds.getRepository(SkinVersionEntity);
  const configs = ds.getRepository(RemoteConfigEntity);
  const users = ds.getRepository(UserEntity);
  const rules = ds.getRepository(CompatibilityRuleEntity);
  const appVersions = ds.getRepository(AppVersionEntity);

  let geo = await categories.findOne({ where: { slug: 'geometric' } });
  if (!geo) {
    geo = await categories.save(
      categories.create({
        slug: 'geometric',
        name: 'Geometric',
        nameAr: 'هندسي',
        sortOrder: 1,
        isActive: true,
      }),
    );
  }
  let nature = await categories.findOne({ where: { slug: 'nature' } });
  if (!nature) {
    nature = await categories.save(
      categories.create({
        slug: 'nature',
        name: 'Nature',
        nameAr: 'طبيعة',
        sortOrder: 2,
        isActive: true,
      }),
    );
  }

  const samples = [
    {
      slug: 'sand-dune',
      name: 'Sand Dune',
      nameAr: 'كثيب رملي',
      categoryId: nature.id,
      description: 'Warm desert gradient placeholder skin',
    },
    {
      slug: 'night-grid',
      name: 'Night Grid',
      nameAr: 'شبكة ليلية',
      categoryId: geo.id,
      description: 'Dark geometric grid placeholder skin',
    },
    {
      slug: 'coral-wave',
      name: 'Coral Wave',
      nameAr: 'موجة مرجانية',
      categoryId: nature.id,
      description: 'Soft coral wave placeholder skin',
    },
  ];

  for (const sample of samples) {
    let skin = await skins.findOne({ where: { slug: sample.slug } });
    const relative = `skins/${sample.slug}.png`;
    const abs = path.join(uploadRoot, relative);
    fs.writeFileSync(abs, PLACEHOLDER_PNG);
    const contentHash = crypto
      .createHash('sha256')
      .update(PLACEHOLDER_PNG)
      .digest('hex');

    if (!skin) {
      skin = await skins.save(
        skins.create({
          slug: sample.slug,
          name: sample.name,
          nameAr: sample.nameAr,
          description: sample.description,
          categoryId: sample.categoryId,
          status: 'published',
          currentVersion: 1,
          contentHash,
          artworkPath: relative,
          thumbnailPath: relative,
          publishedAt: new Date(),
          sortOrder: 0,
        }),
      );
      await versions.save(
        versions.create({
          skinId: skin.id,
          version: 1,
          contentHash,
          artworkPath: relative,
          thumbnailPath: relative,
          metadata: { seeded: true },
        }),
      );
      // eslint-disable-next-line no-console
      console.log(`Seeded skin ${sample.slug}`);
    }
  }

  let config = await configs.findOne({ where: { key: 'default' } });
  if (!config) {
    config = await configs.save(
      configs.create({
        key: 'default',
        killSwitchApply: false,
        killSwitchRestore: false,
        minAppVersion: '0.1.0',
        minIosVersion: '16.0',
        maintenanceMode: false,
        message: null,
        extras: null,
      }),
    );
    // eslint-disable-next-line no-console
    console.log('Seeded remote config defaults');
  }

  const ruleCount = await rules.count();
  if (ruleCount === 0) {
    await rules.save(
      rules.create({
        minIosVersion: '16.0',
        maxIosVersion: null,
        supportedModels: ['iPhone14,2', 'iPhone14,3', 'iPhone15,2', 'iPhone15,3'],
        isSupported: true,
        notes: 'Baseline supported matrix (seed)',
      }),
    );
  }

  const av = await appVersions.findOne({ where: { version: '1.0.0' } });
  if (!av) {
    await appVersions.save(
      appVersions.create({
        version: '1.0.0',
        isMandatory: false,
        isActive: true,
        downloadUrl: null,
        releaseNotes: 'Initial seed version',
      }),
    );
  }

  const bootstrap = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? '')
    .trim()
    .toLowerCase();
  if (bootstrap) {
    let admin = await users.findOne({ where: { email: bootstrap } });
    if (!admin) {
      admin = await users.save(
        users.create({
          email: bootstrap,
          role: 'admin',
          isActive: true,
        }),
      );
      // eslint-disable-next-line no-console
      console.log(`Bootstrapped admin user ${bootstrap}`);
    } else if (admin.role !== 'admin') {
      admin.role = 'admin';
      await users.save(admin);
      // eslint-disable-next-line no-console
      console.log(`Promoted ${bootstrap} to admin`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('ADMIN_BOOTSTRAP_EMAIL not set — skipped admin user');
  }

  await ds.destroy();
  // eslint-disable-next-line no-console
  console.log('Seed complete');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
