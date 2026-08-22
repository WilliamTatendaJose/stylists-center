import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { RequestMethod } from '@nestjs/common';
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
  // API version. The two .well-known files are unprefixed because the
  // Apple/Google spec requires them at the domain root, full stop — they
  // aren't found if they move. provider-share/:id and invite/:code ride
  // along so a shared link's path is identical whether the OS opens the app
  // directly or a browser falls through to this server (see
  // app-links.controller.ts).
  app.setGlobalPrefix('v1', {
    exclude: [
      'healthz',
      'readyz',
      '.well-known/apple-app-site-association',
      '.well-known/assetlinks.json',
      { path: 'provider-share/:id', method: RequestMethod.GET },
      { path: 'invite/:code', method: RequestMethod.GET },
    ],
  });

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
  console.log(`Style Center API listening on :${String(port)}`);
}

void bootstrap();
