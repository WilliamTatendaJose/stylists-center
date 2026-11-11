import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  vendorStatusSchema,
  type AdminVendorRowDto,
  type Paged,
  type ReviewVendorInput,
  type VendorStatus,
} from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { toPage, type PageRequest } from '../../common/paging';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import { toVendorApplicationDto } from '../vendors/vendors.service';

const INCLUDE = {
  provider: {
    select: {
      id: true,
      userId: true,
      offersServices: true,
      user: { select: { displayName: true, phone: true } },
    },
  },
} satisfies Prisma.VendorApplicationInclude;

type Row = Prisma.VendorApplicationGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class AdminVendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async list(input: {
    status?: VendorStatus | undefined;
    q?: string | undefined;
    page: PageRequest;
  }): Promise<Paged<AdminVendorRowDto>> {
    const where: Prisma.VendorApplicationWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.q
        ? {
            OR: [
              { businessName: { contains: input.q, mode: 'insensitive' } },
              { contactName: { contains: input.q, mode: 'insensitive' } },
              { contactPhone: { contains: input.q } },
              { registrationNumber: { contains: input.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vendorApplication.findMany({
        where,
        include: INCLUDE,
        // Oldest waiting first when reviewing; newest first otherwise.
        orderBy:
          input.status === 'pending'
            ? [{ submittedAt: 'asc' }, { id: 'asc' }]
            : [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: input.page.limit,
        skip: input.page.offset,
      }),
      this.prisma.vendorApplication.count({ where }),
    ]);
    const reviewers = await this.reviewerNames(rows);
    return toPage(
      rows.map((row) => toRow(row, reviewers)),
      total,
      input.page,
    );
  }

  async get(id: string): Promise<AdminVendorRowDto> {
    const row = await this.prisma.vendorApplication.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Application not found');
    return toRow(row, await this.reviewerNames([row]));
  }

  /**
   * Records the decision and who made it. Any status can move to either
   * decision, so a vendor that turns out to be bogus can be switched off
   * later; their products drop out of the market the moment it is not
   * `approved`.
   */
  async review(id: string, adminId: string, input: ReviewVendorInput): Promise<AdminVendorRowDto> {
    const existing = await this.prisma.vendorApplication.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!existing) throw new NotFoundException('Application not found');
    if (existing.status === input.decision && existing.reviewNote === (input.note ?? null)) {
      return toRow(existing, await this.reviewerNames([existing]));
    }
    const note = input.note?.length ? input.note : null;
    const updated = await this.prisma.vendorApplication.update({
      where: { id },
      data: {
        status: input.decision,
        reviewedByAdminId: adminId,
        reviewNote: note,
        reviewedAt: new Date(),
      },
      include: INCLUDE,
    });
    if (existing.status !== input.decision) {
      void this.push.sendToUser(updated.provider.userId, {
        title: input.decision === 'approved' ? 'Your shop is approved' : 'Shop application update',
        body:
          input.decision === 'approved'
            ? 'You can now list products and take orders.'
            : 'Your application was not approved. Open the app to see why.',
        data: { type: 'vendor.reviewed', status: input.decision },
      });
    }
    return toRow(updated, await this.reviewerNames([updated]));
  }

  private async reviewerNames(rows: { reviewedByAdminId: string | null }[]) {
    const ids = [
      ...new Set(rows.flatMap((r) => (r.reviewedByAdminId ? [r.reviewedByAdminId] : []))),
    ];
    if (ids.length === 0) return new Map<string, string>();
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });
    return new Map(admins.map((a) => [a.id, a.displayName]));
  }
}

function toRow(row: Row, reviewers: Map<string, string>): AdminVendorRowDto {
  return {
    ...toVendorApplicationDto(row),
    providerId: row.provider.id,
    userId: row.provider.userId,
    isStylist: row.provider.offersServices,
    accountName: row.provider.user.displayName,
    accountPhone: row.provider.user.phone,
    reviewedByAdminName: row.reviewedByAdminId
      ? (reviewers.get(row.reviewedByAdminId) ?? null)
      : null,
  };
}

export function parseVendorStatus(value?: string): VendorStatus | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = vendorStatusSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid status');
  return parsed.data;
}
