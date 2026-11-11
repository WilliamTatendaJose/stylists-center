import { Injectable } from '@nestjs/common';
import { type AdminProviderRowDto, type UpdateProviderAdminInput } from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorageService } from '../provider/image-storage.service';
import type { Paged } from '@sc/shared';
import { toPage, type PageRequest } from '../../common/paging';

const PROVIDER_INCLUDE = {
  user: {
    select: {
      phone: true,
      avatarImageUrl: true,
      verificationStatus: true,
      verificationIdDocumentUrl: true,
      verificationSelfieImageUrl: true,
      verificationNote: true,
      verificationSubmittedAt: true,
    },
  },
  category: { select: { name: true } },
  services: { select: { imageUrls: true } },
  products: { select: { imageUrls: true } },
} satisfies Prisma.ProviderProfileInclude;

type ProviderWithRelations = Prisma.ProviderProfileGetPayload<{ include: typeof PROVIDER_INCLUDE }>;

/** Provider verification. (Fee balances live in the fees module.) */
@Injectable()
export class AdminProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStorageService,
  ) {}

  async list(input: {
    verified?: boolean | undefined;
    q?: string | undefined;
    page: PageRequest;
  }): Promise<Paged<AdminProviderRowDto>> {
    const filters: Prisma.ProviderProfileWhereInput[] = [{ user: { deletedAt: null } }];
    if (input.verified !== undefined) filters.push({ verified: input.verified });
    if (input.q) {
      filters.push({
        OR: [
          { displayName: { contains: input.q, mode: 'insensitive' } },
          { user: { phone: { contains: input.q } } },
          { user: { email: { contains: input.q, mode: 'insensitive' } } },
        ],
      });
    }
    const searched: Prisma.ProviderProfileWhereInput = { AND: filters };
    const [providers, total] = await this.prisma.$transaction([
      this.prisma.providerProfile.findMany({
        where: searched,
        include: PROVIDER_INCLUDE,
        // id breaks ties so rows created in the same instant page deterministically.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.page.limit,
        skip: input.page.offset,
      }),
      this.prisma.providerProfile.count({ where: searched }),
    ]);
    return toPage(providers.map(toRow), total, input.page);
  }

  async get(id: string): Promise<AdminProviderRowDto> {
    const provider = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id },
      include: PROVIDER_INCLUDE,
    });
    return toRow(provider);
  }

  async update(id: string, input: UpdateProviderAdminInput): Promise<AdminProviderRowDto> {
    const provider = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id },
      select: {
        userId: true,
        user: { select: { verificationIdDocumentUrl: true, verificationSelfieImageUrl: true } },
      },
    });
    const status =
      input.verificationStatus ??
      (input.verified !== undefined ? (input.verified ? 'verified' : 'unverified') : undefined);
    const decisionMade = status !== undefined && status !== 'pending';
    const documentUrls = [
      provider.user.verificationIdDocumentUrl,
      provider.user.verificationSelfieImageUrl,
    ];
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.providerProfile.update({
        where: { id },
        data: {
          ...(input.verified !== undefined ? { verified: input.verified } : {}),
        },
      });
      if (status || input.verificationNote !== undefined) {
        await tx.user.update({
          where: { id: provider.userId },
          data: {
            ...(status ? { verificationStatus: status } : {}),
            ...(decisionMade
              ? {
                  verificationIdDocumentUrl: null,
                  verificationSelfieImageUrl: null,
                  verificationSubmittedAt: null,
                  verificationNote: null,
                }
              : {}),
            ...(input.verificationNote !== undefined && !decisionMade
              ? { verificationNote: input.verificationNote }
              : {}),
          },
        });
        await tx.agent.updateMany({
          where: { userId: provider.userId },
          data: status ? { verificationStatus: status } : {},
        });
      }
      return tx.providerProfile.findUniqueOrThrow({
        where: { id },
        include: PROVIDER_INCLUDE,
      });
    });
    if (decisionMade) {
      await Promise.all(documentUrls.map((url) => this.images.remove(url)));
    }
    return toRow(updated);
  }
}

function toRow(provider: ProviderWithRelations): AdminProviderRowDto {
  return {
    id: provider.id,
    userId: provider.userId,
    displayName: provider.displayName,
    phone: provider.user.phone,
    areaName: provider.areaName,
    categoryName: provider.category.name,
    verified: provider.verified,
    verificationStatus: provider.user.verificationStatus,
    verificationIdDocumentUrl: provider.user.verificationIdDocumentUrl,
    verificationSelfieImageUrl: provider.user.verificationSelfieImageUrl,
    verificationNote: provider.user.verificationNote,
    verificationSubmittedAt: provider.user.verificationSubmittedAt?.toISOString() ?? null,
    avatarImageUrl: provider.user.avatarImageUrl,
    profileImageUrl: provider.profileImageUrl,
    portfolioImageUrls: provider.portfolioImageUrls,
    serviceImageUrls: provider.services.flatMap((service) => service.imageUrls),
    productImageUrls: provider.products.flatMap((product) => product.imageUrls),
    ratingAvg: provider.ratingAvg,
    completedCount: provider.completedCount,
    createdAt: provider.createdAt.toISOString(),
  };
}
