import api from './api';

export interface CurrentProduct { productId: string; name: string; price: number; image: string | null; storeId?: string; storeName?: string }

export type CurrentProductResult =
  | { status: 'ok'; product: CurrentProduct }
  /** Removido do catálogo, pausado pelo lojista ou loja fora da vitrine (GET devolve 404). */
  | { status: 'gone' }
  | { status: 'soldout'; name: string }
  /** Rede, 429, 5xx: não dá para afirmar nada sobre o produto. */
  | { status: 'error' };

/**
 * Estado ATUAL de um produto, direto do servidor. Preço, nome e foto exibidos e usados na sacola
 * vêm sempre daqui; o que está gravado num pedido antigo é só histórico daquele pedido.
 */
export async function fetchCurrentProduct(productId: string): Promise<CurrentProductResult> {
  try {
    const { data: p } = await api.get(`/products/${encodeURIComponent(productId)}`);
    const price = Number(p?.price);
    if (!p || !Number.isFinite(price)) return { status: 'error' };
    if (p.isActive === false) return { status: 'gone' };
    if (!(Number(p.quantity) > 0)) return { status: 'soldout', name: p.name || 'Produto' };
    return {
      status: 'ok',
      product: { productId, name: p.name || 'Produto', price, image: p.image ?? p.images?.[0] ?? null, storeId: p.storeId, storeName: p.storeName },
    };
  } catch (e: any) {
    return e?.response?.status === 404 ? { status: 'gone' } : { status: 'error' };
  }
}

/** Diferença de pelo menos um centavo. */
export const priceDiffers = (a: number, b: number) => Math.round(a * 100) !== Math.round(b * 100);
