import { useQuery } from '@tanstack/react-query';
import type { AdminBookingDetailDto, AdminLookupResultDto, AdminOrderDetailDto } from '@sc/shared';
import { apiFetch } from './client';

export function useLookupSearch(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ['admin', 'lookup', 'search', trimmed],
    queryFn: () => apiFetch<AdminLookupResultDto>(`/v1/admin/lookup?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length > 0,
  });
}

export function useBookingDetail(id: string) {
  return useQuery({
    queryKey: ['admin', 'lookup', 'booking', id],
    queryFn: () => apiFetch<AdminBookingDetailDto>(`/v1/admin/lookup/bookings/${id}`),
  });
}

export function useOrderDetail(id: string) {
  return useQuery({
    queryKey: ['admin', 'lookup', 'order', id],
    queryFn: () => apiFetch<AdminOrderDetailDto>(`/v1/admin/lookup/orders/${id}`),
  });
}
