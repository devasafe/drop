import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { useSellerPanel } from '../components/seller/panel/SellerPanelProvider';

type MyStore = { store: any; products: any[]; loading: boolean };

/**
 * Loja e produtos do DONO logado, pela rota autenticada GET /stores/dashboard.
 * Não usa a vitrine pública (GET /stores, /products): loja pausada pela mensalidade
 * (ou ainda não verificada) some de lá, e o dono precisa continuar gerindo o catálogo.
 *
 * V12: dentro do painel da loja (/seller/*) lê do SellerPanelProvider, que já fez o GET, em vez de
 * repeti-lo (o limite é 100 req/min por IP). Enquanto o painel carrega, fica em `loading` (fail closed).
 * Como antes, os dados ficam fixos a partir da 1ª leitura desta tela (um rascunho, como o de Estoque,
 * não some quando o painel recarrega por um pedido novo); quem muda o catálogo chama `reload()`
 * para a próxima tela já abrir com ele. Fora do painel, segue o GET próprio.
 */
export function useMyStore(): MyStore & { reload: () => Promise<void> } {
  const panel = useSellerPanel();
  const inPanel = panel?.inPanel === true;

  const [own, setOwn] = useState<MyStore>({ store: null, products: [], loading: true });
  useEffect(() => {
    if (inPanel) return undefined;
    let alive = true;
    api.get('/stores/dashboard')
      .then((res) => {
        if (!alive) return;
        setOwn({ store: res.data?.store || null, products: Array.isArray(res.data?.products) ? res.data.products : [], loading: false });
      })
      .catch(() => { if (alive) setOwn({ store: null, products: [], loading: false }); });
    return () => { alive = false; };
  }, [inPanel]);

  // Primeira leitura do painel que esta tela viu (fixa daqui em diante, como o GET de antes).
  const snap = useRef<MyStore | null>(null);
  if (inPanel && !snap.current && !panel.loading) {
    snap.current = { store: panel.store, products: Array.isArray(panel.products) ? panel.products : [], loading: false };
  }

  const refresh = panel?.refresh;
  const reload = async () => { if (inPanel && refresh) await refresh(); };

  if (inPanel) return { ...(snap.current || { store: null, products: [], loading: true }), reload };
  return { ...own, reload };
}
