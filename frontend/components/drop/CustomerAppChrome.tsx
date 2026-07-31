import { useRouter } from 'next/router';
import { useCart } from '../../contexts/CartContext';
import { spaceGrotesk, inter } from '../../lib/fonts';
import { StickyCart } from './StickyCart';
import { TabBar, TabKey } from './TabBar';
import styles from './CustomerAppChrome.module.css';

interface CartItem {
  price?: number;
  quantity?: number;
}

const TAB_ROUTES: Record<TabKey, string> = {
  inicio: '/inicio',
  buscar: '/',
  pedidos: '/user-dashboard',
  carteira: '/wallet',
  perfil: '/minha-conta',
};

/** Aba ativa derivada da rota do app-shell do cliente. As telas de vitrine
 * (/stores, /stores/[id], /product/[id]) mapeiam para "Buscar". */
function activeTab(pathname: string): TabKey {
  return pathname === '/inicio' ? 'inicio' : 'buscar';
}

/**
 * Chrome persistente do app do cliente: StickyCart + TabBar fixos na tela.
 * Vive no _app, fora do <PageTransition>, então a barra NÃO re-monta ao
 * trocar de aba (só o conteúdo transiciona) e o position:fixed gruda na
 * viewport de verdade. Deriva a aba ativa e os totais do carrinho do estado
 * global — as páginas não instanciam mais a própria TabBar/StickyCart.
 */
export function CustomerAppChrome() {
  const router = useRouter();
  const { cart } = useCart();

  const items = (cart || []) as CartItem[];
  const cartCount = items.reduce((sum, c) => sum + (c.quantity || 0), 0);
  const cartTotal = items.reduce((sum, c) => sum + (c.price || 0) * (c.quantity || 0), 0);

  const handleTabNavigate = (key: TabKey) => router.push(TAB_ROUTES[key]);

  return (
    <div className={`${spaceGrotesk.variable} ${inter.variable} ${styles.dock}`}>
      {cartCount > 0 && (
        <StickyCart count={cartCount} total={cartTotal} onOpen={() => router.push('/checkout')} />
      )}
      <div className={styles.tabBarWrap}>
        <TabBar active={activeTab(router.pathname)} onNavigate={handleTabNavigate} />
      </div>
    </div>
  );
}
