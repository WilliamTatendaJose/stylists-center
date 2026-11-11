import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  CONTENT_TITLES,
  type AcceptTermsInput,
  type ContentKey,
  type TermsDocumentStatusDto,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Which terms documents a user must accept before using the app, and whether
 * they have accepted the current version of each.
 */
@Injectable()
export class TermsService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string): Promise<TermsDocumentStatusDto[]> {
    const keys = await this.requiredKeys(userId);
    const [docs, accepted] = await Promise.all([
      this.prisma.contentDocument.findMany({
        where: { key: { in: keys } },
        select: { key: true, title: true, version: true },
      }),
      this.prisma.termsAcceptance.findMany({
        where: { userId, key: { in: keys } },
        select: { key: true, version: true },
      }),
    ]);
    const agreed = new Set(accepted.map((a) => `${a.key}:${String(a.version)}`));

    return keys.map((key) => {
      const doc = docs.find((d) => d.key === key);
      // Version 0 is the built-in placeholder: nothing has been published, so there is nothing to agree to.
      const version = doc?.version ?? 0;
      return {
        key,
        title: doc?.title ?? CONTENT_TITLES[key],
        version,
        accepted: version === 0 || agreed.has(`${key}:${String(version)}`),
      };
    });
  }

  /**
   * Records that the user agreed to `version`. Only the current version counts:
   * accepting an older one would leave the user agreeing to text they were not shown.
   * Repeating an acceptance is harmless.
   */
  async accept(userId: string, input: AcceptTermsInput): Promise<TermsDocumentStatusDto[]> {
    const keys = await this.requiredKeys(userId);
    if (!keys.includes(input.key)) {
      throw new BadRequestException('This document does not apply to your account');
    }

    const doc = await this.prisma.contentDocument.findUnique({
      where: { key: input.key },
      select: { version: true },
    });
    const current = doc?.version ?? 0;
    if (current === 0) {
      throw new BadRequestException('This document has not been published yet');
    }
    if (input.version !== current) {
      throw new ConflictException(
        `Version ${String(input.version)} is not the current version (${String(current)})`,
      );
    }

    // skipDuplicates keeps a double-tap or a retry from failing on the unique key.
    await this.prisma.termsAcceptance.createMany({
      data: [{ userId, key: input.key, version: current }],
      skipDuplicates: true,
    });
    return this.status(userId);
  }

  /** The documents that apply to this user. Vendor terms go here once vendor accounts exist. */
  private async requiredKeys(userId: string): Promise<ContentKey[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { providerProfile: { select: { id: true } }, agent: { select: { id: true } } },
    });
    const keys: ContentKey[] = ['terms-clients', 'privacy'];
    if (user?.providerProfile) keys.push('terms-stylists');
    if (user?.agent) keys.push('terms-agents');
    return keys;
  }
}
