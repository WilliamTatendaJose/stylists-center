import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { uploadDirectory } from './modules/provider/image-storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // Health checks stay unprefixed — infra probes (load balancer, container
  // orchestrator) expect a fixed /healthz path, not one that moves with the
  // API version.
  app.setGlobalPrefix('v1', { exclude: ['healthz', 'readyz'] });

  app.use(helmet());
  app.useStaticAssets(uploadDirectory(config), {
    prefix: '/uploads/',
    setHeaders: (response: Response) => {
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });
  // Only the admin console is a browser client — the mobile app's requests
  // aren't subject to CORS at all. `credentials: true` is what lets the
  // browser attach the admin refresh cookie, which is why the origin can't
  // be left as the wide-open default: credentials + `*` is disallowed by the
  // CORS spec anyway, but even if it weren't, a cookie-bearing endpoint has
  // no business accepting requests from an origin that isn't the console.
  app.enableCors({
    origin: config.get('ADMIN_WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  // Every endpoint's request validation runs through the same zod schemas
  // @sc/shared exports for the mobile client — this is what makes the radius
  // ladder, budget range, and attempt cap incapable of drifting between the
  // two surfaces (plan §6).
  app.useGlobalPipes(new ZodValidationPipe());

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  console.log(`Stylists Center API listening on :${String(port)}`);
}

void bootstrap();
