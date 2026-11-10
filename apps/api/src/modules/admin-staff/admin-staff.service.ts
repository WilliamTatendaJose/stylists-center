import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AdminStaffRowDto, CreateStaffInput, UpdateStaffInput } from '@sc/shared';
import { Prisma, type AdminRole } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../admin-auth/password';
import { AdminMfaService } from '../admin-auth/admin-mfa.service';

/**
 * Accounts carry a role (owner, finance, support; see admin-auth/admin-roles.ts)
 * and at least one enabled owner must always remain. Revocation uses `disabled`, while deletion uses
 * `deletedAt`, so AuditLog.adminActor stays resolvable for past actions.
 * Bumping tokenVersion on disable/delete invalidates live sessions immediately
 * (same lever User.tokenVersion uses for a ban).
 */
@Injectable()
export class AdminStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfa: AdminMfaService,
  ) {}

  /**
   * Clears a colleague's 2FA after a lost or replaced phone, and signs them
   * out everywhere. Not for your own account: turning off your own 2FA needs
   * your password and a current code (POST /admin/auth/mfa/disable).
   */
  async resetMfa(id: string, actingAdminId: string): Promise<AdminStaffRowDto> {
    if (id === actingAdminId) {
      throw new ForbiddenException('Turn off your own two-factor sign-in from your account page');
    }
    const target = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    if (target.deletedAt) throw new BadRequestException('Deleted staff accounts cannot be edited');
    await this.mfa.resetFor(id);
    return toRow(await this.prisma.adminUser.findUniqueOrThrow({ where: { id } }));
  }

  async list(includeDeleted = false): Promise<AdminStaffRowDto[]> {
    const where = includeDeleted ? {} : { deletedAt: null };
    const admins = await this.prisma.adminUser.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    return admins.map(toRow);
  }

  async create(input: CreateStaffInput): Promise<AdminStaffRowDto> {
    const passwordHash = await hashPassword(input.password);
    try {
      const admin = await this.prisma.adminUser.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          passwordHash,
        },
      });
      return toRow(admin);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }
  }

  async update(
    id: string,
    input: UpdateStaffInput,
    actingAdminId: string,
  ): Promise<AdminStaffRowDto> {
    const target = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    if (target.deletedAt) {
      throw new BadRequestException('Deleted staff accounts cannot be edited');
    }

    if (input.role !== undefined && input.role !== target.role) {
      if (id === actingAdminId) {
        throw new ForbiddenException('You cannot change your own role');
      }
      if (target.role === 'owner') await this.assertAnotherEnabledOwner(id);
    }

    if (input.disabled === true) {
      if (id === actingAdminId) {
        throw new ForbiddenException('You cannot disable your own account');
      }
      if (target.role === 'owner' && !target.disabled) await this.assertAnotherEnabledOwner(id);
      const enabledCount = await this.prisma.adminUser.count({ where: { disabled: false } });
      if (!target.disabled && enabledCount <= 1) {
        throw new BadRequestException('At least one staff account must stay enabled');
      }
    }

    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    const admin = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        // Disabling, rotating the password, or changing role all need to
        // kill any session already issued under the old state.
        ...(input.disabled === true ||
        passwordHash !== undefined ||
        (input.role !== undefined && input.role !== target.role)
          ? { tokenVersion: { increment: 1 } }
          : {}),
      },
    });
    return toRow(admin);
  }

  /** Someone must always be able to manage staff, so never leave zero usable owners. */
  private async assertAnotherEnabledOwner(exceptId: string): Promise<void> {
    const others = await this.prisma.adminUser.count({
      where: { role: 'owner', disabled: false, deletedAt: null, id: { not: exceptId } },
    });
    if (others === 0) {
      throw new BadRequestException('At least one owner account must stay enabled');
    }
  }

  async remove(id: string, actingAdminId: string): Promise<AdminStaffRowDto> {
    if (id === actingAdminId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const target = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    if (target.deletedAt) return toRow(target);

    if (!target.disabled) {
      if (target.role === 'owner') await this.assertAnotherEnabledOwner(id);
      const enabledCount = await this.prisma.adminUser.count({ where: { disabled: false } });
      if (enabledCount <= 1) {
        throw new BadRequestException('At least one staff account must stay enabled');
      }
    }

    const admin = await this.prisma.$transaction(async (tx) => {
      await tx.adminRefreshToken.updateMany({
        where: { adminUserId: id },
        data: { revoked: true },
      });
      return tx.adminUser.update({
        where: { id },
        data: {
          disabled: true,
          deletedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
    });

    return toRow(admin);
  }
}

function toRow(admin: {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  disabled: boolean;
  totpEnabledAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}): AdminStaffRowDto {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    disabled: admin.disabled,
    mfaEnabled: admin.totpEnabledAt !== null,
    createdAt: admin.createdAt.toISOString(),
    deletedAt: admin.deletedAt?.toISOString() ?? null,
  };
}
