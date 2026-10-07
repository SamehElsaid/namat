import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/logging/logger';
import { LocalFileStorage } from './storage/local-file.storage';
import { AuthService } from './modules/auth/auth.service';
import { authorizeLargeUpload } from './common/security/upload-preflight';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('app.nodeEnv') ?? 'development';
  const jwtSecret = config.get<string>('app.jwtSecret') ?? '';
  if (
    nodeEnv === 'production' &&
    (jwtSecret.length < 32 || jwtSecret === 'dev-only-change-me')
  ) {
    throw new Error(
      'JWT_SECRET must be set to a production secret of at least 32 characters',
    );
  }
  // Nginx reaches the API through the Docker port proxy, so the socket peer is
  // a private bridge address. Trust only loopback/private hops so req.ip (and
  // the per-IP throttler) uses the real client from X-Forwarded-For.
  app.set('trust proxy', config.get<string>('app.trustProxy'));
  const prefix = config.get<string>('app.apiPrefix') ?? 'api/v1';
  const origins = config.get<string[]>('app.corsOrigins') ?? [
    'https://namat.shara.sa',
    'https://admin.namat.shara.sa',
  ];

  app.setGlobalPrefix(prefix, {
    exclude: ['health', 'ready'],
  });

  // Health at root AND under prefix for convenience
  // Controllers use @Get('health') without being excluded from prefix unless listed.
  // We register health without prefix via exclude — controllers are still under prefix
  // unless we mount them outside. Fix: exclude works for routes matching path.
  // Nest exclude strips prefix for those paths when controller path matches.

  app.enableCors({
    origin: origins,
    credentials: true,
  });
  app.use(
    `/${prefix}/device-enrollment/callback`,
    express.raw({ type: () => true, limit: '2mb' }),
  );
  const ipaLimit = config.get<number>('app.signedIpaMaxBytes') ?? 200 * 1024 * 1024;
  const rawIpa = express.raw({ type: () => true, limit: ipaLimit });
  const auth = app.get(AuthService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') {
      next();
      return;
    }
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const artifact = /\/device-enrollment\/jobs\/[^/]+\/artifact$/.test(path);
    const stable = path.endsWith('/admin/device-enrollments/stable-payload');
    if (artifact || stable) {
      authorizeLargeUpload(artifact ? 'signing-artifact' : 'stable-payload', req.headers, {
        signingCallbackToken: config.get<string>('app.signingCallbackToken') ?? '',
        adminApiToken: config.get<string>('app.adminApiToken') ?? '',
        validateAccessToken: (token) => auth.validateAccessToken(token),
      })
        .then((ok) => {
          if (!ok) {
            res.status(401).json({ statusCode: 401, message: 'unauthorized' });
            return;
          }
          rawIpa(req, res, next);
        })
        .catch(next);
      return;
    }
    next();
  });
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '256kb', extended: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const storage = app.get(LocalFileStorage);
  await storage.ensureReady();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const url = (req.originalUrl || req.url || '').split('?')[0].toLowerCase();
    if (url === '/uploads/ipa' || url.startsWith('/uploads/ipa/')) {
      res.status(404).json({ statusCode: 404, message: 'Not found' });
      return;
    }
    next();
  });
  app.useStaticAssets(storage.getRoot(), { prefix: '/uploads/' });

  const port = config.get<number>('app.port') ?? 3302;
  await app.listen(port);

  const log = new StructuredLogger('Bootstrap');
  log.info('NAMAT API listening', {
    port,
    prefix,
    corsOrigins: origins,
    nearpayMock: !(config.get<string>('app.nearpayApiKey') ?? ''),
  });
}

bootstrap();
