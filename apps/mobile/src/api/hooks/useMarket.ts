import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PRODUCT_PAGE_SIZE,
  type CreateOrderInput,
  type CreateOrderResponse,
  type OrderRowDto,
  type ProductDetailDto,
  type ProductPageDto,
} from '@sc/shared';
import { apiFetch } from '../client.js';
import { useSessionStore } from '../../state/index.js';

const ORDERS_KEY = ['market', 'orders'] as const;

/** Anything that changes stock invalidates the catalogue, so a sold-out item disappears without a manual refresh. */
const PRODUCTS_KEY = ['market', 'products'] as const;

/**
 * `GET /v1/market/products` — the catalogue, nearest seller first and scoped
 * to the same max distance as the rest of the app. A buyer collects in
 * person, so distance is as much a property of a product as its price.
 */
export function useProducts(debouncedQuery = '') {
  const location = useSessionStore((s) => s.location);
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);
  const term = debouncedQuery.trim();

  return useInfiniteQuery({
    queryKey: [...PRODUCTS_KEY, term, location.lat, location.lng, maxDistanceKm],
    initialPageParam: 0,
    getNextPageParam: (last: ProductPageDto) => last.nextOffset,
    queryFn: ({ pageParam }) =>
      apiFetch<ProductPageDto>(
        `/v1/market/products?${new URLSearchParams({
          lat: String(location.lat),
          lng: String(location.lng),
          radiusKm: String(maxDistanceKm),
          limit: String(PRODUCT_PAGE_SIZE),
          offset: String(pageParam),
          ...(term.length >= 2 ? { q: term } : {}),
        }).toString()}`,
      ),
  });
}

export function useProduct(id: string | undefined) {
  const location = useSessionStore((s) => s.location);

  return useQuery({
    enabled: !!id,
    queryKey: ['market', 'product', id, location.lat, location.lng],
    queryFn: () =>
      apiFetch<ProductDetailDto>(
        `/v1/market/products/${String(id)}?${new URLSearchParams({
          lat: String(location.lat),
          lng: String(location.lng),
        }).toString()}`,
      ),
  });
}

export function useMyOrders() {
  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: () => apiFetch<OrderRowDto[]>('/v1/market/orders'),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOrderInput) =>
      apiFetch<CreateOrderResponse>('/v1/market/orders', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      // The order just consumed stock — the catalogue is now stale.
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

export function useCollectOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<OrderRowDto>(`/v1/market/orders/${orderId}/collect`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<OrderRowDto>(`/v1/market/orders/${orderId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      // Cancelling puts the stock back, so the catalogue changed too.
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}
