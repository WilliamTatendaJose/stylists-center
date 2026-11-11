/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars --
   Interface stub: the billing workstream replaces these bodies. */
import { Injectable } from '@nestjs/common';

/**
 * Whether a stylist or vendor may take new bookings or sales, given their fee
 * balance (a balance unpaid `feeRestrictAfterDays` after its due date
 * restricts the account).
 *
 * Stub for now: everyone may trade. The billing workstream implements it.
 * Bookings and the marketplace already call `assertCanTrade` before
 * accepting a new booking or order, so the rule takes effect everywhere once
 * implemented.
 */
@Injectable()
export class FeeStandingService {
  /** Throws a ForbiddenException with a user-facing message when restricted. */
  async assertCanTrade(_providerId: string): Promise<void> {
    // Filled in by the billing workstream.
  }

  /** For listings: providers to hide from search and smart match. */
  async restrictedProviderIds(): Promise<string[]> {
    return [];
  }
}
