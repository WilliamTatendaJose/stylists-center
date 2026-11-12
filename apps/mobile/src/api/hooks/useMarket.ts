import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  PRODUCT_PAGE_SIZE,
  type DeliveryQuoteDto,
  type CreateOrderInput,
  type CreateOrderResponse,
  type CreateProviderProductInput,
  type RestockProviderProductInput,
  type UpdateProviderProductInput,
  type OrderRowDto,
  type ProductDetailDto,
  type ProductPageDto,
  type ProductCategory,
  type ProductSort,
  type ProviderOrderDto,
  type ProviderProductDto,
  type MarkOrderReadyInput,
  type CreateProductReviewInput,
  type ProductReviewsDto,
  type ApplyVendorInput,
  type VendorApplicationDto,
  type VendorFulfilmentInput,
  type VendorMeDto,
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
export interface MarketFilters {
  category?: ProductCategory;
  minPriceUsdCents?: number;
  maxPriceUsdCents?: number;
  sort?: ProductSort;
}

export function useProducts(debouncedQuery = '', filters: MarketFilters = {}) {
  const location = useSessionStore((s) => s.location);
  const maxDistanceKm = useSessionStore((s) => s.maxDistanceKm);
  const term = debouncedQuery.trim();

  return useInfiniteQuery({
    queryKey: [
      ...PRODUCTS_KEY,
      term,
      location.lat,
      location.lng,
      maxDistanceKm,
      filters.category,
      filters.minPriceUsdCents,
      filters.maxPriceUsdCents,
      filters.sort,
    ],
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
          ...(filters.category ? { category: filters.category } : {}),
          ...(filters.minPriceUsdCents !== undefined
            ? { minPriceUsdCents: String(filters.minPriceUsdCents) }
            : {}),
          ...(filters.maxPriceUsdCents !== undefined
            ? { maxPriceUsdCents: String(filters.maxPriceUsdCents) }
            : {}),
          sort: filters.sort ?? 'nearest',
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

export function useProductReviews(productId: string | undefined) {
  return useQuery({
    enabled: !!productId,
    queryKey: ['market', 'product-reviews', productId],
    queryFn: () => apiFetch<ProductReviewsDto>(`/v1/market/products/${productId}/reviews`),
  });
}

export function useReviewProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      productId,
      input,
    }: {
      orderId: string;
      productId: string;
      input: CreateProductReviewInput;
    }) =>
      apiFetch(`/v1/market/orders/${orderId}/products/${productId}/review`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (_review, variables) => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      void queryClient.invalidateQueries({
        queryKey: ['market', 'product-reviews', variables.productId],
      });
    },
  });
}

export function useMyOrders() {
  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: () => apiFetch<OrderRowDto[]>('/v1/market/orders'),
    refetchInterval: 30_000,
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

const PROVIDER_PRODUCTS_KEY = ['provider', 'products'] as const;
const VENDOR_ORDERS_KEY = ['vendor', 'orders'] as const;
const VENDOR_KEY = ['vendor', 'me'] as const;

export function useProviderProducts(enabled = true) {
  return useQuery({
    enabled,
    queryKey: PROVIDER_PRODUCTS_KEY,
    queryFn: () => apiFetch<ProviderProductDto[]>('/v1/provider/products'),
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

/** The shop's incoming orders (`/v1/vendors/orders`). Works for a vendor-only shop as well as a stylist. */
export function useVendorOrders(enabled = true) {
  return useQuery({
    enabled,
    queryKey: VENDOR_ORDERS_KEY,
    queryFn: () => apiFetch<ProviderOrderDto[]>('/v1/vendors/orders'),
    refetchInterval: 30_000,
  });
}

function useVendorOrderAction<Variables>(
  path: (variables: Variables) => string,
  body?: (variables: Variables) => unknown,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: Variables) =>
      apiFetch<ProviderOrderDto>(path(variables), {
        method: 'POST',
        ...(body ? { body: body(variables) } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENDOR_ORDERS_KEY });
      // A cancelled order puts its stock back.
      void queryClient.invalidateQueries({ queryKey: PROVIDER_PRODUCTS_KEY });
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

/** Packed: ready at the shop, or out for delivery. */
export function useVendorMarkOrderReady() {
  return useVendorOrderAction(
    ({ orderId }: { orderId: string; input: MarkOrderReadyInput }) =>
      `/v1/vendors/orders/${orderId}/ready`,
    ({ input }) => input,
  );
}

/** Handed over (collected or delivered). */
export function useVendorCompleteOrder() {
  return useVendorOrderAction((orderId: string) => `/v1/vendors/orders/${orderId}/complete`);
}

export function useVendorCancelOrder() {
  return useVendorOrderAction((orderId: string) => `/v1/vendors/orders/${orderId}/cancel`);
}

/** `GET /v1/vendors/me` — where the signed-in user stands as a vendor. */
export function useVendorMe() {
  return useQuery({
    queryKey: VENDOR_KEY,
    queryFn: () => apiFetch<VendorMeDto>('/v1/vendors/me'),
  });
}

export function useApplyVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyVendorInput) =>
      apiFetch<VendorApplicationDto>('/v1/vendors/apply', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENDOR_KEY });
      // Applying can create the shop's profile, which changes who the account is.
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useUpdateVendorFulfilment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorFulfilmentInput) =>
      apiFetch<VendorApplicationDto>('/v1/vendors/me/fulfilment', {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VENDOR_KEY });
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

/**
 * `GET /v1/market/delivery-quote` for each delivering shop: what delivery to
 * the picked point costs (per km from the shop). Checkout charges the same.
 */
export function useDeliveryQuotes(
  providerIds: readonly string[],
  point: { lat: number; lng: number } | null,
) {
  return useQueries({
    queries: providerIds.map((providerId) => ({
      enabled: point !== null,
      queryKey: ['market', 'delivery-quote', providerId, point?.lat, point?.lng],
      queryFn: () =>
        apiFetch<DeliveryQuoteDto>(
          `/v1/market/delivery-quote?${new URLSearchParams({
            providerId,
            lat: String(point?.lat),
            lng: String(point?.lng),
          }).toString()}`,
        ),
      staleTime: 5 * 60_000,
    })),
  });
}
