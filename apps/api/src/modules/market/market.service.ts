import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canCancelOrder,
  canCollectOrder,
  formatOrderReference,
  normalizePhone,
  orderTotalUsdCents,
  type CreateOrderInput,
  type CreateOrderResponse,
  type OrderRowDto,
  type ProductDetailDto,
  type ProductPageDto,
  type ProductCategory,
  type ProductSort,
  type CreateProductReviewInput,
  type ProductReviewsDto,
} from '@sc/shared';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_GATEWAY, type PaymentGatewayPort } from '../payments/payment-gateway.port';
import { PaymentStatusService } from '../payments/payment-status.service';
import { PushService } from '../notifications/push.service';
import { Inject } from '@nestjs/common';
import { toOrderRow, toProductDetail, toProductRow, type ProductGeoRow } from './mappers';

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayPort,
    private readonly paymentStatus: PaymentStatusService,
    private readonly push: PushService,
  ) {}

  /**
   * The catalogue, nearest seller first.
   *
   * Distance comes from the seller's PostGIS location — a buyer collects in
   * person, so "how far is this" is as much a property of a product as its
   * price, and sorting by anything else would bury the only ones they can
   * realistically fetch.
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
  }): Promise<ProductPageDto> {
    const {
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

    const radiusFilter =
      radiusKm === null
        ? Prisma.empty
        : Prisma.sql`AND ST_DWithin(pr.location, ${point}, ${radiusKm * 1000})`;

    const term = searchTerm?.trim();
    const searchFilter =
      term && term.length > 0
        ? Prisma.sql`AND (p.name ILIKE ${`%${term}%`} OR p.description ILIKE ${`%${term}%`} OR word_similarity(${term}, p.name) >= 0.35)`
        : Prisma.empty;
    const categoryFilter = category ? Prisma.sql`AND p.category = ${category}` : Prisma.empty;
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
        ? Prisma.sql`p."priceUsdCents" ASC, pr.location <-> ${point}`
        : sort === 'price_desc'
          ? Prisma.sql`p."priceUsdCents" DESC, pr.location <-> ${point}`
          : sort === 'newest'
            ? Prisma.sql`p."createdAt" DESC`
            : Prisma.sql`pr.location <-> ${point}, p.name`;

    // limit + 1 to detect another page without a second COUNT query that
    // could disagree with the page it describes.
    const rows = await this.prisma.$queryRaw<ProductGeoRow[]>`
      SELECT
        p.id, p.name, p.description, p.category, p."priceUsdCents", p."stockQty", p."imageUrls",
        pr.id AS "providerId", pr."displayName" AS "providerName",
        pr.tint, pr.initials, COALESCE(pr."profileImageUrl", pr."portfolioImageUrls"[1]) AS "providerImageUrl", pr.verified, pr."areaName", pr."workingHoursLabel" AS "pickupHours", pr."ratingAvg" AS "sellerRatingAvg", pr."completedCount" AS "sellerCompletedCount",
        ST_Distance(pr.location, ${point}) / 1000 AS "distanceKm"
      FROM "Product" p
      JOIN "ProviderProfile" pr ON pr.id = p."providerId"
      WHERE p.active = true AND p."stockQty" > 0 ${radiusFilter} ${searchFilter} ${categoryFilter} ${minPriceFilter} ${maxPriceFilter}
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
    const rows = await this.prisma.$queryRaw<ProductGeoRow[]>`
      SELECT
        p.id, p.name, p.description, p.category, p."priceUsdCents", p."stockQty", p."imageUrls",
        pr.id AS "providerId", pr."displayName" AS "providerName",
        pr.tint, pr.initials, COALESCE(pr."profileImageUrl", pr."portfolioImageUrls"[1]) AS "providerImageUrl", pr.verified, pr."areaName", pr."workingHoursLabel" AS "pickupHours", pr."ratingAvg" AS "sellerRatingAvg", pr."completedCount" AS "sellerCompletedCount",
        ST_Distance(pr.location, ${point}) / 1000 AS "distanceKm"
      FROM "Product" p
      JOIN "ProviderProfile" pr ON pr.id = p."providerId"
      WHERE p.id = ${id} AND p.active = true
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException('Product not found');
    return toProductDetail(row);
  }

  /**
   * Places an order and reserves the stock in one atomic step.
   *
   * Everything here happens inside a single transaction with the product rows
   * locked, because the failure this prevents is overselling: two buyers
   * taking the last wig, both being charged, and one of them arriving to
   * collect something that is gone. Reading stock and then decrementing it as
   * separate statements is exactly the race that produces that.
   *
   * Prices are snapshotted onto the order items from the locked rows, so the
   * total the buyer is charged is the total they were shown, even if the
   * seller edits the price a second later.
   */
  async createOrder(buyerId: string, input: CreateOrderInput): Promise<CreateOrderResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize retries for this buyer/request before touching stock or the
      // payment gateway. A second request waits for the first to commit.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`${buyerId}:${input.checkoutKey}`}, 0))
      `;
      const fingerprint = JSON.stringify({
        providerId: input.providerId,
        paymentMethod: input.paymentMethod,
        payerPhone: input.payerPhone ?? null,
        items: [...input.items].sort((a, b) => a.productId.localeCompare(b.productId)),
      });
      const previous = await tx.order.findUnique({
        where: { buyerId_checkoutKey: { buyerId, checkoutKey: input.checkoutKey } },
      });
      if (previous) {
        if (previous.checkoutFingerprint !== fingerprint) {
          throw new BadRequestException('This checkout was changed; please start a new checkout');
        }
        return {
          created: false as const,
          response: {
            id: previous.id,
            reference: previous.reference,
            totalUsdCents: previous.totalUsdCents,
            ...(previous.checkoutUrl ? { checkoutUrl: previous.checkoutUrl } : {}),
            ...(previous.checkoutInstructions
              ? { instructions: previous.checkoutInstructions }
              : {}),
          },
        };
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
        // A single order is collected from one place, so it cannot span sellers.
        if (product.providerId !== input.providerId) {
          throw new BadRequestException('An order can only contain items from one stylist');
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

      for (const line of lines) {
        await tx.product.update({
          where: { id: line.product.id },
          data: { stockQty: { decrement: line.quantity }, version: { increment: 1 } },
        });
      }

      const totalUsdCents = orderTotalUsdCents(
        lines.map((l) => ({ priceUsdCents: l.product.priceUsdCents, quantity: l.quantity })),
      );

      // A database sequence, not a count of existing rows: references must be
      // unique under concurrent checkouts, which a SELECT COUNT cannot promise.
      const sequenceRows = await tx.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('order_reference_seq')
      `;
      const sequence = sequenceRows[0]?.nextval ?? 1n;
      const pickup = await tx.providerProfile.findUniqueOrThrow({
        where: { id: input.providerId },
        select: {
          userId: true,
          areaName: true,
          workingHoursLabel: true,
          latitude: true,
          longitude: true,
        },
      });

      const order = await tx.order.create({
        data: {
          reference: formatOrderReference(Number(sequence)),
          buyerId,
          providerId: input.providerId,
          paymentMethod: input.paymentMethod,
          checkoutKey: input.checkoutKey,
          checkoutFingerprint: fingerprint,
          pickupAddress: pickup.areaName,
          pickupHours: pickup.workingHoursLabel,
          pickupLat: pickup.latitude,
          pickupLng: pickup.longitude,
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

      let checkoutUrl: string | undefined;
      let instructions: string | undefined;
      if (input.paymentMethod === 'ecocash') {
        const buyer = await tx.user.findUniqueOrThrow({
          where: { id: buyerId },
          select: { phone: true },
        });
        // The number the buyer typed at checkout, which need not be the line
        // they log in with. Normalised so the adapter always receives E.164.
        const payerPhone = input.payerPhone ? normalizePhone(input.payerPhone) : null;
        const paymentPhone = payerPhone ?? buyer.phone;
        if (!paymentPhone) {
          throw new BadRequestException('Enter the EcoCash phone number for this payment');
        }
        const intent = await this.paymentGateway.createCheckout({
          reference: order.reference,
          amountUsdCents: totalUsdCents,
          description: `Market order ${order.reference}`,
          phone: paymentPhone,
          allowHostedCheckout: false,
        });
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: intent.provider,
            status: intent.status,
            amountUsdCents: totalUsdCents,
            externalRef: intent.externalRef,
            reference: order.reference,
          },
        });
        checkoutUrl = intent.checkoutUrl;
        instructions = intent.instructions;
        await tx.order.update({
          where: { id: order.id },
          data: { checkoutUrl: checkoutUrl ?? null, checkoutInstructions: instructions ?? null },
        });
      }

      return {
        created: true as const,
        sellerUserId: pickup.userId,
        response: {
          id: order.id,
          reference: order.reference,
          totalUsdCents,
          ...(checkoutUrl ? { checkoutUrl } : {}),
          ...(instructions ? { instructions } : {}),
        },
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

  /** Polls Paynow for an in-flight order payment — the cart's waiting screen calls this. */
  async orderPaymentStatus(orderId: string, buyerId: string): Promise<{ status: string }> {
    await this.requireOwnOrder(orderId, buyerId);
    const { status } = await this.paymentStatus.resolve({ orderId });
    return { status };
  }

  async listOrders(buyerId: string): Promise<OrderRowDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { buyerId },
      include: { provider: true, items: true, productReviews: true },
      orderBy: { createdAt: 'desc' },
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
    if (order.status !== 'collected') {
      throw new BadRequestException('Collect the order before reviewing its products');
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

  /** Buyer confirms they physically have the goods — the moment escrow is released. */
  async collectOrder(orderId: string, buyerId: string): Promise<OrderRowDto> {
    const order = await this.requireOwnOrder(orderId, buyerId);
    if (order.status === 'collected') return this.rowById(orderId);
    if (!canCollectOrder(order.status)) {
      throw new BadRequestException(`Cannot collect an order that is ${order.status}`);
    }

    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: orderId, buyerId, status: 'ready_for_collection' },
        data: { status: 'collected' },
      });
      if (result.count === 0) return false;
      if (order.paymentMethod === 'ecocash') {
        const funded = await tx.payment.findFirst({
          where: { orderId, status: { in: ['paid', 'held'] } },
        });
        if (!funded) throw new BadRequestException('Payment has not cleared yet');
        await this.settleEscrow(tx, orderId, 'released', true);
      }
      return true;
    });
    if (!changed) {
      const latest = await this.requireOwnOrder(orderId, buyerId);
      if (latest.status !== 'collected') {
        throw new BadRequestException(`Cannot collect an order that is ${latest.status}`);
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

    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: orderId, buyerId, status: { in: ['reserved', 'ready_for_collection'] } },
        data: { status: 'cancelled' },
      });
      if (result.count === 0) return false;
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
      return true;
    });
    if (!changed) {
      const latest = await this.requireOwnOrder(orderId, buyerId);
      if (latest.status !== 'cancelled') {
        throw new BadRequestException(`Cannot cancel an order that is ${latest.status}`);
      }
    }
    return this.rowById(orderId);
  }

  private async requireOwnOrder(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException();
    return order;
  }

  /**
   * Append-only, matching the booking ledger: a release or refund is a NEW
   * row, never an edit of the held one. `keepsFee` is false on a refund —
   * nothing was delivered, so the platform keeps nothing.
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
}
