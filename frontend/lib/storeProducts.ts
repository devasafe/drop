import api from './api';

/** Teto de `limit` aceito por GET /products. */
export const PRODUCTS_PAGE_LIMIT = 100;

/** Trava de segurança: nunca mais que isso de páginas numa só carga. */
const MAX_PAGES = 50;

/**
 * Todos os produtos de uma loja: GET /products?storeId=…&limit=100 percorrendo as páginas
 * até `pagination.pages`. O backend já aplica os gates de KYC e de mensalidade.
 */
export async function fetchAllStoreProducts(storeId: string): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await api.get(
      `/products?storeId=${encodeURIComponent(storeId)}&limit=${PRODUCTS_PAGE_LIMIT}&page=${page}`
    );
    const items = res.data?.products;
    if (Array.isArray(items)) all.push(...items);
    pages = Number(res.data?.pagination?.pages) || 1;
    page += 1;
  } while (page <= pages && page <= MAX_PAGES);
  return all;
}
