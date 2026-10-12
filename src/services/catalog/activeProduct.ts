import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';

/**
 * D1 · produto pausado pelo lojista (`Product.isActive = false`).
 *
 * Toda leitura PÚBLICA de produto combina este filtro com os próprios critérios (vitrine, busca,
 * ofertas, mais vendidos). No SQL cru da busca, o equivalente é `p."isActive" = true`.
 * A visão do DONO (painel, export, integração) não filtra: o dono precisa ver e reativar o pausado.
 */
export const ACTIVE_PRODUCT_WHERE: { isActive: true } = { isActive: true };

/** O 409 do checkout para item pausado. Mesmo formato do item sem estoque. */
export function pausedProductError(name: string): AppError {
  return new AppError(`${name} não está disponível agora. Tire o item da sacola para continuar.`, 409, true, 'PRODUCT_PAUSED');
}

/**
 * Recusa a compra se algum dos produtos estiver pausado. Lança `PRODUCT_PAUSED` (409) com o nome
 * do primeiro pausado. Produto inexistente não é tratado aqui: o checkout já devolve 404 para ele.
 */
export async function assertProductsActive(productIds: string[]): Promise<void> {
  const ids = [...new Set(productIds.map(String).filter(Boolean))];
  if (ids.length === 0) return;
  const paused = await prisma.product.findFirst({
    where: { id: { in: ids }, isActive: false },
    select: { name: true },
    orderBy: { id: 'asc' },
  });
  if (paused) throw pausedProductError(paused.name);
}
