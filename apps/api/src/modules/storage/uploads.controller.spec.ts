import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage, StoredObjectLocation } from './object-storage';
import { UploadsController } from './uploads.controller';

const NAME = '3a6f010d-1d13-4a06-a747-0ae1b4be35d0.png';

function harness(location: StoredObjectLocation | null) {
  const locate = vi.fn(() => Promise.resolve(location));
  const storage: ObjectStorage = { put: vi.fn(), delete: vi.fn(), locate };
  const response = {
    setHeader: vi.fn(),
    redirect: vi.fn(),
    sendFile: vi.fn(),
  };
  return {
    locate,
    response,
    controller: new UploadsController(storage),
    res: response as unknown as Response,
  };
}

describe('UploadsController', () => {
  it('redirects to the presigned link and caches the redirect for less than its lifetime', async () => {
    const { controller, response, res } = harness({
      kind: 'redirect',
      url: 'https://bucket.example/signed',
      expiresInSeconds: 3600,
    });
    await controller.serve(NAME, res);

    expect(response.redirect).toHaveBeenCalledWith(302, 'https://bucket.example/signed');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=3300');
    expect(response.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin');
  });

  it('streams a local file with the long-lived cache header', async () => {
    const { controller, response, res } = harness({ kind: 'file', path: `/data/${NAME}` });
    await controller.serve(NAME, res);

    expect(response.sendFile).toHaveBeenCalledWith(`/data/${NAME}`);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
  });

  it('404s on a missing object', async () => {
    const { controller, res } = harness(null);
    await expect(controller.serve(NAME, res)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s on a name it could never have generated, without touching storage', async () => {
    const { controller, locate, res } = harness({ kind: 'file', path: '/etc/passwd' });
    await expect(controller.serve('..%2Fetc%2Fpasswd', res)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(locate).not.toHaveBeenCalled();
  });
});
