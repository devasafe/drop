import { imageUrl } from './config';
import type { ProductCardData } from '../components/drop/ProductCard';

const norm = (s: string) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function matchesQuery(text: string, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  return norm(text).includes(q);
}

export function filterStores(stores: any[], query: string): any[] {
  return (stores || []).filter((s) => matchesQuery(s?.name, query));
}

function categoryOf(p: any): string {
  return (p?.categoryId || p?.category || '').toString();
}

export function filterProducts(products: any[], query: string, categoryId?: string): any[] {
  return (products || []).filter((p) => {
    if (!matchesQuery(p?.name, query)) return false;
    if (categoryId && categoryOf(p) !== categoryId) return false;
    return true;
  });
}

export function productCategories(products: any[]): { id: string; label: string }[] {
  const set = new Set<string>();
  (products || []).forEach((p) => { const c = categoryOf(p); if (c) set.add(c); });
  return [...set].sort((a, b) => a.localeCompare(b)).map((c) => ({ id: c, label: c }));
}

export function mapProductCard(product: any, storeName?: string): ProductCardData {
  return {
    name: product?.name,
    store: storeName,
    imageUrl: imageUrl(product?.image) || undefined,
    price: Number(product?.price) || 0,
  };
}
