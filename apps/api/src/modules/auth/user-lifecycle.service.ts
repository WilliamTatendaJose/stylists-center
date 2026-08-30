import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorageService } from '../provider/image-storage.service';

/**
 * Removes an account's credentials and public personal data without deleting
 * the row referenced by bookings, ledgers, reports and audit history.
 */
@Injectable()
export class UserLifecycleService {
  private readonly logger = new Logger(UserLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStorageService,
  ) {}

  async tombstone(
    userId: string,
    releaseFirebaseUid: boolean,
  ): Promise<{ firebaseUid: string | null }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        providerProfile: {
          include: {
            services: { select: { imageUrls: true } },
            products: { select: { imageUrls: true } },
          },
        },
      },
    });
    if (user.deletedAt) {
      if (releaseFirebaseUid && user.firebaseUid) await this.releaseFirebaseUid(userId);
      return { firebaseUid: user.firebaseUid };
    }

    const provider = user.providerProfile;
    const imageUrls = [
      user.avatarImageUrl,
      user.verificationIdDocumentUrl,
      user.verificationSelfieImageUrl,
      provider?.profileImageUrl,
      ...(provider?.portfolioImageUrls ?? []),
      ...(provider?.services.flatMap((service) => service.imageUrls) ?? []),
      ...(provider?.products.flatMap((product) => product.imageUrls) ?? []),
    ];

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });
      await tx.devicePushToken.deleteMany({ where: { userId } });
      await tx.agent.updateMany({ where: { userId }, data: { status: 'suspended' } });
      if (provider) {
        await tx.service.updateMany({
          where: { providerId: provider.id },
          data: { imageUrls: [] },
        });
        await tx.product.updateMany({
          where: { providerId: provider.id },
          data: { active: false, imageUrls: [] },
        });
        await tx.providerProfile.update({
          where: { id: provider.id },
          data: {
            displayName: 'Deleted provider',
            initials: 'DP',
            acceptingBookings: false,
            verified: false,
            profileImageUrl: null,
            portfolioImageUrls: [],
          },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(releaseFirebaseUid ? { firebaseUid: null } : {}),
          email: null,
          phone: null,
          displayName: `Deleted user ${userId.slice(0, 8)}`,
          avatarImageUrl: null,
          activeRole: 'client',
          selectedAccountType: null,
          onboardingCompletedAt: null,
          verificationStatus: 'unverified',
          verificationIdDocumentUrl: null,
          verificationSelfieImageUrl: null,
          verificationNote: null,
          verificationSubmittedAt: null,
          disabledAt: new Date(),
          deletedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
    });

    const removals = await Promise.allSettled(imageUrls.map((url) => this.images.remove(url)));
    for (const removal of removals) {
      if (removal.status === 'rejected') {
        this.logger.error('Failed to remove an archived user image', removal.reason);
      }
    }
    return { firebaseUid: user.firebaseUid };
  }

  async releaseFirebaseUid(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { firebaseUid: null } });
  }
}
