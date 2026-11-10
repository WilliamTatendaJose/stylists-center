import { Controller, Get, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  OBJECT_STORAGE,
  STORED_OBJECT_NAME,
  thumbnailName,
  type ObjectStorage,
  type StoredObjectLocation,
} from './object-storage';

/**
 * Serves `/uploads/<name>` — the URL shape already stored in Postgres and
 * accepted by @sc/shared's imageUrlSchema — from whichever backend is
 * configured. With a bucket it answers with a redirect to a short-lived
 * presigned link, so clients (which resolve these paths against the API
 * origin) work unchanged.
 */
@Controller('uploads')
export class UploadsController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  @Get(':name')
  async serve(
    @Param('name') name: string,
    @Res() response: Response,
    @Query('variant') variant?: string,
  ): Promise<void> {
    if (!STORED_OBJECT_NAME.test(name)) throw new NotFoundException();
    const location =
      variant === 'thumb' ? await this.locateThumbnail(name) : await this.storage.locate(name);
    if (!location) throw new NotFoundException();

    // The admin console loads these from a different origin.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (location.kind === 'redirect') {
      // Cache the redirect for less time than the link lives, so a cached
      // redirect never points at an expired signature.
      const maxAge = Math.max(0, location.expiresInSeconds - 300);
      response.setHeader('Cache-Control', `private, max-age=${String(maxAge)}`);
      response.redirect(302, location.url);
      return;
    }
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.sendFile(location.path);
  }

  /**
   * `?variant=thumb` serves the small derivative when it exists. Uploads from
   * before thumbnails were introduced (or whose thumbnail failed to generate)
   * have none, so they fall back to the original rather than 404. Any other
   * `variant` value is ignored and serves the original.
   */
  private async locateThumbnail(name: string): Promise<StoredObjectLocation | null> {
    const thumbnail = thumbnailName(name);
    if (await this.storage.exists(thumbnail)) {
      const location = await this.storage.locate(thumbnail);
      if (location) return location;
    }
    return this.storage.locate(name);
  }
}
