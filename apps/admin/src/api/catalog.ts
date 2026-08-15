import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCategoryRowDto, AdminCityRowDto, CityInput, CreateCategoryInput, UpdateCategoryInput } from '@sc/shared';
import { apiFetch } from './client';

const CATEGORIES_KEY = ['admin', 'catalog', 'categories'] as const;
const CITIES_KEY = ['admin', 'catalog', 'cities'] as const;

export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => apiFetch<AdminCategoryRowDto[]>('/v1/admin/catalog/categories'),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      apiFetch<AdminCategoryRowDto>('/v1/admin/catalog/categories', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
}

export function useUpdateCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCategoryInput) =>
      apiFetch<AdminCategoryRowDto>(`/v1/admin/catalog/categories/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/admin/catalog/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
}

export function useCities() {
  return useQuery({
    queryKey: CITIES_KEY,
    queryFn: () => apiFetch<AdminCityRowDto[]>('/v1/admin/catalog/cities'),
  });
}

export function useCreateCity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CityInput) => apiFetch<AdminCityRowDto>('/v1/admin/catalog/cities', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
    },
  });
}

export function useUpdateCity(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CityInput) =>
      apiFetch<AdminCityRowDto>(`/v1/admin/catalog/cities/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
    },
  });
}

export function useDeleteCity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/admin/catalog/cities/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
    },
  });
}
