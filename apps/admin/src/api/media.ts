const API_ORIGIN = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');

export function adminAssetUrl(path: string): string {
  return /^https?:\/\//i.test(path)
    ? path
    : `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
