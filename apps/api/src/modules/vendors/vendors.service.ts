import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  deriveInitials,
  deriveTint,
  type ApplyVendorInput,
  type VendorApplicationDto,
  type VendorFulfilmentInput,
  type VendorMeDto,
} from '@sc/shared';
import { Prisma, type VendorApplication } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

export function toVendorApplicationDto(row: VendorApplication): VendorApplicationDto {
  return {
    id: row.id,
    status: row.status,
    businessName: row.businessName,
    registrationNumber: row.registrationNumber,
    shopAddress: row.shopAddress,
    shopLat: row.shopLat,
    shopLng: row.shopLng,
    premisesPhotoUrls: row.premisesPhotoUrls,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt.toISOString(),
    delivers: row.delivers,
    deliveryChargeUsdCents: row.deliveryChargeUsdCents,
    deliveryAreas: row.deliveryAreas,
    collectionAddress: row.collectionAddress,
    collectionHours: row.collectionHours,
  };
}

/**
 * A vendor is a ProviderProfile with an approved VendorApplication. The
 * application hangs off the profile (not the user) so products, orders and
 * the fee ledger, which all key on the profile, keep working unchanged.
 */
@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<VendorMeDto> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: { vendor: true },
    });
    return {
      application: profile?.vendor ? toVendorApplicationDto(profile.vendor) : null,
      isStylist: Boolean(profile?.offersServices),
    };
  }

  /**
   * Submits (or resubmits after a rejection) an application.
   *
   * A stylist applies from their existing page. Anyone else gets a
   * vendor-only profile, created here, that searches and smart match skip
   * (`offersServices = false`): the shop still needs a ProviderProfile to own
   * its products and orders, but must never appear as a bookable stylist.
   */
  async apply(userId: string, input: ApplyVendorInput): Promise<VendorApplicationDto> {
    const data = {
      businessName: input.businessName,
      registrationNumber: input.registrationNumber ?? null,
      shopAddress: input.shopAddress,
      shopLat: input.shopLat ?? null,
      shopLng: input.shopLng ?? null,
      premisesPhotoUrls: input.premisesPhotoUrls,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
    };
    if ((input.shopLat === undefined) !== (input.shopLng === undefined)) {
      throw new BadRequestException('Pin the shop on the map or leave the location out');
    }

    const attempt = () =>
      this.prisma.$transaction(async (tx) => {
        let profile = await tx.providerProfile.findUnique({
          where: { userId },
          include: { vendor: true },
        });
        if (!profile) {
          // A shop with no stylist page needs a location: buyers see how far it is.
          if (input.shopLat === undefined || input.shopLng === undefined) {
            throw new BadRequestException('Pin your shop on the map so buyers can find it');
          }
          // Single-city build, same as stylist sign-up: there is nowhere else to take these from.
          const city = await tx.city.findFirstOrThrow();
          const category = await tx.category.findFirstOrThrow({ orderBy: { name: 'asc' } });
          const created = await tx.providerProfile.create({
            data: {
              userId,
              displayName: input.businessName,
              tint: deriveTint(input.businessName),
              initials: deriveInitials(input.businessName),
              categoryId: category.id,
              areaName: input.shopAddress.slice(0, 80),
              latitude: input.shopLat,
              longitude: input.shopLng,
              cityId: city.id,
              workingHoursLabel: 'Ask the shop',
              offersServices: false,
            },
          });
          profile = { ...created, vendor: null };
        }
        if (profile.vendor?.status === 'approved') {
          throw new ConflictException('Your shop is already approved');
        }
        // Resubmitting clears the last decision: staff review the new details from scratch.
        const resubmit = {
          ...data,
          status: 'pending' as const,
          reviewedByAdminId: null,
          reviewNote: null,
          reviewedAt: null,
          submittedAt: new Date(),
        };
        return profile.vendor
          ? tx.vendorApplication.update({ where: { providerId: profile.id }, data: resubmit })
          : tx.vendorApplication.create({ data: { providerId: profile.id, ...resubmit } });
      });

    try {
      return toVendorApplicationDto(await attempt());
    } catch (error) {
      // Two taps at once: the second sees the first's row and updates it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return toVendorApplicationDto(await attempt());
      }
      throw error;
    }
  }

  /** Delivery and collection defaults. Only an approved vendor has any use for them. */
  async updateFulfilment(
    userId: string,
    input: VendorFulfilmentInput,
  ): Promise<VendorApplicationDto> {
    const vendor = await this.requireOwnVendor(userId);
    if (vendor.status !== 'approved') {
      throw new BadRequestException('Delivery settings open once your shop is approved');
    }
    const updated = await this.prisma.vendorApplication.update({
      where: { id: vendor.id },
      data: {
        delivers: input.delivers,
        deliveryChargeUsdCents: input.deliveryChargeUsdCents,
        deliveryAreas: [...new Set(input.deliveryAreas)],
        collectionAddress: input.collectionAddress?.length ? input.collectionAddress : null,
        collectionHours: input.collectionHours?.length ? input.collectionHours : null,
      },
    });
    return toVendorApplicationDto(updated);
  }

  /** Whether this profile may list products and take orders right now. */
  async isApproved(providerId: string): Promise<boolean> {
    const vendor = await this.prisma.vendorApplication.findUnique({
      where: { providerId },
      select: { status: true },
    });
    return vendor?.status === 'approved';
  }

  private async requireOwnVendor(userId: string): Promise<VendorApplication> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: { vendor: true },
    });
    if (!profile?.vendor) throw new NotFoundException('You have not applied to sell yet');
    return profile.vendor;
  }
}
