import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  canCancelOrder,
  canCollectOrder,
  canVendorCancelOrder,
  completedStatusFor,
  dispatchedStatusFor,
  formatOrderReference,
  isOrderCompleted,
  billableDeliveryKm,
  coinsToCover,
  deliveryChargeUsdCents as deliveryChargeFor,
  distanceKmBetween,
  effectiveDeliveryPerKmUsdCents,
  type DeliveryQuoteDto,
  orderServiceFeeUsdCents,
  orderTotalUsdCents,
  type CreateOrderInput,
  type CreateOrderResponse,
  type MarkOrderReadyInput,
  type OrderRowDto,
  type ProductDetailDto,
  type ProductPageDto,
  type ProductCategory,
  type ProductSort,
  type CreateProductReviewInput,
  type ProductReviewsDto,
  type ProviderOrderDto,
} from '@sc/shared';
import { Prisma, type OrderStatus } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatusService } from '../payments/payment-status.service';
import { PushService } from '../notifications/push.service';
import { ReminderService } from '../notifications/reminder.service';
import { FeeLedgerService } from '../fees/fee-ledger.service';
import { FeeStandingService } from '../fees/fee-standing.service';
import { RewardsHooksService } from '../rewards/rewards-hooks.service';
import { SettingsService, settingsFor } from '../settings/settings.service';
import {
  amountDue,
  toOrderRow,
  toProductDetail,
  toProductRow,
  toProviderOrder,
  type ProductGeoRow,
} from './mappers';

/**
 * Only approved vendors' products are sold, and a restricted vendor's stock
 * is hidden. `shopPoint` prefers the pin the vendor put on the map for the
 * shop, then the profile's own location, because a shop's distance is where
 * the goods are collected from.
 */
const SHOP_POINT = Prisma.sql`COALESCE(
  CASE WHEN va."shopLat" IS NOT NULL AND va."shopLng" IS NOT NULL
    THEN ST_SetSRID(ST_MakePoint(va."shopLng", va."shopLat"), 4326)::geography END,
  pr.location
)`;

const PRODUCT_COLUMNS = Prisma.sql`
  p.id, p.name, p.description, p.category, p."priceUsdCents", p."stockQty", p."imageUrls",
  pr.id AS "providerId", pr."displayName" AS "providerName",
  pr.tint, pr.initials, COALESCE(pr."profileImageUrl", pr."portfolioImageUrls"[1]) AS "providerImageUrl", pr.verified, pr."areaName",
  COALESCE(va."collectionHours", pr."workingHoursLabel") AS "pickupHours",
  COALESCE(va."collectionAddress", va."shopAddress") AS "pickupAddress",
  va.delivers, va."deliveryChargeUsdCents", va."deliveryPerKmUsdCents", va."deliveryAreas",
  pr."ratingAvg" AS "sellerRatingAvg", pr."completedCount" AS "sellerCompletedCount"`;

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentStatus: PaymentStatusService,
    private readonly push: PushService,
    private readonly fees: FeeLedgerService,
    private readonly standing: FeeStandingService,
    private readonly rewards: RewardsHooksService,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly reminders?: ReminderService,
  ) {}

  /**
   * The catalogue, nearest seller first.
   *
   * Distance comes from the seller's PostGIS location — a buyer may collect
   * in person, so "how far is this" is as much a property of a product as its
   * price, and sorting by anything else would bury the only ones they can
   * realistically fetch.
   *
   * Only approved vendors appear, and a vendor restricted for unpaid fees is
   * hidden until they settle.
   */
  async listProducts(params: {
    lat: number;
    lng: number;
    radiusKm?: number | null;
    searchTerm?: string;
    category?: ProductCategory;
    minPriceUsdCents?: number;
    maxPriceUsdCents?: number;
    sort?: ProductSort;
    limit: number;
    offset: number;
    /** The shopper, whose own products are left out of what they can buy. */
    viewerId?: string;
  }): Promise<ProductPageDto> {
    const {
      viewerId,
      lat,
      lng,
      radiusKm = null,
      searchTerm,
      category,
      minPriceUsdCents,
      maxPriceUsdCents,
      sort = 'nearest',
      limit,
      offset,
    } = params;
    if (
      minPriceUsdCents !== undefined &&
      maxPriceUsdCents !== undefined &&
      minPriceUsdCents > maxPriceUsdCents
    ) {
      throw new BadRequestException('Minimum price cannot exceed maximum price');
    }
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const restricted = await this.standing.restrictedProviderIds();
    const restrictedFilter =
      restricted.length > 0
        ? Prisma.sql`AND p."providerId" NOT IN (${Prisma.join(restricted)})`
        : Prisma.empty;

    const radiusFilter =
      radiusKm === null
        ? Prisma.empty
        : Prisma.sql`AND ST_DWithin(${SHOP_POINT}, ${point}, ${radiusKm * 1000})`;

    const term = searchTerm?.trim();
    const searchFilter =
      term && term.length > 0
        ? Prisma.sql`AND (p.name ILIKE ${`%${term}%`} OR p.description ILIKE ${`%${term}%`} OR word_similarity(${term}, p.name) >= 0.35)`
        : Prisma.empty;
    const categoryFilter = category ? Prisma.sql`AND p.category = ${category}` : Prisma.empty;
    const selfFilter = viewerId ? Prisma.sql`AND pr."userId" <> ${viewerId}` : Prisma.empty;
    const minPriceFilter =
      minPriceUsdCents === undefined
        ? Prisma.empty
        : Prisma.sql`AND p."priceUsdCents" >= ${minPriceUsdCents}`;
    const maxPriceFilter =
      maxPriceUsdCents === undefined
        ? Prisma.empty
        : Prisma.sql`AND p."priceUsdCents" <= ${maxPriceUsdCents}`;
    const sortClause =
      sort === 'price_asc'
        ? Prisma.sql`p."priceUsdCents" ASC, ${SHOP_POINT} <-> ${point}`
        : sort === 'price_desc'
          ? Prisma.sql`p."priceUsdCents" DESC, ${SHOP_POINT} <-> ${point}`
          : sort === 'newest'
            ? Prisma.sql`p."createdAt" DESC`
            : Prisma.sql`${SHOP_POINT} <-> ${point}, p.name`;

    // limit + 1 to detect another page without a second COUNT query that
    // could disagree with the page it describes.
    const rows = await this.prisma.$queryRaw<ProductGeoRow[]>`
      SELECT
        ${PRODUCT_COLUMNS},
        ST_Distance(${SHOP_POINT}, ${point}) / 1000 AS "distanceKm"
      FROM "Product" p
      JOIN "ProviderProfile" pr ON pr.id = p."providerId"
      JOIN "VendorApplication" va ON va."providerId" = pr.id AND va.status = 'approved'
      WHERE p.active = true AND p."stockQty" > 0 ${restrictedFilter} ${radiusFilter} ${searchFilter} ${categoryFilter} ${selfFilter} ${minPriceFilter} ${maxPriceFilter}
      ORDER BY ${sortClause}, p.id
      LIMIT ${limit + 1} OFFSET ${offset}
    `;

    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map(toProductRow),
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  async getProduct(id: string, lat: number, lng: number): Promise<ProductDetailDto> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const restricted = await this.standing.restrictedProviderIds();
    const restrictedFilter =
      restricted.length > 0
        ? Prisma.sql`AND p."providerId" NOT IN (${Prisma.join(restricted)})`
        : Prisma.empty;
    const rows = await this.prisma.$queryRaw<ProductGeoRow[]>`
      SELECT
        ${PRODUCT_COLUMNS},
        ST_Distance(${SHOP_POINT}, ${point}) / 1000 AS "distanceKm"
      FROM "Product" p
      JOIN "ProviderProfile" pr ON pr.id = p."providerId"
      JOIN "VendorApplication" va ON va."providerId" = pr.id AND va.status = 'approved'
      WHERE p.id = ${id} AND p.active = true ${restrictedFilter}
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException('Product not found');
    return toProductDetail(row, await this.standardDeliveryRate());
  }

  /**
   * Places an order and reserves the stock in one atomic step.
   *
   * Everything here happens inside a single transaction with the product rows
   * locked, because the failure this prevents is overselling: two buyers
   * taking the last wig, and one of them arriving to collect (or waiting for
   * a delivery of) something that is gone. Reading stock and then
   * decrementing it as separate statements is exactly the race that produces
   * that.
   *
   * Prices are snapshotted onto the order items from the locked rows, so the
   * total the buyer owes is the total they were shown, even if the seller
   * edits the price a second later. Nothing is charged here: the buyer pays
   * the vendor on delivery or collection. The delivery charge is stored
   * beside the product total, never inside it, because the commission is on
   * products only.
   */
  async createOrder(buyerId: string, input: CreateOrderInput): Promise<CreateOrderResponse> {
    const fulfilment = input.fulfilment ?? 'collection';
    const coins = input.coins ?? 0;
    const deliveryAddress = fulfilment === 'delivery' ? (input.deliveryAddress ?? null) : null;
    if (fulfilment === 'delivery' && !deliveryAddress) {
      throw new BadRequestException('Enter where to deliver');
    }
    const coinUsdCents = coins > 0 ? await this.setting('coinUsdCents') : 0;
    const settings = this.settings ?? settingsFor(this.prisma);
    const [marketplaceFeeBps, marketplaceFeePaidBy, standardDeliveryPerKm] = await Promise.all([
      settings.get('marketplaceFeeBps'),
      settings.get('marketplaceFeePaidBy'),
      settings.get('deliveryPerKmUsdCents'),
    ]);
    const deliveryPoint =
      fulfilment === 'delivery' &&
      input.deliveryLat !== undefined &&
      input.deliveryLng !== undefined
        ? { lat: input.deliveryLat, lng: input.deliveryLng }
        : null;

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize retries for this buyer/request before touching stock. A
      // second request waits for the first to commit.
      // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns `void`,
      // which Prisma's pg adapter cannot deserialize as a result row, so
      // $queryRaw threw on every checkout before any order was written.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`${buyerId}:${input.checkoutKey}`}, 0))
      `;
      const fingerprint = JSON.stringify({
        providerId: input.providerId,
        fulfilment,
        deliveryAddress,
        // Only when sent, so a checkout fingerprinted before per-km delivery
        // still matches on retry.
        ...(deliveryPoint ? { deliveryPoint } : {}),
        coins,
        items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId)),
      });
      const previous = await tx.order.findUnique({
        where: { buyerId_checkoutKey: { buyerId, checkoutKey: input.checkoutKey } },
      });
      if (previous) {
        if (previous.checkoutFingerprint !== fingerprint) {
          throw new BadRequestException('This checkout was changed; please start a new checkout');
        }
        return { created: false as const, response: toCreateResponse(previous) };
      }

      // Inside the transaction but after the replay check: a retried checkout
      // that already succeeded must not start failing because the vendor was
      // restricted a moment later.
      await this.standing.assertCanTrade(input.providerId);

      const seller = await tx.providerProfile.findUnique({
        where: { id: input.providerId },
        include: { vendor: true },
      });
      if (seller?.vendor?.status !== 'approved') {
        throw new BadRequestException("This shop isn't approved to sell yet");
      }
      // A seller buying their own stock would fake sales, reviews and coins.
      if (seller.userId === buyerId) {
        throw new BadRequestException("You can't buy your own products");
      }
      if (fulfilment === 'delivery' && !seller.vendor.delivers) {
        throw new BadRequestException("This shop doesn't deliver. Choose collection instead");
      }

      const productIds = input.items.map((i) => i.productId);
      if (new Set(productIds).size !== productIds.length) {
        throw new BadRequestException('The same product appears more than once');
      }

      // FOR UPDATE: the lock is what makes the check-then-decrement below
      // safe against a concurrent order for the same items.
      const locked = await tx.$queryRaw<
        {
          id: string;
          name: string;
          priceUsdCents: number;
          stockQty: number;
          providerId: string;
          active: boolean;
        }[]
      >`
        SELECT id, name, "priceUsdCents", "stockQty", "providerId", active
        FROM "Product"
        WHERE id IN (${Prisma.join(productIds)})
        ORDER BY id
        FOR UPDATE
      `;

      if (locked.length !== productIds.length) {
        throw new NotFoundException('One of those products no longer exists');
      }

      const lines = input.items.map((item) => {
        const product = locked.find((p) => p.id === item.productId);
        if (!product) throw new NotFoundException('One of those products no longer exists');
        if (!product.active) {
          throw new BadRequestException(`"${product.name}" is no longer for sale`);
        }
        // A single order is delivered or collected from one place, so it cannot span sellers.
        if (product.providerId !== input.providerId) {
          throw new BadRequestException('An order can only contain items from one shop');
        }
        if (item.quantity > product.stockQty) {
          throw new BadRequestException(
            product.stockQty === 0
              ? `"${product.name}" has just sold out`
              : `Only ${String(product.stockQty)} of "${product.name}" left`,
          );
        }
        return { product, quantity: item.quantity };
      });

      const totalUsdCents = orderTotalUsdCents(
        lines.map((l) => ({ priceUsdCents: l.product.priceUsdCents, quantity: l.quantity })),
      );
      // Per km from the shop to the delivery point. An app version from
      // before per-km delivery sends no point and keeps the old flat charge.
      let deliveryChargeUsdCents = 0;
      let deliveryDistanceKm: number | null = null;
      if (fulfilment === 'delivery') {
        if (deliveryPoint) {
          const quote = deliveryQuote(seller, deliveryPoint, standardDeliveryPerKm);
          deliveryChargeUsdCents = quote.chargeUsdCents;
          deliveryDistanceKm = quote.distanceKm;
        } else {
          deliveryChargeUsdCents = seller.vendor.deliveryChargeUsdCents;
        }
      }
      const serviceFeeUsdCents = orderServiceFeeUsdCents(
        totalUsdCents,
        marketplaceFeeBps,
        marketplaceFeePaidBy === 'vendor' ? 'vendor' : 'client',
      );
      const orderAmount = totalUsdCents + deliveryChargeUsdCents + serviceFeeUsdCents;
      if (coins > 0) {
        // Coins pay for the whole order or not at all: no part-payment.
        const coinsForWhole = coinsToCover(orderAmount, coinUsdCents);
        if (coins !== coinsForWhole) {
          throw new BadRequestException(
            coinsForWhole === 0
              ? "Coins can't be used on this order"
              : `Coins pay for the whole order: it takes ${String(coinsForWhole)} coins`,
          );
        }
      }

      for (const line of lines) {
        await tx.product.update({
          where: { id: line.product.id },
          data: { stockQty: { decrement: line.quantity }, version: { increment: 1 } },
        });
      }

      // A database sequence, not a count of existing rows: references must be
      // unique under concurrent checkouts, which a SELECT COUNT cannot promise.
      const sequenceRows = await tx.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('order_reference_seq')
      `;
      const sequence = sequenceRows[0]?.nextval ?? 1n;

      const vendor = seller.vendor;
      const order = await tx.order.create({
        data: {
          reference: formatOrderReference(Number(sequence)),
          buyerId,
          providerId: input.providerId,
          // The buyer pays the vendor directly. The column predates that and
          // still distinguishes old in-app orders, so new ones are 'cash'.
          paymentMethod: 'cash',
          fulfilment,
          deliveryAddress,
          deliveryLat: deliveryPoint?.lat ?? null,
          deliveryLng: deliveryPoint?.lng ?? null,
          deliveryDistanceKm,
          deliveryChargeUsdCents,
          serviceFeeUsdCents,
          checkoutKey: input.checkoutKey,
          checkoutFingerprint: fingerprint,
          // Collection details are snapshotted so a later edit by the vendor
          // can't send the buyer to the wrong place.
          pickupAddress: vendor.collectionAddress ?? vendor.shopAddress,
          pickupHours: vendor.collectionHours ?? seller.workingHoursLabel,
          pickupLat: vendor.shopLat ?? seller.latitude,
          pickupLng: vendor.shopLng ?? seller.longitude,
          totalUsdCents,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              nameSnapshot: l.product.name,
              priceUsdCents: l.product.priceUsdCents,
              quantity: l.quantity,
            })),
          },
        },
      });

      let coinsValueUsdCents = 0;
      if (coins > 0) {
        // In this transaction, so the coins move if and only if the order
        // is placed. Throws (rolling the order back) if the buyer can't cover it.
        const { usdCents } = await this.rewards.redeemForOrder(tx, {
          orderId: order.id,
          buyerId,
          vendorUserId: seller.userId,
          coins,
        });
        if (usdCents < orderAmount) {
          throw new BadRequestException("Coins can't be used on this order");
        }
        // Paid in full; rounding up never records more than the order.
        coinsValueUsdCents = orderAmount;
        await tx.order.update({
          where: { id: order.id },
          data: { coinsUsed: coins, coinsValueUsdCents },
        });
      }

      return {
        created: true as const,
        sellerUserId: seller.userId,
        response: toCreateResponse({ ...order, coinsValueUsdCents }),
      };
    });
    if (result.created) {
      void this.push.sendToUser(result.sellerUserId, {
        title: 'New marketplace order',
        body: `Order ${result.response.reference} is waiting in your shop.`,
        data: { type: 'market.order.created', orderId: result.response.id },
      });
    }
    return result.response;
  }

  /** Polls Paynow for an order paid in the app before payment moved to the vendor; new orders have no payment to poll. */
  async orderPaymentStatus(orderId: string, buyerId: string): Promise<{ status: string }> {
    await this.requireOwnOrder(orderId, buyerId);
    const { status } = await this.paymentStatus.resolve({ orderId });
    return { status };
  }

  async listOrders(buyerId: string): Promise<OrderRowDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { buyerId },
      // toOrderRow is typed against the full relation rows, so the include
      // stays; the cap is what bounds the payload.
      include: { provider: true, items: true, productReviews: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return orders.map(toOrderRow);
  }

  async getProductReviews(productId: string): Promise<ProductReviewsDto> {
    const [summary, reviews] = await Promise.all([
      this.prisma.productReview.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { id: true },
      }),
      this.prisma.productReview.findMany({
        where: { productId },
        include: { buyer: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      averageRating: summary._avg.rating ?? 0,
      count: summary._count.id,
      reviews: reviews.map((review) => ({
        id: review.id,
        buyerName: review.buyer.displayName,
        rating: review.rating,
        text: review.text,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }

  async reviewProduct(
    orderId: string,
    productId: string,
    buyerId: string,
    input: CreateProductReviewInput,
  ) {
    const order = await this.requireOwnOrder(orderId, buyerId);
    if (!isOrderCompleted(order.status)) {
      throw new BadRequestException('Wait until the order arrives before reviewing its products');
    }
    const item = await this.prisma.orderItem.findFirst({ where: { orderId, productId } });
    if (!item) throw new NotFoundException('Product was not in this order');
    const reviewText = input.text?.trim();
    const review = await this.prisma.productReview.upsert({
      where: { orderId_productId: { orderId, productId } },
      create: {
        orderId,
        productId,
        buyerId,
        rating: input.rating,
        text: reviewText?.length ? reviewText : null,
      },
      update: {},
      include: { buyer: { select: { displayName: true } } },
    });
    return {
      id: review.id,
      buyerName: review.buyer.displayName,
      rating: review.rating,
      text: review.text,
      createdAt: review.createdAt.toISOString(),
    };
  }

  /**
   * The buyer confirms they have the goods (picked up, or the delivery
   * arrived). The vendor can do the same from their side; whichever comes
   * first completes the order, and the second is a no-op.
   */
  async collectOrder(orderId: string, buyerId: string): Promise<OrderRowDto> {
    const order = await this.requireOwnOrder(orderId, buyerId);
    if (isOrderCompleted(order.status)) return this.rowById(orderId);
    if (!canCollectOrder(order.status)) {
      throw new BadRequestException(`Cannot confirm an order that is ${order.status}`);
    }
    const completed = await this.completeOrder(orderId, [dispatchedStatusFor(order.fulfilment)]);
    if (!completed) {
      const latest = await this.requireOwnOrder(orderId, buyerId);
      if (!isOrderCompleted(latest.status)) {
        throw new BadRequestException(`Cannot confirm an order that is ${latest.status}`);
      }
    }
    return this.rowById(orderId);
  }

  /** Cancelling restores the stock it was holding — otherwise the item is lost to everyone. */
  async cancelOrder(orderId: string, buyerId: string): Promise<OrderRowDto> {
    const order = await this.requireOwnOrder(orderId, buyerId);
    if (order.status === 'cancelled') return this.rowById(orderId);
    if (!canCancelOrder(order.status)) {
      throw new BadRequestException(`Cannot cancel an order that is ${order.status}`);
    }
    const changed = await this.cancelInTransaction(orderId, ['reserved', 'ready_for_collection']);
    if (!changed) {
      const latest = await this.requireOwnOrder(orderId, buyerId);
      if (latest.status !== 'cancelled') {
        throw new BadRequestException(`Cannot cancel an order that is ${latest.status}`);
      }
    }
    return this.rowById(orderId);
  }

  // ----- The vendor's side of an order -----

  async listVendorOrders(providerId: string): Promise<ProviderOrderDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { providerId },
      include: { items: true, buyer: { select: { displayName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      // The seller screen never needs a shop's full order history.
      take: 100,
    });
    return orders.map(toProviderOrder);
  }

  /** Packed: ready at the shop for a collection order, on its way for a delivery. */
  async markOrderReady(
    orderId: string,
    providerId: string,
    input: MarkOrderReadyInput = {},
  ): Promise<ProviderOrderDto> {
    const order = await this.requireVendorOrder(orderId, providerId);
    const target = dispatchedStatusFor(order.fulfilment);
    if (order.status === target || isOrderCompleted(order.status)) {
      return this.vendorRowById(orderId);
    }
    if (order.status !== 'reserved') {
      throw new BadRequestException(`Cannot prepare an order that is ${order.status}`);
    }
    await this.requireLegacyPaymentCleared(order);

    const pickupNote = input.pickupNote?.trim();
    const updated = await this.prisma.order.updateMany({
      where: { id: orderId, providerId, status: 'reserved' },
      data: { status: target, pickupNote: pickupNote?.length ? pickupNote : null },
    });
    if (updated.count > 0) {
      if (order.fulfilment === 'collection')
        void this.reminders?.schedulePickup(orderId, new Date());
      void this.push.sendToUser(order.buyerId, {
        title: order.fulfilment === 'delivery' ? 'Your order is on its way' : 'Your order is ready',
        body:
          order.fulfilment === 'delivery'
            ? `Order ${order.reference} is out for delivery.`
            : `Order ${order.reference} is ready for collection.`,
        data: { type: 'market.order.ready', orderId },
      });
    }
    return this.vendorRowById(orderId);
  }

  /**
   * The vendor marks the order handed over (collected or delivered). A vendor
   * may complete an order straight from "being prepared", for the buyer who
   * walks in before it was marked ready.
   */
  async completeVendorOrder(orderId: string, providerId: string): Promise<ProviderOrderDto> {
    const order = await this.requireVendorOrder(orderId, providerId);
    if (isOrderCompleted(order.status)) return this.vendorRowById(orderId);
    if (order.status !== 'reserved' && order.status !== dispatchedStatusFor(order.fulfilment)) {
      throw new BadRequestException(`Cannot complete an order that is ${order.status}`);
    }
    const completed = await this.completeOrder(orderId, [
      'reserved',
      dispatchedStatusFor(order.fulfilment),
    ]);
    if (!completed) {
      const latest = await this.requireVendorOrder(orderId, providerId);
      if (!isOrderCompleted(latest.status)) {
        throw new BadRequestException(`Cannot complete an order that is ${latest.status}`);
      }
    }
    return this.vendorRowById(orderId);
  }

  /** A vendor cancels, for example when stock turns out to be damaged or the buyer can't be reached. */
  async cancelVendorOrder(orderId: string, providerId: string): Promise<ProviderOrderDto> {
    const order = await this.requireVendorOrder(orderId, providerId);
    if (order.status === 'cancelled') return this.vendorRowById(orderId);
    if (!canVendorCancelOrder(order.status)) {
      throw new BadRequestException(`Cannot cancel an order that is ${order.status}`);
    }
    const changed = await this.cancelInTransaction(orderId, [
      'reserved',
      'ready_for_collection',
      'out_for_delivery',
    ]);
    if (changed) {
      void this.push.sendToUser(order.buyerId, {
        title: 'Order cancelled',
        body: `The shop cancelled order ${order.reference}.`,
        data: { type: 'market.order.cancelled', orderId },
      });
    } else {
      const latest = await this.requireVendorOrder(orderId, providerId);
      if (latest.status !== 'cancelled') {
        throw new BadRequestException(`Cannot cancel an order that is ${latest.status}`);
      }
    }
    return this.vendorRowById(orderId);
  }

  /**
   * Moves an order from one of `fromStatuses` to collected/delivered and does
   * everything that depends on that, in one transaction: the commission and
   * the buyer's reward coins. The status change is the claim, so two
   * simultaneous confirmations (buyer and vendor) complete it exactly once;
   * the loser gets `false` and nothing is charged twice.
   */
  private async completeOrder(orderId: string, fromStatuses: OrderStatus[]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: { in: fromStatuses } },
        data: { status: completedStatusFor(order.fulfilment), completedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      if (order.paymentMethod === 'ecocash') {
        // Orders paid in the app before payment moved to the vendor still
        // hold money that is released now.
        const funded = await tx.payment.findFirst({
          where: { orderId, status: { in: ['paid', 'held'] } },
        });
        if (!funded) throw new BadRequestException('Payment has not cleared yet');
        await this.settleEscrow(tx, orderId, 'released', true);
      }
      // Product total only: the delivery charge is the vendor's own, not commissionable.
      await this.fees.chargeOrder(tx, {
        providerId: order.providerId,
        orderId,
        productTotalUsdCents: order.totalUsdCents,
      });
      await this.rewards.onOrderCompleted(tx, {
        orderId,
        buyerId: order.buyerId,
        productTotalUsdCents: order.totalUsdCents,
      });
      return true;
    });
  }

  /** Cancelled orders restore their stock and coins and never owe commission. */
  private async cancelInTransaction(
    orderId: string,
    fromStatuses: ('reserved' | 'ready_for_collection' | 'out_for_delivery')[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: orderId, status: { in: fromStatuses } },
        data: { status: 'cancelled' },
      });
      if (result.count === 0) return false;
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity }, version: { increment: 1 } },
        });
      }
      if (order.paymentMethod === 'ecocash') {
        await this.settleEscrow(tx, orderId, 'refunded', false);
      }
      if (order.coinsUsed > 0) {
        await this.rewards.refundRedemption(tx, { orderId });
      }
      return true;
    });
  }

  private async requireLegacyPaymentCleared(order: { id: string; paymentMethod: string }) {
    if (order.paymentMethod !== 'ecocash') return;
    const funded = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: { in: ['paid', 'held'] } },
    });
    if (!funded) throw new BadRequestException('Payment has not cleared yet');
  }

  private async requireOwnOrder(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException();
    return order;
  }

  private async requireVendorOrder(orderId: string, providerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.providerId !== providerId) throw new ForbiddenException();
    return order;
  }

  /**
   * What delivery from a shop to a point costs, for the cart to show before
   * checkout. Checkout works it out again the same way.
   */
  async quoteDelivery(
    providerId: string,
    point: { lat: number; lng: number },
  ): Promise<DeliveryQuoteDto> {
    const seller = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: { vendor: true },
    });
    if (seller?.vendor?.status !== 'approved' || !seller.vendor.delivers) {
      throw new BadRequestException("This shop doesn't deliver");
    }
    return deliveryQuote(seller, point, await this.standardDeliveryRate());
  }

  private async standardDeliveryRate(): Promise<number> {
    return (this.settings ?? settingsFor(this.prisma)).get('deliveryPerKmUsdCents');
  }

  private async setting(key: 'coinUsdCents'): Promise<number> {
    return (this.settings ?? settingsFor(this.prisma)).get(key);
  }

  /**
   * Append-only, matching the booking ledger: a release or refund is a NEW
   * row, never an edit of the held one. `keepsFee` is false on a refund —
   * nothing was delivered, so the platform keeps nothing. Only orders paid in
   * the app before payment moved to the vendor have anything to settle.
   */
  private async settleEscrow(
    tx: Prisma.TransactionClient,
    orderId: string,
    status: 'released' | 'refunded',
    keepsFee: boolean,
  ): Promise<void> {
    const held = await tx.payment.findFirst({
      where: { orderId, status: { in: ['paid', 'held'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!held) return;

    await tx.payment.create({
      data: {
        orderId,
        provider: held.provider,
        status,
        amountUsdCents: held.amountUsdCents,
        feeUsdCents: keepsFee ? held.feeUsdCents : 0,
        externalRef: held.externalRef,
      },
    });
  }

  private async rowById(orderId: string): Promise<OrderRowDto> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { provider: true, items: true, productReviews: true },
    });
    return toOrderRow(order);
  }

  private async vendorRowById(orderId: string): Promise<ProviderOrderDto> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, buyer: { select: { displayName: true, phone: true } } },
    });
    return toProviderOrder(order);
  }
}

/**
 * Per-km delivery from the shop (its pin, or the stylist's location when it
 * has none) to a point: straight-line km, rounded up, at least 1 km.
 */
function deliveryQuote(
  seller: {
    latitude: number;
    longitude: number;
    vendor: {
      shopLat: number | null;
      shopLng: number | null;
      deliveryPerKmUsdCents: number;
    } | null;
  },
  point: { lat: number; lng: number },
  standardRate: number,
): DeliveryQuoteDto {
  const shop =
    seller.vendor?.shopLat != null && seller.vendor.shopLng != null
      ? { lat: seller.vendor.shopLat, lng: seller.vendor.shopLng }
      : { lat: seller.latitude, lng: seller.longitude };
  const km = billableDeliveryKm(distanceKmBetween(shop, point));
  const perKmUsdCents = effectiveDeliveryPerKmUsdCents(
    seller.vendor?.deliveryPerKmUsdCents ?? 0,
    standardRate,
  );
  return { distanceKm: km, perKmUsdCents, chargeUsdCents: deliveryChargeFor(km, perKmUsdCents) };
}

/** The checkout response, rebuilt from a stored order so a replayed request gets the same answer. */
function toCreateResponse(order: {
  id: string;
  reference: string;
  totalUsdCents: number;
  deliveryChargeUsdCents: number;
  coinsValueUsdCents: number;
  serviceFeeUsdCents: number;
}): CreateOrderResponse {
  return {
    id: order.id,
    reference: order.reference,
    totalUsdCents: order.totalUsdCents,
    deliveryChargeUsdCents: order.deliveryChargeUsdCents,
    coinsValueUsdCents: order.coinsValueUsdCents,
    serviceFeeUsdCents: order.serviceFeeUsdCents,
    amountDueUsdCents: amountDue(order),
  };
}
