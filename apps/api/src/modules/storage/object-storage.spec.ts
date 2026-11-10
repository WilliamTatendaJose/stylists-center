import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDiskStorage, S3Storage, STORED_OBJECT_NAME } from './object-storage';

const NAME = '3a6f010d-1d13-4a06-a747-0ae1b4be35d0.jpg';

describe('STORED_OBJECT_NAME', () => {
  it('accepts the names the upload services generate', () => {
    for (const ext of ['jpg', 'png', 'webp', 'pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx']) {
      expect(STORED_OBJECT_NAME.test(`3a6f010d-1d13-4a06-a747-0ae1b4be35d0.${ext}`)).toBe(true);
    }
  });

  it('refuses anything that could escape the upload directory or bucket prefix', () => {
    for (const name of ['../etc/passwd', `..%2F${NAME}`, `a/${NAME}`, 'x.jpg', `${NAME}.html`]) {
      expect(STORED_OBJECT_NAME.test(name)).toBe(false);
    }
  });
});

describe('LocalDiskStorage', () => {
  let directory: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sc-storage-'));
    storage = new LocalDiskStorage(join(directory, 'nested'));
    await storage.init();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes, locates, and deletes a file', async () => {
    await storage.put(NAME, Buffer.from('bytes'));
    const location = await storage.locate(NAME);
    expect(location).toEqual({ kind: 'file', path: join(directory, 'nested', NAME) });
    expect(await readFile(join(directory, 'nested', NAME), 'utf8')).toBe('bytes');

    await storage.delete(NAME);
    expect(await storage.locate(NAME)).toBeNull();
  });

  it('treats deleting a missing file as success', async () => {
    await expect(storage.delete(NAME)).resolves.toBeUndefined();
  });

  it('never overwrites an existing file', async () => {
    await storage.put(NAME, Buffer.from('first'));
    await expect(storage.put(NAME, Buffer.from('second'))).rejects.toThrow();
  });
});

describe('S3Storage', () => {
  const options = {
    endpoint: 'https://account.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'sc-uploads',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  };

  it('uploads with the content type and deletes by key', async () => {
    const sent: unknown[] = [];
    const client = { send: (command: unknown) => (sent.push(command), Promise.resolve({})) };
    const storage = new S3Storage(options, client as unknown as S3Client);

    await storage.put(NAME, Buffer.from('bytes'), 'image/jpeg');
    await storage.delete(NAME);

    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect((sent[0] as PutObjectCommand).input).toMatchObject({
      Bucket: 'sc-uploads',
      Key: NAME,
      ContentType: 'image/jpeg',
    });
    expect(sent[1]).toBeInstanceOf(DeleteObjectCommand);
    expect((sent[1] as DeleteObjectCommand).input).toEqual({ Bucket: 'sc-uploads', Key: NAME });
  });

  it('locates an object as a short-lived presigned link on the private bucket', async () => {
    // Real client, fake credentials: presigning is offline, so no network is used.
    const storage = new S3Storage(options);
    const location = await storage.locate(NAME);

    expect(location?.kind).toBe('redirect');
    if (location?.kind !== 'redirect') return;
    const url = new URL(location.url);
    expect(url.origin).toBe('https://account.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(`/sc-uploads/${NAME}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(location.expiresInSeconds).toBe(3600);
  });
});
