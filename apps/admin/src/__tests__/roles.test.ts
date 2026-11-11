import { describe, expect, it } from 'vitest';
import { canOpen } from '../roles';

// Mirrors the API's rules (apps/api/src/modules/admin-auth/admin-roles.spec.ts):
// the console must never show a page whose API calls the role can't make.
describe('canOpen', () => {
  it('owners can open everything', () => {
    for (const path of ['/staff', '/audit-log', '/payments', '/bans', '/account', '/anything']) {
      expect(canOpen('owner', path)).toBe(true);
    }
  });

  it('finance sees money pages, not trust or staff', () => {
    for (const path of ['/overview', '/payments', '/cash-outs', '/fees', '/providers']) {
      expect(canOpen('finance', path)).toBe(true);
    }
    for (const path of [
      '/bans',
      '/reports',
      '/verifications',
      '/staff',
      '/audit-log',
      '/catalog',
    ]) {
      expect(canOpen('finance', path)).toBe(false);
    }
  });

  it('support sees trust pages, not money or staff', () => {
    for (const path of [
      '/reports',
      '/reports/abc',
      '/bans',
      '/verifications',
      '/users',
      '/catalog',
    ]) {
      expect(canOpen('support', path)).toBe(true);
    }
    for (const path of ['/payments', '/cash-outs', '/fees', '/staff', '/audit-log']) {
      expect(canOpen('support', path)).toBe(false);
    }
  });

  it('every role can reach its own account page', () => {
    for (const role of ['owner', 'finance', 'support'] as const) {
      expect(canOpen(role, '/account')).toBe(true);
    }
  });
});
