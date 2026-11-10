import type { PrismaClient } from '../../generated/prisma';
import { hashPassword } from './password';

/** Long enough that a bootstrap or break-glass password can't be guessed online. */
export const MIN_RECOVERY_PASSWORD_LENGTH = 12;

type AdminClient = Pick<PrismaClient, 'adminUser' | 'adminRefreshToken' | '$transaction'>;

export type BootstrapOutcome = 'skipped' | 'created' | 'restored';

/**
 * Creates the first admin account when no usable one exists — the only way
 * into a fresh database without shell access, since staff have no self-serve
 * signup. "Usable" means enabled and not deleted: a database whose every
 * admin was disabled or deleted is just as locked out as an empty one, so the
 * named account is (re)created or restored in that case too.
 *
 * Never touches anything once a usable admin exists, so leaving the variables
 * set can't overwrite a password someone has since changed.
 */
export async function bootstrapFirstAdmin(
  prisma: AdminClient,
  email: string,
  password: string,
): Promise<BootstrapOutcome> {
  const usable = await prisma.adminUser.count({ where: { disabled: false, deletedAt: null } });
  if (usable > 0) return 'skipped';

  const passwordHash = await hashPassword(password);
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) {
    await prisma.adminUser.create({ data: { email, passwordHash, displayName: 'Admin' } });
    return 'created';
  }
  await prisma.adminUser.update({
    where: { email },
    data: { passwordHash, disabled: false, deletedAt: null, tokenVersion: { increment: 1 } },
  });
  return 'restored';
}

export type ResetOutcome = 'reset' | 'created';

/**
 * Break-glass password reset for one admin account: sets the new password,
 * re-enables the account, and signs out every existing session for it (bumped
 * tokenVersion kills access tokens; revoked refresh tokens kill renewals).
 * Day-to-day resets belong in the admin console's Staff page instead.
 */
export async function resetAdminPassword(
  prisma: AdminClient,
  email: string,
  password: string,
  options: { create?: boolean; clearMfa?: boolean } = {},
): Promise<ResetOutcome> {
  if (password.length < MIN_RECOVERY_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${String(MIN_RECOVERY_PASSWORD_LENGTH)} characters.`,
    );
  }
  const passwordHash = await hashPassword(password);
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) {
    if (!options.create) {
      throw new Error(`No admin account for ${email}. Pass --create to make one.`);
    }
    await prisma.adminUser.create({ data: { email, passwordHash, displayName: 'Admin' } });
    return 'created';
  }
  await prisma.$transaction([
    prisma.adminRefreshToken.updateMany({
      where: { adminUserId: existing.id, revoked: false },
      data: { revoked: true },
    }),
    prisma.adminUser.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        disabled: false,
        deletedAt: null,
        tokenVersion: { increment: 1 },
        // A lost phone on the only admin account: nobody is left to reset it
        // from the Staff page, so the break-glass script can clear it too.
        ...(options.clearMfa
          ? {
              totpSecret: null,
              totpPendingSecret: null,
              totpEnabledAt: null,
              totpLastUsedStep: null,
              recoveryCodeHashes: [],
            }
          : {}),
      },
    }),
  ]);
  return 'reset';
}
