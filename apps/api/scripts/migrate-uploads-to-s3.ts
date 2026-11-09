import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3Storage, STORED_OBJECT_NAME } from '../src/modules/storage/object-storage.js';

/**
 * One-off copy of an existing UPLOAD_DIR (the old Railway volume) into the
 * bucket, so URLs already stored in Postgres keep resolving after switching
 * STORAGE_DRIVER to s3. Safe to re-run: objects already in the bucket are
 * skipped. Run it inside the api service, where the volume is mounted:
 *
 *   railway ssh --service api -- pnpm storage:migrate
 *
 * with the S3_* variables set on the service. It does not delete local files.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} must be set`);
  return value;
}

async function main() {
  const directory = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');
  const bucket = required('S3_BUCKET');
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? 'auto';
  const credentials = {
    accessKeyId: required('S3_ACCESS_KEY_ID'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
  };
  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint } : {}),
    credentials,
    forcePathStyle: Boolean(endpoint),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const storage = new S3Storage(
    { ...(endpoint ? { endpoint } : {}), region, bucket, ...credentials },
    client,
  );

  const names = (await readdir(directory)).filter((name) => STORED_OBJECT_NAME.test(name));
  let copied = 0;
  let skipped = 0;
  for (const name of names) {
    const exists = await client
      .send(new HeadObjectCommand({ Bucket: bucket, Key: name }))
      .then(() => true)
      .catch((error: { name?: string }) => {
        if (error.name === 'NotFound') return false;
        throw error;
      });
    if (exists) {
      skipped += 1;
      continue;
    }
    const contentType = CONTENT_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream';
    await storage.put(name, await readFile(resolve(directory, name)), contentType);
    copied += 1;
  }
  console.log(
    `Copied ${String(copied)}, skipped ${String(skipped)} already in ${bucket}, from ${directory}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
