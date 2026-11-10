import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Every object this API stores is named `<uuid>.<ext>` and addressed by the
 * client as `/uploads/<name>`. Anything else is refused before it can reach a
 * filesystem path or a bucket key, which is what rules out traversal.
 */
export const STORED_OBJECT_NAME = /^[a-f0-9-]{36}\.(?:jpe?g|png|webp|pdf|txt|csv|docx?|xlsx?)$/i;

/**
 * Thumbnails live next to their original as `<uuid>.thumb.jpg`. They are never
 * addressed by clients directly: `GET /uploads/<name>?variant=thumb` validates
 * `<name>` against STORED_OBJECT_NAME and derives this key with
 * `thumbnailName`, so the public route still accepts only the original names.
 */
export const THUMBNAIL_OBJECT_NAME = /^[a-f0-9-]{36}\.thumb\.jpg$/i;

/** Storage key of the thumbnail for an original object name. */
export function thumbnailName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '')}.thumb.jpg`;
}

export const UPLOAD_URL_PREFIX = '/uploads/';

/** How long a presigned download link stays valid. */
export const DOWNLOAD_LINK_SECONDS = 60 * 60;

export type StoredObjectLocation =
  { kind: 'file'; path: string } | { kind: 'redirect'; url: string; expiresInSeconds: number };

export interface ObjectStorage {
  /** Writes an object. Names are random UUIDs, so callers never reuse one. */
  put(name: string, body: Buffer, contentType: string): Promise<void>;
  /** Removes an object; succeeds silently when it is already gone. */
  delete(name: string): Promise<void>;
  /** Whether an object exists. Used to fall back from a thumbnail to the original. */
  exists(name: string): Promise<boolean>;
  /** Where GET /uploads/<name> should send the client, or null if there is nothing there. */
  locate(name: string): Promise<StoredObjectLocation | null>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** Local disk — development, tests, and a single-instance host with a volume. */
export class LocalDiskStorage implements ObjectStorage {
  constructor(private readonly directory: string) {}

  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  async put(name: string, body: Buffer): Promise<void> {
    await writeFile(resolve(this.directory, name), body, { flag: 'wx' });
  }

  async delete(name: string): Promise<void> {
    try {
      await unlink(resolve(this.directory, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async exists(name: string): Promise<boolean> {
    return (await this.locate(name)) !== null;
  }

  async locate(name: string): Promise<StoredObjectLocation | null> {
    const path = resolve(this.directory, name);
    try {
      const info = await stat(path);
      return info.isFile() ? { kind: 'file', path } : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

export interface S3StorageOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Any S3-compatible bucket: Cloudflare R2, AWS S3, or a Railway bucket. The
 * bucket stays private — downloads go through short-lived presigned links, so
 * ID documents and chat files are never publicly listable or permanently
 * linkable, and the bytes never pass through (or get billed as egress by) this
 * server.
 */
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(
    private readonly options: S3StorageOptions,
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        region: options.region,
        ...(options.endpoint ? { endpoint: options.endpoint } : {}),
        credentials: {
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
        },
        // R2 and most non-AWS providers only serve path-style addressing reliably.
        forcePathStyle: Boolean(options.endpoint),
        // Newer SDK versions add CRC checksums to every request by default,
        // which not every S3-compatible provider accepts. Only send them when
        // an operation requires one.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
  }

  async put(name: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: name,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
  }

  async delete(name: string): Promise<void> {
    // S3 DeleteObject already succeeds for a missing key.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: name }));
  }

  async exists(name: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: name }));
      return true;
    } catch (error) {
      const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (failure.name === 'NotFound' || failure.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  async locate(name: string): Promise<StoredObjectLocation | null> {
    // Presigning is local computation, not a network call. A missing object
    // surfaces as a 404 from the bucket when the client follows the link,
    // which avoids paying a HEAD request on every image view.
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: name }),
      { expiresIn: DOWNLOAD_LINK_SECONDS },
    );
    return { kind: 'redirect', url, expiresInSeconds: DOWNLOAD_LINK_SECONDS };
  }
}
