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
  orderTotalUsdCents,
  platformFeeCents,
  type CreateOrderInput,
  type CreateOrderResponse,
  type OrderRowDto,
  type ProductDetailDto,
  type ProductPageDto,
} from '@sc/shared';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_GATEWAY } from '../payments/payments.module';
import type { PaymentGatewayPort } from '../payments/payment-gateway.port';
import { Inject } from '@nestjs/common';
import { toOrderRow, toProductDetail, toProductRow, type ProductGeoRow } from './mappers';

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayPort,
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
    limit: number;
    offset: number;
  }): Promise<ProductPageDto> {
    const { lat, lng, radiusKm = null, searchTerm, limit, offset } = params;
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

    // limit + 1 to detect another page without a second COUNT query that
    // could disagree with the page it describes.
    const rows = await this.prisma.$queryRaw<ProductGeoRow[]>`
      SELECT
        p.id, p.name, p.description, p."priceUsdCents", p."stockQty", p."imageUrls",
        pr.id AS "providerId", pr."displayName" AS "providerName",
        pr.tint, pr.initials, pr.verified, pr."areaName",
        ST_Distance(pr.location, ${point}) / 1000 AS "distanceKm"
      FROM "Product" p
      JOIN "ProviderProfile" pr ON pr.id = p."providerId"
      WHERE p.active = true AND p."stockQty" > 0 ${radiusFilter} ${searchFilter}
      ORDER BY pr.location <-> ${point}, p.name
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
        p.id, p.name, p.description, p."priceUsdCents", p."stockQty", p."imageUrls",
        pr.id AS "providerId", pr."displayName" AS "providerName",
        pr.tint, pr.initials, pr.verified, pr."areaName",
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
    return this.prisma.$transaction(async (tx) => {
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
          data: { stockQty: { decrement: line.quantity } },
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

      const order = await tx.order.create({
        data: {
          reference: formatOrderReference(Number(sequence)),
          buyerId,
          providerId: input.providerId,
          paymentMethod: input.paymentMethod,
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

      if (input.paymentMethod === 'ecocash') {
        const intent = await this.paymentGateway.chargeToEscrow(totalUsdCents);
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: 'ecocash',
            status: intent.status,
            amountUsdCents: totalUsdCents,
            feeUsdCents: platformFeeCents(totalUsdCents),
            externalRef: intent.externalRef,
          },
        });
      }

      return { id: order.id, reference: order.reference, totalUsdCents };
    });
  }

  async listOrders(buyerId: string): Promise<OrderRowDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { buyerId },
      include: { provider: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(toOrderRow);
  }

  /** Buyer confirms they physically have the goods — the moment escrow is released. */
  async collectOrder(orderId: string, buyerId: string): Promise<OrderRowDto> {
    const order = await this.requireOwnOrder(orderId, buyerId);
    if (!canCollectOrder(order.status)) {
      throw new BadRequestException(`Cannot collect an order that is ${order.status}`);
    }

    await this.prisma.order.update({ where: { id: orderId }, data: { status: 'collected' } });
    if (order.paymentMethod === 'ecocash') {
      await this.settleEscrow(orderId, 'released', true);
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

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        });
      }
    });

    if (order.paymentMethod === 'ecocash') {
      await this.settleEscrow(orderId, 'refunded', false);
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
    orderId: string,
    status: 'released' | 'refunded',
    keepsFee: boolean,
  ): Promise<void> {
    const held = await this.prisma.payment.findFirst({
      where: { orderId, status: 'held' },
      orderBy: { createdAt: 'desc' },
    });
    if (!held) return;

    await this.prisma.payment.create({
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
      include: { provider: true, items: true },
    });
    return toOrderRow(order);
  }
}
