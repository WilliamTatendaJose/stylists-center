import { Body, Controller, Get, Param, Post, UseGuards, Query } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminWalletService } from './admin-wallet.service';
import { RecordCashOutSettlementDto } from './dto';
import { AdminRoles } from '../admin-auth/admin-roles';
import { readPage, searchTerm } from '../../common/paging';

@AdminRoles('finance')
@Controller('admin/wallet')
@UseGuards(AdminJwtAuthGuard)
export class AdminWalletController {
  constructor(private readonly adminWallet: AdminWalletService) {}

  @Get('cash-outs')
  listCashOuts(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminWallet.listCashOuts({ q: searchTerm(q), page: readPage(limit, offset) });
  }

  @Get('agents')
  listAgents(
    @Query('q') q?: string,
    @Query('subscription') subscription?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminWallet.listAgents({
      q: searchTerm(q),
      subscription:
        subscription === 'active' || subscription === 'lapsed' ? subscription : undefined,
      page: readPage(limit, offset),
    });
  }

  @Post('cash-outs/:transactionId/settle')
  settleCashOut(
    @Param('transactionId') transactionId: string,
    @Body() dto: RecordCashOutSettlementDto,
  ) {
    return this.adminWallet.settleCashOut(transactionId, dto);
  }
}
