import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PRODUCT_PAGE_SIZE,
  type CreateOrderInput,
  type CreateOrderResponse,
  type CreateProviderProductInput,
  type RestockProviderProductInput,
  type UpdateProviderProductInput,
  type OrderPaymentStatusDto,
  type OrderRowDto,
  type ProductDetailDto,
  type ProductPageDto,
  type ProviderOrderDto,
  type ProviderProductDto,
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

const TERMINAL_PAYMENT_STATUSES = new Set<OrderPaymentStatusDto['status']>([
  'held',
  'paid',
  'released',
  'refunded',
  'failed',
  'disputed',
]);

/** Widened to `string` so a screen holding statuses in local state needn't re-narrow them. */
export function isTerminalOrderPayment(status: string | undefined) {
  return Boolean(
    status && TERMINAL_PAYMENT_STATUSES.has(status as OrderPaymentStatusDto['status']),
  );
}

/**
 * Polls one order's payment while its EcoCash prompt is outstanding. A cart
 * spanning several sellers places one order each, so the waiting screen runs
 * one of these per order and only calls the checkout done when all have
 * settled.
 */
export function useOrderPaymentStatus(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['order-payment-status', orderId],
    queryFn: () => apiFetch<OrderPaymentStatusDto>(`/v1/market/orders/${orderId}/payment-status`),
    enabled: Boolean(orderId) && enabled,
    refetchInterval: (query) => (isTerminalOrderPayment(query.state.data?.status) ? false : 3000),
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

const PROVIDER_PRODUCTS_KEY = ['provider', 'products'] as const;
const PROVIDER_ORDERS_KEY = ['provider', 'orders'] as const;

export function useProviderProducts() {
  return useQuery({
    queryKey: PROVIDER_PRODUCTS_KEY,
    queryFn: () => apiFetch<ProviderProductDto[]>('/v1/provider/products'),
  });
}

export function useProviderOrders() {
  return useQuery({
    queryKey: PROVIDER_ORDERS_KEY,
    queryFn: () => apiFetch<ProviderOrderDto[]>('/v1/provider/orders'),
    refetchInterval: 30_000,
  });
}

export function useCreateProviderProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProviderProductInput) =>
      apiFetch<ProviderProductDto>('/v1/provider/products', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_PRODUCTS_KEY });
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

function useInvalidateProviderProducts() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: PROVIDER_PRODUCTS_KEY });
    void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
  };
}

export function useUpdateProviderProduct() {
  const invalidate = useInvalidateProviderProducts();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProviderProductInput }) =>
      apiFetch<ProviderProductDto>(`/v1/provider/products/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export function useRestockProviderProduct() {
  const invalidate = useInvalidateProviderProducts();
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string } & RestockProviderProductInput) =>
      apiFetch<ProviderProductDto>(`/v1/provider/products/${id}/restock`, {
        method: 'POST',
        body: { quantity },
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteProviderProduct() {
  const invalidate = useInvalidateProviderProducts();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/v1/provider/products/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useProviderMarkOrderReady() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<void>(`/v1/provider/orders/${orderId}/ready`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROVIDER_ORDERS_KEY });
    },
  });
}
