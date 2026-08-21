import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdminCashOutRowDto, RecordCashOutSettlementInput } from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `WalletTransaction.type = 'cash_out'` already debited the coin ledger the
 * moment a stylist requested it — nothing in this codebase moves real money
 * to them (see WalletService.cashOut). This service gives admins visibility
 * into cash-out requests and a way to record that a real-world transfer
 * happened, via the separate append-only CashOutSettlement table. It never
 * writes to WalletTransaction.
 */
@Injectable()
export class AdminWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async listCashOuts(): Promise<AdminCashOutRowDto[]> {
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { type: 'cash_out' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true, phone: true } },
        cashOutSettlement: true,
      },
    });
    return transactions.map(toCashOutRow);
  }

  async settleCashOut(
    transactionId: string,
    input: RecordCashOutSettlementInput,
  ): Promise<AdminCashOutRowDto> {
    const transaction = await this.prisma.walletTransaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: {
        user: { select: { displayName: true, phone: true } },
        cashOutSettlement: true,
      },
    });
    if (transaction.type !== 'cash_out') {
      throw new BadRequestException('Not a cash-out transaction');
    }
    if (transaction.cashOutSettlement) {
      throw new BadRequestException('This cash-out is already settled');
    }

    const settlement = await this.prisma.cashOutSettlement.create({
      data: { walletTransactionId: transactionId, note: input.note ?? null },
    });
    return toCashOutRow({ ...transaction, cashOutSettlement: settlement });
  }
}

function toCashOutRow(transaction: {
  id: string;
  userId: string;
  user: { displayName: string; phone: string | null };
  coins: number;
  usdCents: number;
  createdAt: Date;
  cashOutSettlement: { note: string | null; createdAt: Date } | null;
}): AdminCashOutRowDto {
  return {
    transactionId: transaction.id,
    userId: transaction.userId,
    displayName: transaction.user.displayName,
    phone: transaction.user.phone,
    // Cash-out rows are stored negative (a debit) — the admin view is the positive amount requested.
    amountUsdCents: -transaction.usdCents,
    coins: -transaction.coins,
    requestedAt: transaction.createdAt.toISOString(),
    settled: !!transaction.cashOutSettlement,
    settledAt: transaction.cashOutSettlement?.createdAt.toISOString() ?? null,
    settledNote: transaction.cashOutSettlement?.note ?? null,
  };
}
