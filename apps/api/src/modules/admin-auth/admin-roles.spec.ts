import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLES, roleAllowed } from './admin-roles';
import { AdminAuditController } from '../admin-audit/admin-audit.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminCatalogController } from '../admin-catalog/admin-catalog.controller';
import { AdminLookupController } from '../admin-lookup/admin-lookup.controller';
import { AdminOverviewController } from '../admin-overview/admin-overview.controller';
import { AdminPaymentsController } from '../admin-payments/admin-payments.controller';
import { AdminProvidersController } from '../admin-providers/admin-providers.controller';
import { AdminReviewsController } from '../admin-reviews/admin-reviews.controller';
import { AdminStaffController } from '../admin-staff/admin-staff.controller';
import { AdminTrustController } from '../admin-trust/admin-trust.controller';
import { AdminUsersController } from '../admin-users/admin-users.controller';
import { AdminVerificationsController } from '../admin-verifications/admin-verifications.controller';
import { AdminWalletController } from '../admin-wallet/admin-wallet.controller';

const CONTROLLERS = [
  AdminAuditController,
  AdminAuthController,
  AdminCatalogController,
  AdminLookupController,
  AdminOverviewController,
  AdminPaymentsController,
  AdminProvidersController,
  AdminReviewsController,
  AdminStaffController,
  AdminTrustController,
  AdminUsersController,
  AdminVerificationsController,
  AdminWalletController,
];

/** Every admin route that deliberately has no role restriction. Adding one is a decision: say so here. */
const OPEN_TO_EVERY_ROLE = new Set([
  // sign-in and your own account
  'POST admin/auth/login',
  'POST admin/auth/login/mfa',
  'POST admin/auth/refresh',
  'POST admin/auth/logout',
  'GET admin/auth/me',
  'POST admin/auth/mfa/setup',
  'POST admin/auth/mfa/enable',
  'POST admin/auth/mfa/recovery-codes',
  'POST admin/auth/mfa/disable',
  // read-only views every role needs
  'GET admin/overview',
  'GET admin/overview/trends',
  'GET admin/lookup',
  'GET admin/lookup/bookings/:id',
  'GET admin/lookup/orders/:id',
  'GET admin/catalog/categories',
  'GET admin/catalog/cities',
  'GET admin/providers',
  'GET admin/providers/:id',
  'GET admin/providers/subscription-summary',
]);

interface Route {
  key: string;
  allowed: string[] | undefined;
}

function routes(): Route[] {
  const out: Route[] = [];
  for (const controller of CONTROLLERS) {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const classRoles = Reflect.getMetadata(ADMIN_ROLES, controller) as string[] | undefined;
    const proto = controller.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (typeof handler !== 'function' || name === 'constructor') continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (path === undefined) continue;
      const method = String(RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number]);
      const full = [base, path].filter((p) => p && p !== '/').join('/');
      const methodRoles = Reflect.getMetadata(ADMIN_ROLES, handler) as string[] | undefined;
      out.push({ key: `${method} ${full}`, allowed: methodRoles ?? classRoles });
    }
  }
  return out;
}

const can = (role: 'owner' | 'finance' | 'support', key: string) => {
  const route = routes().find((r) => r.key === key);
  if (!route) throw new Error(`no such route: ${key}`);
  return roleAllowed(role, route.allowed as never);
};

describe('admin role coverage', () => {
  it('finds the admin routes', () => {
    expect(routes().length).toBeGreaterThan(40);
  });

  it('every route either declares its roles or is deliberately open', () => {
    const undecided = routes()
      .filter((r) => r.allowed === undefined && !OPEN_TO_EVERY_ROLE.has(r.key))
      .map((r) => r.key);
    expect(undecided).toEqual([]);
  });

  it('the open list has no stale entries', () => {
    const keys = new Set(routes().map((r) => r.key));
    expect([...OPEN_TO_EVERY_ROLE].filter((k) => !keys.has(k))).toEqual([]);
  });
});

describe('admin role matrix', () => {
  it('only owners manage staff and read the audit log', () => {
    for (const key of ['GET admin/staff', 'POST admin/staff', 'GET admin/audit-log']) {
      expect([can('owner', key), can('finance', key), can('support', key)]).toEqual([
        true,
        false,
        false,
      ]);
    }
  });

  it('finance moves money; support does not', () => {
    for (const key of [
      'POST admin/payments/providers/:providerId/payouts',
      'POST admin/wallet/cash-outs/:transactionId/settle',
      'POST admin/providers/:id/subscription/extend',
    ]) {
      expect([can('finance', key), can('support', key)]).toEqual([true, false]);
    }
  });

  it('support handles trust and users; finance does not', () => {
    for (const key of [
      'POST admin/bans',
      'PATCH admin/verifications/:id',
      'DELETE admin/reviews/:id',
      'PATCH admin/providers/:id',
      'DELETE admin/users/:id',
    ]) {
      expect([can('support', key), can('finance', key)]).toEqual([true, false]);
    }
  });
});
