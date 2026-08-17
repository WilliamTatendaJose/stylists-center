import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminWalletService } from './admin-wallet.service';
import { RecordCashOutSettlementDto } from './dto';

@Controller('admin/wallet')
@UseGuards(AdminJwtAuthGuard)
export class AdminWalletController {
  constructor(private readonly adminWallet: AdminWalletService) {}

  @Get('cash-outs')
  listCashOuts() {
    return this.adminWallet.listCashOuts();
  }

  @Post('cash-outs/:transactionId/settle')
  settleCashOut(
    @Param('transactionId') transactionId: string,
    @Body() dto: RecordCashOutSettlementDto,
  ) {
    return this.adminWallet.settleCashOut(transactionId, dto);
  }
}
