import { Injectable } from '@nestjs/common';
import {
  isSubscriptionActive,
  nextSubscriptionPaidUntil,
  type AdminProviderRowDto,
  type UpdateProviderAdminInput,
} from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorageService } from '../provider/image-storage.service';
import type { AdminSubscriptionSummaryDto, Paged } from '@sc/shared';
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

/**
 * Provider verification and subscription pricing — the two admin actions
 * `ProviderProfile.verified` and `subscriptionPriceUsdCents` were always
 * modelled for (see their doc comments in schema.prisma) but had no write
 * path anywhere until now.
 */
@Injectable()
export class AdminProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStorageService,
  ) {}

  async list(input: {
    verified?: boolean | undefined;
    subscription?: 'active' | 'lapsed' | undefined;
    q?: string | undefined;
    page: PageRequest;
  }): Promise<Paged<AdminProviderRowDto>> {
    const now = new Date();
    const filters: Prisma.ProviderProfileWhereInput[] = [{ user: { deletedAt: null } }];
    if (input.verified !== undefined) filters.push({ verified: input.verified });
    // Same rule as isSubscriptionActive: paid until a moment still in the future.
    if (input.subscription === 'active') filters.push({ subscriptionPaidUntil: { gt: now } });
    if (input.subscription === 'lapsed') {
      filters.push({
        OR: [{ subscriptionPaidUntil: null }, { subscriptionPaidUntil: { lte: now } }],
      });
    }
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

  /** Totals across every provider, so the Subscriptions header doesn't depend on which page is shown. */
  async subscriptionSummary(): Promise<AdminSubscriptionSummaryDto> {
    const now = new Date();
    const notDeleted = { user: { deletedAt: null } };
    const [active, lapsedCount] = await this.prisma.$transaction([
      this.prisma.providerProfile.aggregate({
        where: { ...notDeleted, subscriptionPaidUntil: { gt: now } },
        _count: { _all: true },
        _sum: { subscriptionPriceUsdCents: true },
      }),
      this.prisma.providerProfile.count({
        where: {
          ...notDeleted,
          OR: [{ subscriptionPaidUntil: null }, { subscriptionPaidUntil: { lte: now } }],
        },
      }),
    ]);
    return {
      activeCount: active._count._all,
      lapsedCount,
      mrrUsdCents: active._sum.subscriptionPriceUsdCents ?? 0,
    };
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
          ...(input.subscriptionPriceUsdCents !== undefined
            ? { subscriptionPriceUsdCents: input.subscriptionPriceUsdCents }
            : {}),
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

  /**
   * The admin-side counterpart to the provider's own `POST
   * /provider/subscription/pay` — for a payment that happened outside the
   * app (bank transfer, a courtesy extension) rather than through EcoCash or
   * a cash confirmation. Extends from the current expiry the same way the
   * paid flow does (`nextSubscriptionPaidUntil`), so an early grant doesn't
   * cost the provider unused days, and still writes a Payment row — tagged
   * `admin_grant` rather than `cash`/`ecocash` so it's excluded from real
   * revenue sums but still shows up in the provider's own payment history.
   */
  async extendSubscription(id: string): Promise<AdminProviderRowDto> {
    const provider = await this.prisma.providerProfile.findUniqueOrThrow({
      where: { id },
      select: { subscriptionPriceUsdCents: true, subscriptionPaidUntil: true },
    });
    const currentPaidUntil = provider.subscriptionPaidUntil?.toISOString() ?? null;
    const paidUntil = nextSubscriptionPaidUntil(currentPaidUntil);

    const [updated] = await this.prisma.$transaction([
      this.prisma.providerProfile.update({
        where: { id },
        data: { subscriptionPaidUntil: paidUntil },
        include: PROVIDER_INCLUDE,
      }),
      this.prisma.payment.create({
        data: {
          subscriptionProviderId: id,
          provider: 'admin_grant',
          status: 'released',
          amountUsdCents: 0,
        },
      }),
    ]);

    return toRow(updated);
  }
}

function toRow(provider: ProviderWithRelations): AdminProviderRowDto {
  const subscriptionPaidUntil = provider.subscriptionPaidUntil?.toISOString() ?? null;
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
    subscriptionPriceUsdCents: provider.subscriptionPriceUsdCents,
    subscriptionPaidUntil,
    subscriptionActive: isSubscriptionActive(subscriptionPaidUntil),
    createdAt: provider.createdAt.toISOString(),
  };
}
