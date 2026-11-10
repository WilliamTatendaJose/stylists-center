import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminIdentity } from '@sc/shared';
import { useAuthStore } from '../state/authStore';

const admin: AdminIdentity = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'owner',
  mfaEnabled: false,
  mfaSetupRequired: false,
};

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('updateAdmin merges into the signed-in admin', () => {
    useAuthStore.getState().setSession('token', admin);
    useAuthStore.getState().updateAdmin({ mfaEnabled: true });
    expect(useAuthStore.getState().admin).toEqual({ ...admin, mfaEnabled: true });
  });

  it('markMfaSetupRequired flags the admin so the layout redirects to /account', () => {
    useAuthStore.getState().setSession('token', admin);
    useAuthStore.getState().markMfaSetupRequired();
    expect(useAuthStore.getState().admin?.mfaSetupRequired).toBe(true);
  });

  it('does nothing when signed out', () => {
    useAuthStore.getState().updateAdmin({ mfaEnabled: true });
    useAuthStore.getState().markMfaSetupRequired();
    expect(useAuthStore.getState().admin).toBeNull();
  });
});
