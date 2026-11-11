/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars --
   Interface stubs: the rewards workstream replaces these bodies. Remove this
   line when it does. */
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';

/**
 * Where bookings and the marketplace tell the rewards programme something
 * happened. Kept separate so those flows don't depend on how coins work.
 *
 * Stubs for now: the rewards workstream fills these in. Every method is
 * called inside the caller's transaction (`tx`) so coins move if and only if
 * the booking or order change commits, and must be idempotent per
 * booking/order.
 */
@Injectable()
export class RewardsHooksService {
  /** A booking reached `completed`. Clients earn coins on the amount they paid. */
  async onBookingCompleted(
    _tx: Prisma.TransactionClient,
    _input: { bookingId: string; clientId: string; amountPaidUsdCents: number },
  ): Promise<void> {
    // Filled in by the rewards workstream.
  }

  /**
   * An order was delivered or collected. The buyer earns coins, and the
   * agent whose code the buyer used earns on it while the referral lasts.
   */
  async onOrderCompleted(
    _tx: Prisma.TransactionClient,
    _input: { orderId: string; buyerId: string; productTotalUsdCents: number },
  ): Promise<void> {
    // Filled in by the rewards workstream.
  }

  /**
   * A client pays part of a booking with coins: debit the client and credit
   * the stylist the same number of coins (the stylist cashes them out at
   * month end). Returns the cash value taken off what the client pays the
   * stylist. Throws if the client doesn't have enough coins.
   */
  async redeemForBooking(
    _tx: Prisma.TransactionClient,
    _input: { bookingId: string; clientId: string; providerUserId: string; coins: number },
  ): Promise<{ usdCents: number }> {
    throw new BadRequestException('Paying with coins is not available yet');
  }

  /** Same as redeemForBooking, for a marketplace order paid partly with coins. */
  async redeemForOrder(
    _tx: Prisma.TransactionClient,
    _input: { orderId: string; buyerId: string; vendorUserId: string; coins: number },
  ): Promise<{ usdCents: number }> {
    throw new BadRequestException('Paying with coins is not available yet');
  }

  /** A booking or order that used coins was cancelled: give the client's coins back. */
  async refundRedemption(
    _tx: Prisma.TransactionClient,
    _ref: { bookingId: string } | { orderId: string },
  ): Promise<void> {
    // Filled in by the rewards workstream.
  }
}
