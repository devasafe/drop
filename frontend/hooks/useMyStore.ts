import { useEffect, useState } from 'react';
import api from '../lib/api';

/**
 * Loja e produtos do DONO logado, pela rota autenticada GET /stores/dashboard.
 * Não usa a vitrine pública (GET /stores, /products): loja pausada pela mensalidade
 * (ou ainda não verificada) some de lá, e o dono precisa continuar gerindo o catálogo.
 */
export function useMyStore() {
  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/stores/dashboard')
      .then((res) => {
        if (!alive) return;
        setStore(res.data?.store || null);
        setProducts(Array.isArray(res.data?.products) ? res.data.products : []);
      })
      .catch(() => { if (alive) { setStore(null); setProducts([]); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return { store, products, loading };
}
