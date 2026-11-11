import type { CoinPool, Prisma, WalletTxnType } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * The coin ledger: WalletTransaction rows in three pools (see CoinPool).
 *
 * - `spend`: coins a client earned. They expire, so each earning row carries
 *   `expiresAt` and `remainingCoins`; spending takes from the soonest-to-expire
 *   row first. They can pay for services and products but never be cashed out.
 * - `cash`: coins a stylist or vendor received when a client paid with coins.
 *   They never expire and can be cashed out.
 * - `agent`: an agent's earnings. They can be cashed out only while the
 *   agent's subscription is active.
 *
 * Expiry is computed at read time (an expired earning row simply stops
 * counting), so a balance is right even if no job has run. `sweepExpired`
 * additionally writes an `expiry` row per lapsed earning row so the ledger
 * shows what happened; it is idempotent and runs whenever coins are spent
 * or cashed out.
 */

export interface CoinBalance {
  /** Unexpired coins of every pool. */
  total: number;
  /** What can pay for a service or product: spend-only coins plus cash coins. */
  spendable: number;
  /** Cash coins plus, when the agent subscription is active, agent coins. */
  cashOutable: number;
  /** Agent coins held back because the subscription has lapsed. */
  lockedAgent: number;
  /** Soonest expiry among unspent earned coins. */
  nextExpiry: { at: Date; coins: number } | null;
}

/** Adds calendar months, clamping the day so 31 Jan + 1 month is the end of February. */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Serialises everything that changes one person's coins. Needs a transaction. */
export async function lockWallet(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

export async function coinBalance(
  db: Db,
  userId: string,
  opts: { agentActive: boolean; now?: Date },
): Promise<CoinBalance> {
  const now = opts.now ?? new Date();
  const [pools, lapsed, soonest] = await Promise.all([
    db.walletTransaction.groupBy({
      by: ['pool'],
      where: { userId },
      _sum: { coins: true },
    }),
    // Earned coins past their expiry that no `expiry` row has taken yet.
    db.walletTransaction.aggregate({
      where: { userId, pool: 'spend', expiresAt: { lte: now }, remainingCoins: { gt: 0 } },
      _sum: { remainingCoins: true },
    }),
    db.walletTransaction.findFirst({
      where: { userId, pool: 'spend', expiresAt: { gt: now }, remainingCoins: { gt: 0 } },
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true, remainingCoins: true },
    }),
  ]);
  const sum = (pool: CoinPool) => pools.find((p) => p.pool === pool)?._sum.coins ?? 0;
  const spend = Math.max(0, sum('spend') - (lapsed._sum.remainingCoins ?? 0));
  // A refund after a stylist already cashed out can leave these negative on
  // paper; nobody is owed less than zero.
  const cash = Math.max(0, sum('cash'));
  const agent = Math.max(0, sum('agent'));
  return {
    total: spend + cash + agent,
    spendable: spend + cash,
    cashOutable: cash + (opts.agentActive ? agent : 0),
    lockedAgent: opts.agentActive ? 0 : agent,
    nextExpiry:
      soonest?.expiresAt && soonest.remainingCoins
        ? { at: soonest.expiresAt, coins: soonest.remainingCoins }
        : null,
  };
}

/** Writes an `expiry` row for each lapsed earning row. Call with the wallet locked. */
export async function sweepExpired(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  coinUsdCents: number,
): Promise<void> {
  const lapsed = await tx.walletTransaction.findMany({
    where: { userId, pool: 'spend', expiresAt: { lte: now }, remainingCoins: { gt: 0 } },
  });
  for (const lot of lapsed) {
    const coins = lot.remainingCoins ?? 0;
    const wrote = await insertOnce(tx, {
      userId,
      type: 'expiry',
      pool: 'spend',
      coins: -coins,
      coinUsdCents,
      reference: 'Coins expired',
      dedupeKey: `expiry:${lot.id}`,
    });
    if (wrote) {
      await tx.walletTransaction.updateMany({
        where: { id: lot.id, remainingCoins: { gt: 0 } },
        data: { remainingCoins: 0 },
      });
    }
  }
}

/**
 * Inserts one ledger row unless one with this `dedupeKey` exists. ON CONFLICT
 * DO NOTHING rather than catching a unique violation: a failed insert would
 * abort the caller's whole Postgres transaction. Returns whether it wrote.
 */
export async function insertOnce(
  db: Db,
  row: {
    userId: string;
    type: WalletTxnType;
    pool: CoinPool;
    coins: number;
    coinUsdCents: number;
    dedupeKey: string;
    reference?: string;
    expiresAt?: Date;
  },
): Promise<boolean> {
  const { count } = await db.walletTransaction.createMany({
    data: [
      {
        userId: row.userId,
        type: row.type,
        pool: row.pool,
        coins: row.coins,
        usdCents: row.coins * row.coinUsdCents,
        reference: row.reference ?? null,
        dedupeKey: row.dedupeKey,
        ...(row.expiresAt ? { expiresAt: row.expiresAt, remainingCoins: row.coins } : {}),
      },
    ],
    skipDuplicates: true,
  });
  return count === 1;
}

/**
 * Takes `coins` from a person's spendable coins: earned coins first (soonest
 * to expire first), then coins received from clients. The caller holds the
 * wallet lock. Returns false, writing nothing, if there aren't enough.
 */
export async function spendCoins(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    coins: number;
    keyBase: string;
    reference: string;
    coinUsdCents: number;
    now: Date;
  },
): Promise<boolean> {
  const { userId, coins, keyBase, reference, coinUsdCents, now } = input;
  await sweepExpired(tx, userId, now, coinUsdCents);
  const balance = await coinBalance(tx, userId, { agentActive: false, now });
  if (balance.spendable < coins) return false;

  const lots = await tx.walletTransaction.findMany({
    where: { userId, pool: 'spend', expiresAt: { gt: now }, remainingCoins: { gt: 0 } },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
  });
  let left = coins;
  const takes: { lotId: string; coins: number }[] = [];
  for (const lot of lots) {
    if (left === 0) break;
    const take = Math.min(left, lot.remainingCoins ?? 0);
    takes.push({ lotId: lot.id, coins: take });
    left -= take;
  }

  const fromEarned = coins - left;
  if (fromEarned > 0) {
    const debit = await tx.walletTransaction.create({
      data: {
        userId,
        type: 'redeem_debit',
        pool: 'spend',
        coins: -fromEarned,
        usdCents: -fromEarned * coinUsdCents,
        reference,
        dedupeKey: `${keyBase}:spend`,
      },
    });
    for (const take of takes) {
      await tx.walletTransaction.update({
        where: { id: take.lotId },
        data: { remainingCoins: { decrement: take.coins } },
      });
      await tx.walletCoinSpend.create({
        data: { debitTxnId: debit.id, lotTxnId: take.lotId, coins: take.coins },
      });
    }
  }
  if (left > 0) {
    await tx.walletTransaction.create({
      data: {
        userId,
        type: 'redeem_debit',
        pool: 'cash',
        coins: -left,
        usdCents: -left * coinUsdCents,
        reference,
        dedupeKey: `${keyBase}:cash`,
      },
    });
  }
  return true;
}

/**
 * Reverses a redemption's debit rows for the client: earned coins go back
 * into the rows they came from, unless those have expired since (they would
 * only expire again), and cash coins go back to the cash pool. Idempotent.
 */
export async function restoreSpend(
  tx: Prisma.TransactionClient,
  input: { keyBase: string; coinUsdCents: number; now: Date },
): Promise<void> {
  const debits = await tx.walletTransaction.findMany({
    where: { dedupeKey: { in: [`${input.keyBase}:spend`, `${input.keyBase}:cash`] } },
    include: { spentFrom: { include: { lot: true } } },
  });
  for (const debit of debits) {
    const refundKey = `refund:${debit.dedupeKey ?? debit.id}`;
    if (debit.pool === 'cash') {
      await insertOnce(tx, {
        userId: debit.userId,
        type: 'refund',
        pool: 'cash',
        coins: -debit.coins,
        coinUsdCents: input.coinUsdCents,
        dedupeKey: refundKey,
        reference: 'Coins returned: cancelled',
      });
      continue;
    }
    const restorable = debit.spentFrom.filter(
      (spend) => (spend.lot.expiresAt?.getTime() ?? 0) > input.now.getTime(),
    );
    const coins = restorable.reduce((n, spend) => n + spend.coins, 0);
    if (coins === 0) continue;
    const wrote = await insertOnce(tx, {
      userId: debit.userId,
      type: 'refund',
      pool: 'spend',
      coins,
      coinUsdCents: input.coinUsdCents,
      dedupeKey: refundKey,
      reference: 'Coins returned: cancelled',
    });
    if (!wrote) continue;
    for (const spend of restorable) {
      await tx.walletTransaction.update({
        where: { id: spend.lotTxnId },
        data: { remainingCoins: { increment: spend.coins } },
      });
    }
  }
}
