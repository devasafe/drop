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
  // id = categoryId (p/ filtrar); label = nome legível da categoria (fallback
  // pro id se o nome não veio). Evita mostrar o cuid nos filtros.
  const map = new Map<string, string>();
  (products || []).forEach((p) => {
    const id = categoryOf(p);
    if (!id) return;
    if (!map.has(id)) map.set(id, (p?.categoryName || p?.category?.name || id).toString());
  });
  return [...map.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, label]) => ({ id, label }));
}

export function mapProductCard(product: any, storeName?: string): ProductCardData {
  const price = Number(product?.price) || 0;
  const oldRaw = Number(product?.oldPrice);
  // Só é "desconto" quando o preço antigo é maior que o atual.
  const hasDiscount = isFinite(oldRaw) && oldRaw > price && price > 0;
  return {
    name: product?.name,
    store: storeName,
    imageUrl: imageUrl(product?.image) || undefined,
    price,
    oldPrice: hasDiscount ? oldRaw : undefined,
    discountPercent: hasDiscount ? Math.round((1 - price / oldRaw) * 100) : undefined,
  };
}
