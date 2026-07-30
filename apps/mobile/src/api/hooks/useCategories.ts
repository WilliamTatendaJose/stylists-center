import { useQuery } from '@tanstack/react-query';
import { CATEGORIES } from '../../fixtures/index.js';
import { mockDelay } from '../mockDelay.js';

/**
 * Reads from @sc/shared-shaped fixtures today; Phase 3 swaps the queryFn for
 * `GET /v1/categories` and nothing else in any screen changes (plan §9).
 */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => mockDelay(CATEGORIES),
  });
}
