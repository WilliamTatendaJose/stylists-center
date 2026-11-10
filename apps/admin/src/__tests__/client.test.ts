import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminIdentity } from '@sc/shared';
import { apiFetch, ApiError } from '../api/client';
import { useAuthStore } from '../state/authStore';

const admin: AdminIdentity = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'finance',
  mfaEnabled: false,
  mfaSetupRequired: false,
};

const BOM = '\uFEFF';

function respond(status: number, body: unknown, type = 'application/json') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { 'Content-Type': type } });
}

describe('apiFetch', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.getState().setSession('old-token', admin);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('sends the access token and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { ok: true }));
    await expect(apiFetch('/v1/admin/overview')).resolves.toEqual({ ok: true });
    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer old-token');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(401, { message: 'expired' }))
      .mockResolvedValueOnce(respond(200, { accessToken: 'new-token' }))
      .mockResolvedValueOnce(respond(200, { ok: true }));
    await expect(apiFetch('/v1/admin/overview')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(expect.stringContaining('/v1/admin/auth/refresh'));
    const retry = fetchMock.mock.calls[2]?.[1];
    expect((retry?.headers as Record<string, string>).Authorization).toBe('Bearer new-token');
    expect(useAuthStore.getState().accessToken).toBe('new-token');
  });

  it('turns an error body into an ApiError with message and code', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(403, { code: 'ROLE_FORBIDDEN', message: "Your role doesn't have access" }),
    );
    const error = await apiFetch('/v1/admin/bans').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).code).toBe('ROLE_FORBIDDEN');
    expect((error as ApiError).message).toBe("Your role doesn't have access");
  });

  it('flags MFA_SETUP_REQUIRED on the signed-in admin', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(403, { code: 'MFA_SETUP_REQUIRED', message: 'Set up two-factor sign-in' }),
    );
    await apiFetch('/v1/admin/staff').catch(() => undefined);
    expect(useAuthStore.getState().admin?.mfaSetupRequired).toBe(true);
  });

  it('returns a Blob for downloads', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, `${BOM}a,b\r\n`, 'text/csv'));
    const file = await apiFetch<Blob>('/v1/admin/exports/payouts.csv', { blob: true });
    expect(file).toBeInstanceOf(Blob);
    // Check bytes: Blob.text() decodes and drops a leading BOM, but the saved
    // file keeps it, which is what Excel needs.
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
