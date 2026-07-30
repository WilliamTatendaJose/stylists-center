import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // Health checks stay unprefixed — infra probes (load balancer, container
  // orchestrator) expect a fixed /healthz path, not one that moves with the
  // API version.
  app.setGlobalPrefix('v1', { exclude: ['healthz', 'readyz'] });

  app.use(helmet());
  app.enableCors();

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
