import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AdminStaffRowDto, CreateStaffInput, UpdateStaffInput } from '@sc/shared';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../admin-auth/password';

/**
 * Every admin console feature shares one flat access level — there's no role
 * model here, just accounts. Revocation uses `disabled`, while deletion uses
 * `deletedAt`, so AuditLog.adminActor stays resolvable for past actions.
 * Bumping tokenVersion on disable/delete invalidates live sessions immediately
 * (same lever User.tokenVersion uses for a ban).
 */
@Injectable()
export class AdminStaffService {
  constructor(private readonly prisma: PrismaService) {}

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
        data: { email: input.email, displayName: input.displayName, passwordHash },
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

    if (input.disabled === true) {
      if (id === actingAdminId) {
        throw new ForbiddenException('You cannot disable your own account');
      }
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
        ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        // Disabling or rotating the password both need to kill any session
        // already issued under the old state.
        ...(input.disabled === true || passwordHash !== undefined
          ? { tokenVersion: { increment: 1 } }
          : {}),
      },
    });
    return toRow(admin);
  }

  async remove(id: string, actingAdminId: string): Promise<AdminStaffRowDto> {
    if (id === actingAdminId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const target = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    if (target.deletedAt) return toRow(target);

    if (!target.disabled) {
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
  disabled: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}): AdminStaffRowDto {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    disabled: admin.disabled,
    createdAt: admin.createdAt.toISOString(),
    deletedAt: admin.deletedAt?.toISOString() ?? null,
  };
}
