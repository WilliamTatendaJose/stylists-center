import { Injectable } from '@nestjs/common';
import type { AdminBanRowDto, AdminReportRowDto, AppealStatus, ReportStatus } from '@sc/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { TrustService } from '../trust/trust.service';

const REPORT_INCLUDE = {
  reporter: { select: { id: true, displayName: true, phone: true } },
  reported: { select: { id: true, displayName: true, phone: true } },
} satisfies Prisma.ReportInclude;

const BAN_INCLUDE = {
  user: { select: { id: true, displayName: true, phone: true } },
} satisfies Prisma.BanInclude;

type ReportWithParties = Prisma.ReportGetPayload<{ include: typeof REPORT_INCLUDE }>;
type BanWithUser = Prisma.BanGetPayload<{ include: typeof BAN_INCLUDE }>;

/**
 * The staff console's read/write surface over reports and bans (README's
 * "no authenticated staff interface ... for reviewing reports, resolving
 * disputes, handling appeals" gap). Ban creation and appeal resolution
 * delegate to TrustService rather than writing the Ban table directly here —
 * that's where the tokenVersion-bump lever already lives, and duplicating it
 * would risk a manual ban that doesn't actually end the user's session.
 */
@Injectable()
export class AdminTrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: TrustService,
  ) {}

  async listReports(status?: ReportStatus): Promise<AdminReportRowDto[]> {
    const reports = await this.prisma.report.findMany({
      ...(status ? { where: { status } } : {}),
      include: REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(reports.map((report) => this.toReportRow(report)));
  }

  async getReport(id: string): Promise<AdminReportRowDto> {
    const report = await this.findReportOrThrow(id);
    return this.toReportRow(report);
  }

  async updateReportStatus(
    id: string,
    status: ReportStatus,
    resolutionNote?: string,
  ): Promise<AdminReportRowDto> {
    await this.findReportOrThrow(id);
    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status,
        ...(resolutionNote !== undefined ? { resolutionNote } : {}),
      },
      include: REPORT_INCLUDE,
    });
    return this.toReportRow(updated);
  }

  async listBans(appealStatus?: AppealStatus): Promise<AdminBanRowDto[]> {
    const bans = await this.prisma.ban.findMany({
      ...(appealStatus ? { where: { appealStatus } } : {}),
      include: BAN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return bans.map((ban) => this.toBanRow(ban));
  }

  async getBan(id: string): Promise<AdminBanRowDto> {
    const ban = await this.findBanOrThrow(id);
    return this.toBanRow(ban);
  }

  async createManualBan(userId: string, reason: string): Promise<AdminBanRowDto> {
    await this.trust.banManually(userId, reason);
    const ban = await this.prisma.ban.findFirstOrThrow({
      where: { userId, trigger: 'manual' },
      include: BAN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return this.toBanRow(ban);
  }

  async resolveAppeal(
    id: string,
    appealStatus: AppealStatus,
    appealNote?: string,
  ): Promise<AdminBanRowDto> {
    await this.findBanOrThrow(id);
    const updated = await this.trust.resolveAppeal(id, appealStatus, appealNote);
    const ban = await this.prisma.ban.findUniqueOrThrow({
      where: { id: updated.id },
      include: BAN_INCLUDE,
    });
    return this.toBanRow(ban);
  }

  private findReportOrThrow(id: string) {
    return this.prisma.report.findUniqueOrThrow({ where: { id }, include: REPORT_INCLUDE });
  }

  private findBanOrThrow(id: string) {
    return this.prisma.ban.findUniqueOrThrow({ where: { id }, include: BAN_INCLUDE });
  }

  private async toReportRow(report: ReportWithParties): Promise<AdminReportRowDto> {
    const reportCountAgainstReported = await this.prisma.report.count({
      where: { reportedId: report.reportedId },
    });

    return {
      id: report.id,
      reporter: report.reporter,
      reported: report.reported,
      bookingId: report.bookingId,
      reason: report.reason,
      status: report.status,
      resolutionNote: report.resolutionNote,
      createdAt: report.createdAt.toISOString(),
      reportCountAgainstReported,
    };
  }

  private toBanRow(ban: BanWithUser): AdminBanRowDto {
    return {
      id: ban.id,
      user: ban.user,
      reason: ban.reason,
      trigger: ban.trigger,
      appealStatus: ban.appealStatus,
      appealNote: ban.appealNote,
      createdAt: ban.createdAt.toISOString(),
    };
  }
}
