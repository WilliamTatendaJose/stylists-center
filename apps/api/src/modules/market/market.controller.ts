import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MarketService } from './market.service';
import { CreateOrderDto, ProductDetailQueryDto, ProductsQueryDto } from './dto';

/** Signed-in only, for the same reason as the stylist catalogue: these rows carry seller identity and position. */
@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(private readonly market: MarketService) {}

  // Declared before ':id' — Nest matches in registration order, so a literal
  // segment must come first or the dynamic one swallows it.
  @Get('products')
  listProducts(@Query() query: ProductsQueryDto) {
    return this.market.listProducts({
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm ?? null,
      ...(query.q ? { searchTerm: query.q } : {}),
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string, @Query() query: ProductDetailQueryDto) {
    return this.market.getProduct(id, query.lat, query.lng);
  }

  @Get('orders')
  listOrders(@CurrentUser() user: { id: string }) {
    return this.market.listOrders(user.id);
  }

  @Post('orders')
  createOrder(@CurrentUser() user: { id: string }, @Body() dto: CreateOrderDto) {
    return this.market.createOrder(user.id, dto);
  }

  @Post('orders/:id/collect')
  collectOrder(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.market.collectOrder(id, user.id);
  }

  @Post('orders/:id/cancel')
  cancelOrder(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.market.cancelOrder(id, user.id);
  }
}
