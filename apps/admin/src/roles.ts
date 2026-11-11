import type { AdminRoleName } from '@sc/shared';

/**
 * The console's view of who may open which page. This only hides navigation:
 * the API enforces the real rules (apps/api/src/modules/admin-auth/admin-roles.ts),
 * and admin-roles.spec.ts there pins them.
 */
export const ROLE_LABELS: Record<AdminRoleName, string> = {
  owner: 'Owner',
  finance: 'Finance',
  support: 'Support',
};

export const ROLE_DESCRIPTIONS: Record<AdminRoleName, string> = {
  owner: 'Everything, including staff accounts and the audit log',
  finance: 'Payments, payouts, cash-outs and fee balances',
  support: 'Reports, bans, reviews, users, verifications, providers and catalog',
};

/** Pages each non-owner role can open. Owners can open every page. */
const PAGES: Record<Exclude<AdminRoleName, 'owner'>, string[]> = {
  finance: [
    '/overview',
    '/lookup',
    '/providers',
    '/fees',
    '/payments',
    '/cash-outs',
    // Read-only for finance and support; only owners can change them.
    '/settings',
    '/content',
    '/account',
  ],
  support: [
    '/overview',
    '/lookup',
    '/reports',
    '/bans',
    '/reviews',
    '/providers',
    '/users',
    '/verifications',
    '/catalog',
    '/settings',
    '/content',
    '/account',
  ],
};

export function canOpen(role: AdminRoleName, path: string): boolean {
  if (role === 'owner') return true;
  const top = `/${path.split('/').find(Boolean) ?? ''}`;
  return PAGES[role].includes(top);
}
