import '../styles/globals.css';
import 'maplibre-gl/dist/maplibre-gl.css'; // base do Drop Maps (canvas/controles/atribuição)
import Head from 'next/head';
import type { AppProps } from 'next/app';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { SocketProvider } from '../contexts/SocketContext';
import { CartProvider } from '../contexts/CartContext';
import { OverlayProvider } from '../contexts/OverlayContext';
import { ToastProvider } from '../components/ui/Toast';
import Nav from '../components/Nav';
import AppSidebar from '../components/nav/AppSidebar';
import PanelBottomNav from '../components/nav/PanelBottomNav';
import VerificationBanner from '../components/VerificationBanner';
import Footer from '../components/Footer';
import SeasonalBanner from '../components/SeasonalBanner';
import PageTransition from '../components/PageTransition';
import ChatWidgetWithTabs from '../components/ChatWidgetWithTabs';
import { CustomerAppChrome } from '../components/drop/CustomerAppChrome';
import { OfflineBanner } from '../components/drop/OfflineBanner';
import { CUSTOMER_TAB_ROUTES, CUSTOMER_HEADERLESS_ROUTES, CUSTOMER_ROUTES } from '../lib/routes';
import WalletAccessInbox from '../components/WalletAccessInbox';
import ForceLogoutListener from '../components/ForceLogoutListener';
import RealtimeNotifier from '../components/RealtimeNotifier';
import { SellerPanelGate } from '../components/seller/panel/SellerPanelGate';
import NotificationToaster from '../components/NotificationToaster';
import CookieBanner from '../components/CookieBanner';
import { SeasonalThemeProvider } from '../contexts/SeasonalThemeContext';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { ROLE_HOME } from '../lib/navConfig';
import { isSellerPanelRoute, sellerShowsTabBar, SELLER_ONBOARDING_ROUTES } from '../lib/sellerRoutes';
import { useLivePresence } from '../hooks/useLivePresence';
import { spaceGrotesk, inter } from '../lib/fonts';
import { useRouteTheme } from '../lib/routeTheme';

// Pequeno componente renderizado DENTRO do SocketProvider para que o hook
// de presença consiga acessar o contexto do socket.
function LivePresenceMount() {
  useLivePresence();
  return null;
}

function AppWrapper({ Component, pageProps }: AppProps) {
  const { user } = useAuth() || {};
  const router = useRouter();
  useRouteTheme();
  const [isSeller, setIsSeller] = useState(false);

  // Detectar se é lojista ou cliente
  useEffect(() => {
    if (user) {
      setIsSeller(user.role === 'lojista' || user.role === 'seller');
    }
  }, [user]);

  // Trocar de role → redireciona pra Home daquela role, por QUALQUER caminho de
  // switch. Guarda o role anterior num ref: não redireciona no primeiro load
  // (só quando muda de verdade), evitando mexer em quem já está na área certa.
  const prevRoleRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const r = user?.activeRole || user?.role;
    if (!r) return;
    if (prevRoleRef.current === undefined) { prevRoleRef.current = r; return; }
    if (prevRoleRef.current !== r) {
      prevRoleRef.current = r;
      router.replace((ROLE_HOME as Record<string, string>)[r] || '/inicio');
    }
  }, [user?.activeRole, user?.role, router]);

  // Painel da loja (D1): menu lateral fixo a partir de 900px, como o app do cliente.
  const isSellerPanel = isSellerPanelRoute(router.pathname);

  // Não mostrar chat em páginas específicas. No painel da loja a conversa é por pedido (OrderChatSheet).
  const isChatPage = router.pathname.includes('/chat');
  const shouldShowChat = !isChatPage && !isSellerPanel;

  // Não mostrar footer em painéis internos
  const isDashboard =
    router.pathname.startsWith('/seller/') ||
    router.pathname.startsWith('/motoboy/') ||
    router.pathname.startsWith('/admin/') ||
    router.pathname === '/seller/dashboard' ||
    router.pathname === '/store-dashboard' ||
    router.pathname === '/motoboy';
  // /inicio, /stores, /stores/[id] e /product/[id] usam o próprio header +
  // TabBar do Design System (Fase 0/1), não o chrome de marketing (Nav
  // global + Footer).
  // Páginas do cliente que têm a bottom-nav (TabBar) do design system.
  const showBottomChrome = CUSTOMER_TAB_ROUTES.includes(router.pathname);
  // Telas com header próprio no mobile (loja e produto): a Nav global só aparece no desktop.
  const hideChrome = CUSTOMER_HEADERLESS_ROUTES.includes(router.pathname);
  // Painel da loja (V7): o topo é o da própria tela; a Nav global só aparece no computador.
  const navDesktopOnly = hideChrome || isSellerPanel;
  // Barra de abas: no painel da loja, só nas 5 abas (e Assinatura); as secundárias têm o voltar.
  const showPanelBottomNav = isDashboard && (!isSellerPanel || sellerShowsTabBar(router.pathname));
  // As telas do app do cliente e as etapas do cadastro da loja não têm o rodapé de marketing.
  const shouldShowFooter = !isDashboard && !CUSTOMER_ROUTES.includes(router.pathname)
    && !SELLER_ONBOARDING_ROUTES.includes(router.pathname);

  return (
    <SocketProvider enabled={!!user}>
      {/* Título padrão da aba (páginas podem sobrescrever com seu próprio <title>) */}
      <Head>
        <title>DROP</title>
      </Head>
      <LivePresenceMount />
      <ForceLogoutListener />
      <NotificationToaster />
      <CartProvider>
        <OverlayProvider>
        <ToastProvider>
        <SeasonalThemeProvider>
        {/* Painel da loja (D1): socket e pedidos montados uma vez para todo /seller/*. */}
        <SellerPanelGate pathname={router.pathname} enabled={!!user}>
        {/* Dentro do Gate: no painel, a loja do notificador vem do painel, sem outro GET (V12). */}
        {user && <RealtimeNotifier />}
        {!navDesktopOnly && <Nav />}
        {/* Páginas com header próprio no mobile (produto/loja e o painel da loja) ainda
            mostram a Nav global no DESKTOP — a bottom bar é escondida no desktop, então
            sem isso elas ficariam sem navegação em telas grandes. */}
        {navDesktopOnly && (
          <div className="navDesktopOnly">
            <Nav />
          </div>
        )}
        {user && isDashboard && <AppSidebar />}
        {user && showPanelBottomNav && <PanelBottomNav />}
        {CUSTOMER_ROUTES.includes(router.pathname) && <OfflineBanner />}
        {/* No painel da loja o aviso vira o estado de cadastro do Agora (T5). */}
        {!isSellerPanel && <VerificationBanner />}
        {shouldShowFooter && <SeasonalBanner />}
        <main
          className={`${spaceGrotesk.variable} ${inter.variable}${user && isDashboard ? ' panelContentOffset' : ''}${user && isSellerPanel ? ' panelContentOffsetSeller' : ''}`}
          style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--drop-bg)' }}
        >
          <PageTransition>
            <Component {...pageProps} />
          </PageTransition>
        </main>

        {/* Chrome do app do cliente (TabBar + StickyCart) — fixo na viewport.
            Precisa ficar FORA do <main>/<PageTransition>: aquele container tem
            transform/filter, que quebra o position:fixed dos filhos. */}
        {showBottomChrome && <CustomerAppChrome />}

        {shouldShowFooter && <Footer />}
        </SellerPanelGate>
        </SeasonalThemeProvider>

        {/* Chat Widget - Mostrar para todos os usuários autenticados */}
        {user && shouldShowChat && (
          <ChatWidgetWithTabs
            mode={isSeller ? 'seller' : 'customer'}
            storeId={isSeller ? user?._id : undefined}
            conversationType="user"
          />
        )}

        {/* Inbox de solicitações de acesso à carteira (clientes) */}
        {user?.role === 'cliente' && <WalletAccessInbox />}

        {/* Banner de consentimento de cookies (LGPD) — global, aparece uma vez */}
        <CookieBanner />
        </ToastProvider>
        </OverlayProvider>
      </CartProvider>
    </SocketProvider>
  );
}

export default function App(props: AppProps) {
  return (
    <AuthProvider>
      <AppWrapper {...props} />
    </AuthProvider>
  );
}

