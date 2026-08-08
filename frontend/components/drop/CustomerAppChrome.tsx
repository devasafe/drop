import { ComponentType } from 'react';
import { useRouter } from 'next/router';
import { Home, Search, LogIn, LucideProps } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { spaceGrotesk, inter } from '../../lib/fonts';
import { getNavItems, isItemActive, GUEST_BOTTOM_NAV } from '../../lib/navConfig';
import { StickyCart } from './StickyCart';
import { TabBar, TabKey, TabItem } from './TabBar';
import styles from './CustomerAppChrome.module.css';

interface CartItem {
  price?: number;
  quantity?: number;
}

// Ordem canônica das abas do cliente = ordem dos itens bottomNav da config.
const CLIENTE_ITEMS = getNavItems('cliente', () => true, false).filter((i) => i.placement.includes('bottomNav'));
const KEY_BY_LABEL: Record<string, TabKey> = {
  'Início': 'inicio', 'Buscar': 'buscar', 'Pedidos': 'pedidos', 'Carteira': 'carteira', 'Perfil': 'perfil',
};

// Abas de convidado (deslogado): só Início, Buscar e Entrar. Rotas vêm da
// navConfig (GUEST_BOTTOM_NAV); os ícones lucide são atribuídos por key aqui.
const GUEST_ICON: Record<string, ComponentType<LucideProps>> = { inicio: Home, buscar: Search, entrar: LogIn };
const GUEST_TAB_ITEMS: TabItem[] = GUEST_BOTTOM_NAV.map((g) => ({ key: g.key as TabKey, label: g.label, icon: GUEST_ICON[g.key] }));

/** Aba ativa derivada da rota do app-shell do cliente, via navConfig (rota +
 * activeMatch de cada item). As telas de vitrine (/stores, /stores/[id],
 * /product/[id]) mapeiam para "Buscar" através do activeMatch '/stores'
 * declarado no item Buscar da config. */
function activeTab(pathname: string): TabKey {
  const hit = CLIENTE_ITEMS.find((i) => isItemActive(i, pathname));
  return hit ? KEY_BY_LABEL[hit.label] : 'inicio';
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
  const { user } = useAuth();
  const { cart } = useCart();
  const loggedOut = !user;

  const items = (cart || []) as CartItem[];
  const cartCount = items.reduce((sum, c) => sum + (c.quantity || 0), 0);
  const cartTotal = items.reduce((sum, c) => sum + (c.price || 0) * (c.quantity || 0), 0);

  const handleTabNavigate = (key: TabKey) => {
    if (loggedOut) {
      const g = GUEST_BOTTOM_NAV.find((i) => i.key === key);
      if (g) router.push(g.route);
      return;
    }
    const item = CLIENTE_ITEMS.find((i) => KEY_BY_LABEL[i.label] === key);
    if (item) router.push(item.route);
  };

  return (
    <div className={`${spaceGrotesk.variable} ${inter.variable} ${styles.dock}`}>
      {cartCount > 0 && (
        <StickyCart count={cartCount} total={cartTotal} onOpen={() => router.push('/checkout')} />
      )}
      <div className={styles.tabBarWrap}>
        <TabBar
          active={activeTab(router.pathname)}
          onNavigate={handleTabNavigate}
          items={loggedOut ? GUEST_TAB_ITEMS : undefined}
        />
      </div>
    </div>
  );
}
