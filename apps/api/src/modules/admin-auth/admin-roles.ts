import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '../../generated/prisma';

export const ADMIN_ROLES = 'admin:roles';

/**
 * Restricts an admin route (or a whole controller) to the listed roles.
 * Owners always pass. A route without this decorator is open to every
 * signed-in admin, so only use that for areas every role needs (overview,
 * lookup, your own account). admin-roles.spec.ts checks every admin route is
 * either decorated or on its explicit list of shared routes.
 *
 *   finance: payments, payouts, cash-outs, subscription extensions
 *   support: reports, bans, reviews, users, verifications, provider edits, catalog
 *   owner:   all of the above, plus staff and the audit log
 */
export const AdminRoles = (...roles: Exclude<AdminRole, 'owner'>[]) =>
  SetMetadata(ADMIN_ROLES, roles);

/** Owner-only: decorate with no roles listed. */
export const OwnerOnly = () => SetMetadata(ADMIN_ROLES, []);

export function roleAllowed(role: AdminRole, allowed: readonly AdminRole[] | undefined): boolean {
  if (allowed === undefined) return true;
  return role === 'owner' || allowed.includes(role);
}
