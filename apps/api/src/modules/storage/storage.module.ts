import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import type { Env } from '../../config/env';
import { LocalDiskStorage, OBJECT_STORAGE, S3Storage, type ObjectStorage } from './object-storage';
import { UploadsController } from './uploads.controller';

export async function createObjectStorage(
  config: ConfigService<Env, true>,
): Promise<ObjectStorage> {
  if (config.get('STORAGE_DRIVER', { infer: true }) === 's3') {
    // env.ts guarantees these are present whenever the driver is s3.
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    return new S3Storage({
      ...(endpoint ? { endpoint } : {}),
      region: config.get('S3_REGION', { infer: true }),
      bucket: config.get('S3_BUCKET', { infer: true }),
      accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
      secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
    });
  }
  const local = new LocalDiskStorage(
    resolve(process.cwd(), config.get('UPLOAD_DIR', { infer: true })),
  );
  await local.init();
  return local;
}

/** One storage backend for every upload (provider photos, ID checks, chat files). */
@Global()
@Module({
  controllers: [UploadsController],
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: createObjectStorage,
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
