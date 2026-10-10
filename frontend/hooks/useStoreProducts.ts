import { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { fetchAllStoreProducts } from '../lib/storeProducts';

/**
 * Produtos de UMA loja (todas as páginas de GET /products?storeId=…), com os mesmos
 * eventos de socket do useProducts filtrados pela loja.
 */
export const useStoreProducts = (storeId?: string | null) => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    if (!storeId) { setProducts([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchAllStoreProducts(storeId)
      .then((list) => { if (!cancelled) setProducts(list); })
      .catch((err) => { console.error('Erro ao buscar produtos da loja:', err); if (!cancelled) setProducts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    const daLoja = (p: any) => p && String(p.storeId) === String(storeId);
    const un1 = on('product:created', (data: any) => {
      if (daLoja(data)) setProducts((prev) => (prev.some((p) => p._id === data._id) ? prev : [data, ...prev]));
    });
    const un2 = on('product:updated', (data: any) => {
      setProducts((prev) => prev.map((p) => (p._id === data?._id ? data : p)));
    });
    const un3 = on('product:deleted', (data: any) => {
      setProducts((prev) => prev.filter((p) => p._id !== data?._id));
    });
    return () => { cancelled = true; un1(); un2(); un3(); };
  }, [storeId, on]);

  return { products, loading, setProducts };
};
