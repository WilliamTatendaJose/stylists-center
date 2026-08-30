import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  deriveInitials,
  deriveTint,
  type AdminFirebaseStatus,
  type AdminUserListDto,
  type AdminUserRowDto,
  type CreateAdminUserInput,
  type UpdateAdminUserInput,
} from '@sc/shared';
import { Prisma, type User } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseIdentityService } from '../auth/firebase-identity.service';
import type {
  FirebaseAccountMatch,
  FirebaseAccountStatus,
} from '../auth/firebase-identity.service';
import { UserLifecycleService } from '../auth/user-lifecycle.service';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseIdentityService,
    private readonly lifecycle: UserLifecycleService,
  ) {}

  async list(input: {
    query?: string | undefined;
    limit: number;
    offset: number;
    includeDeleted: boolean;
  }): Promise<AdminUserListDto> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_PAGE_SIZE);
    const query = input.query?.trim();
    const where: Prisma.UserWhereInput = {
      ...(input.includeDeleted ? {} : { deletedAt: null }),
      ...(query
        ? {
            OR: [
              { displayName: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query } },
              { firebaseUid: { contains: query } },
            ],
          }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { providerProfile: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: input.offset,
      }),
      this.prisma.user.count({ where }),
    ]);
    const firebase = await this.firebaseSnapshot(users);
    return {
      items: users.map((user) => toRow(user, !!user.providerProfile, firebase)),
      total,
      limit,
      offset: input.offset,
    };
  }

  async get(id: string): Promise<AdminUserRowDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: { providerProfile: { select: { id: true } } },
    });
    const firebase = await this.firebaseSnapshot([user]);
    return toRow(user, !!user.providerProfile, firebase);
  }

  async create(input: CreateAdminUserInput): Promise<AdminUserRowDto> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An app account with this email already exists');
    const city = await this.prisma.city.findFirst({ select: { id: true } });
    if (!city) throw new BadRequestException('Create at least one city before adding users');

    const firebaseUser = await this.firebase.createAccount({ ...input, email });
    try {
      const user = await this.prisma.user.create({
        data: {
          firebaseUid: firebaseUser.uid,
          email,
          displayName: input.displayName,
          cityId: city.id,
        },
      });
      return toRow(user, false, {
        uidStatuses: new Map([[firebaseUser.uid, 'active']]),
        emailMatches: new Map([[email, { uid: firebaseUser.uid, status: 'active' }]]),
        unavailable: false,
      });
    } catch (error) {
      await this.firebase.deleteAccount(firebaseUser.uid);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An app account with this email already exists');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateAdminUserInput): Promise<AdminUserRowDto> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: { providerProfile: { select: { id: true } } },
    });
    if (current.deletedAt) throw new BadRequestException('Deleted accounts cannot be edited');
    if (input.activeRole === 'provider' && !current.providerProfile) {
      throw new BadRequestException('This user has not completed provider setup');
    }
    const email = input.email?.trim().toLowerCase();
    if (email !== undefined && email !== current.email) {
      const emailOwner = await this.prisma.user.findUnique({ where: { email } });
      if (emailOwner && emailOwner.id !== id) {
        throw new ConflictException('An app account with this email already exists');
      }
    }
    const firebaseWrite =
      email !== undefined ||
      input.displayName !== undefined ||
      input.disabled !== undefined ||
      input.password !== undefined;
    const resolvedFirebase = firebaseWrite
      ? await this.firebase.resolveAccount(current.firebaseUid, current.email)
      : null;
    if (firebaseWrite && !resolvedFirebase) {
      throw new ConflictException('This app user is not linked to Firebase');
    }

    if (firebaseWrite && resolvedFirebase) {
      await this.firebase.updateAccount(resolvedFirebase.uid, {
        ...(email !== undefined ? { email } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
        ...(input.password !== undefined ? { password: input.password } : {}),
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            ...(email !== undefined ? { email } : {}),
            ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
            ...(input.activeRole !== undefined ? { activeRole: input.activeRole } : {}),
            ...(resolvedFirebase && resolvedFirebase.uid !== current.firebaseUid
              ? { firebaseUid: resolvedFirebase.uid }
              : {}),
            ...(input.disabled !== undefined
              ? { disabledAt: input.disabled ? new Date() : null }
              : {}),
            ...(input.disabled === true || input.password !== undefined
              ? { tokenVersion: { increment: 1 } }
              : {}),
          },
        });
        if (input.displayName !== undefined && current.providerProfile) {
          await tx.providerProfile.update({
            where: { id: current.providerProfile.id },
            data: {
              displayName: input.displayName,
              initials: deriveInitials(input.displayName),
              tint: deriveTint(input.displayName),
            },
          });
          await tx.referral.updateMany({
            where: { referredUserId: id },
            data: { referredName: input.displayName },
          });
        }
        if (input.disabled === true) {
          await tx.refreshToken.updateMany({ where: { userId: id }, data: { revoked: true } });
        }
      });
    } catch (error) {
      if (firebaseWrite && resolvedFirebase) {
        await this.firebase
          .updateAccount(resolvedFirebase.uid, {
            ...(current.email ? { email: current.email } : {}),
            displayName: current.displayName,
            disabled: current.disabledAt !== null,
          })
          .catch(() => undefined);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An app account with this email already exists');
      }
      throw error;
    }
    return this.get(id);
  }

  async remove(id: string): Promise<{ ok: true; firebaseDeleted: boolean }> {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const firebaseAccount = await this.firebase.resolveAccount(current.firebaseUid, current.email);
    const uid = firebaseAccount?.uid ?? null;
    // Persist a UID discovered from a legacy email-only row before any
    // destructive work. If Firebase deletion later fails, the tombstone
    // retains this UID and the admin can safely retry the cleanup.
    if (uid && uid !== current.firebaseUid) {
      await this.prisma.user.update({
        where: { id },
        data: { firebaseUid: uid },
      });
    }
    if (uid) await this.firebase.disableAccount(uid);
    await this.lifecycle.tombstone(id, !uid);
    if (uid) {
      await this.firebase.deleteAccount(uid);
      await this.lifecycle.releaseFirebaseUid(id);
    }
    return { ok: true, firebaseDeleted: !!uid };
  }

  private async firebaseSnapshot(
    users: { firebaseUid: string | null; email: string | null }[],
  ): Promise<FirebaseSnapshot> {
    try {
      const [uidStatuses, emailMatches] = await Promise.all([
        this.firebase.getAccountStatuses(
          users.flatMap((user) => (user.firebaseUid ? [user.firebaseUid] : [])),
        ),
        this.firebase.getAccountsByEmails(
          users.flatMap((user) => (user.email ? [user.email] : [])),
        ),
      ]);
      return { uidStatuses, emailMatches, unavailable: false };
    } catch {
      return { uidStatuses: new Map(), emailMatches: new Map(), unavailable: true };
    }
  }
}

interface FirebaseSnapshot {
  uidStatuses: Map<string, FirebaseAccountStatus>;
  emailMatches: Map<string, FirebaseAccountMatch>;
  unavailable: boolean;
}

function toRow(
  user: User,
  hasProviderProfile: boolean,
  firebase: FirebaseSnapshot,
): AdminUserRowDto {
  const storedStatus = user.firebaseUid ? firebase.uidStatuses.get(user.firebaseUid) : undefined;
  const emailMatch = user.email ? firebase.emailMatches.get(user.email.toLowerCase()) : undefined;
  const effectiveMatch =
    storedStatus && storedStatus !== 'missing'
      ? { uid: user.firebaseUid, status: storedStatus }
      : emailMatch;
  const firebaseStatus: AdminFirebaseStatus = firebase.unavailable
    ? 'unavailable'
    : effectiveMatch
      ? effectiveMatch.status
      : user.firebaseUid || user.email
        ? 'missing'
        : 'unlinked';
  return {
    id: user.id,
    firebaseUid: effectiveMatch?.uid ?? user.firebaseUid,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    activeRole: user.activeRole,
    hasProviderProfile,
    appStatus: user.deletedAt ? 'deleted' : user.disabledAt ? 'disabled' : 'active',
    firebaseStatus,
    createdAt: user.createdAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
  };
}
