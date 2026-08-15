import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminReviewRowDto } from '@sc/shared';
import { apiFetch } from './client';

const REVIEWS_KEY = ['admin', 'reviews'] as const;

export function useReviews() {
  return useQuery({
    queryKey: REVIEWS_KEY,
    queryFn: () => apiFetch<AdminReviewRowDto[]>('/v1/admin/reviews'),
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/admin/reviews/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REVIEWS_KEY });
    },
  });
}
