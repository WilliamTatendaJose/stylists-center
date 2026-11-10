import { BadRequestException, Injectable } from '@nestjs/common';
import {
  verificationStatusSchema,
  type AdminVerificationRowDto,
  type ReviewVerificationInput,
  type VerificationStatus,
} from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorageService } from '../provider/image-storage.service';
import type { Paged } from '@sc/shared';
import { toPage, type PageRequest } from '../../common/paging';

const VERIFICATION_USER_INCLUDE = {
  providerProfile: { select: { id: true } },
} satisfies Prisma.UserInclude;

type UserWithVerification = Prisma.UserGetPayload<{
  include: typeof VERIFICATION_USER_INCLUDE;
}>;

@Injectable()
export class AdminVerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStorageService,
  ) {}

  async list(input: {
    status?: VerificationStatus | undefined;
    q?: string | undefined;
    page: PageRequest;
  }): Promise<Paged<AdminVerificationRowDto>> {
    const where: Prisma.UserWhereInput = {
      ...(input.status ? { verificationStatus: input.status } : {}),
      verificationSubmittedAt: { not: null },
      ...(input.q
        ? {
            OR: [
              { displayName: { contains: input.q, mode: 'insensitive' } },
              { email: { contains: input.q, mode: 'insensitive' } },
              { phone: { contains: input.q } },
            ],
          }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: VERIFICATION_USER_INCLUDE,
        orderBy: [{ verificationSubmittedAt: 'desc' }, { id: 'desc' }],
        take: input.page.limit,
        skip: input.page.offset,
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(users.map(toRow), total, input.page);
  }

  async review(id: string, input: ReviewVerificationInput): Promise<AdminVerificationRowDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: VERIFICATION_USER_INCLUDE,
    });
    if (!user.verificationSubmittedAt) {
      throw new BadRequestException('This user has not submitted verification documents');
    }
    const documentUrls = [user.verificationIdDocumentUrl, user.verificationSelfieImageUrl];
    const decisionMade = input.verificationStatus !== 'pending';

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          verificationStatus: input.verificationStatus,
          // Uploaded identity documents are review-only data. Once a final
          // decision is made, remove their references and submission marker.
          ...(decisionMade
            ? {
                verificationIdDocumentUrl: null,
                verificationSelfieImageUrl: null,
                verificationSubmittedAt: null,
                verificationNote: null,
              }
            : input.verificationNote !== undefined
              ? { verificationNote: input.verificationNote }
              : {}),
        },
      });
      await tx.agent.updateMany({
        where: { userId: id },
        data: { verificationStatus: input.verificationStatus },
      });
      if (user.providerProfile) {
        await tx.providerProfile.update({
          where: { id: user.providerProfile.id },
          data: { verified: input.verificationStatus === 'verified' },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id },
        include: VERIFICATION_USER_INCLUDE,
      });
    });
    if (decisionMade) {
      await Promise.all(documentUrls.map((url) => this.images.remove(url)));
    }
    return toRow(updated);
  }
}

function toRow(user: UserWithVerification): AdminVerificationRowDto {
  return {
    id: user.id,
    displayName: user.displayName,
    phone: user.phone,
    activeRole: user.activeRole,
    hasProviderProfile: Boolean(user.providerProfile),
    verificationStatus: user.verificationStatus,
    idDocumentUrl: user.verificationIdDocumentUrl,
    selfieImageUrl: user.verificationSelfieImageUrl,
    note: user.verificationNote,
    submittedAt: user.verificationSubmittedAt?.toISOString() ?? null,
  };
}

export function parseVerificationStatus(value?: string): VerificationStatus | undefined {
  if (value === undefined) return undefined;
  const parsed = verificationStatusSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid verification status');
  return parsed.data;
}
