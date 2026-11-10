import { Controller, Get, Header, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminJwtAuthGuard,
  type AdminAuthenticatedRequest,
} from '../admin-auth/admin-jwt-auth.guard';
import { AdminRoles } from '../admin-auth/admin-roles';
import { harareDateRange } from '../../common/csv';
import { AdminExportsService } from './admin-exports.service';

type Kind = 'payments' | 'payouts' | 'cash-outs';

@AdminRoles('finance')
@Controller('admin/exports')
@UseGuards(AdminJwtAuthGuard)
export class AdminExportsController {
  constructor(
    private readonly exports: AdminExportsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('payments.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  payments(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: AdminAuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.run('payments', from, to, req, res, (r) => this.exports.paymentsCsv(r));
  }

  @Get('payouts.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  payouts(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: AdminAuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.run('payouts', from, to, req, res, (r) => this.exports.payoutsCsv(r));
  }

  @Get('cash-outs.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  cashOuts(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: AdminAuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.run('cash-outs', from, to, req, res, (r) => this.exports.cashOutsCsv(r));
  }

  private async run(
    kind: Kind,
    from: string,
    to: string,
    req: AdminAuthenticatedRequest,
    res: Response,
    build: (range: { start: Date; end: Date }) => Promise<string>,
  ): Promise<string> {
    const range = harareDateRange(from, to);
    const csv = await build(range);
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-${from}-to-${to}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    // Reads aren't audited (AuditInterceptor skips GET), but a bulk export of
    // names, phone numbers and amounts is worth a record of who took it.
    await this.prisma.auditLog.create({
      data: {
        adminActorId: req.admin?.id ?? null,
        action: `EXPORT ${kind} ${from}..${to}`,
        ip: req.ip ?? null,
      },
    });
    return csv;
  }
}
