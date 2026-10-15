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
import { isMotoboyPanelRoute, motoboyShowsTabBar } from '../lib/motoboyRoutes';
import AdminShell from '../components/admin/AdminShell';
import { isAdminPanelRoute } from '../lib/adminNav';
import { adminLegacyShellTitle } from '../lib/adminLegacyShell';
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
  const { user, loading: authLoading } = useAuth() || {};
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
  // Etapas do cadastro da loja fora de /seller (V13): para o lojista, a mesma moldura do painel.
  const activeRole = user?.activeRole || user?.role;
  const isStoreRole = activeRole === 'lojista' || activeRole === 'seller';
  const isSellerOnboarding = isStoreRole && SELLER_ONBOARDING_ROUTES.includes(router.pathname);
  const sellerFrame = isSellerPanel || isSellerOnboarding;
  // Painel do motoboy (D2): a mesma moldura da loja. O perfil público (/motoboy/[id]) só entra quando
  // quem vê é motoboy ("Ver como o cliente vê"); para o cliente, segue a moldura de antes.
  // A etapa Pix (/dados-recebimento) também ganha a moldura quando o papel ativo é motoboy.
  const isMotoboyRole = activeRole === 'motoboy';
  const isMotoboyPanel = isMotoboyPanelRoute(router.pathname)
    || (isMotoboyRole && router.pathname === '/motoboy/[id]');
  const motoboyFrame = isMotoboyPanel || (isMotoboyRole && router.pathname === '/dados-recebimento');
  // Painel do admin (D3a): a casca é o AdminShell (menu, cabeçalho, gaveta). Nada da moldura antiga:
  // sem Nav global, AppSidebar, barra do painel, aviso de verificação, chat flutuante, deslocamento de 256 px
  // nem PageTransition (o transform dela prende o position: fixed da gaveta e da BatchBar).
  const adminFrame = isAdminPanelRoute(router.pathname);
  const panelFrame = sellerFrame || motoboyFrame || adminFrame;
  // Páginas do admin que ainda não montam o AdminShell (P2–P5 tiram cada uma da lista): o _app embrulha.
  const legacyAdminTitle = user && adminFrame ? adminLegacyShellTitle(router.pathname) : null;

  // Não mostrar chat em páginas específicas. Nos painéis a conversa é por pedido/corrida (OrderChatSheet, RideChatSheet).
  const isChatPage = router.pathname.includes('/chat');
  const shouldShowChat = !isChatPage && !panelFrame;

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
  // Painéis da loja (V7) e do motoboy (D2): o topo é o da própria tela; a Nav global só aparece no computador.
  const navDesktopOnly = hideChrome || panelFrame;
  // Barra de abas: na loja, só nas 5 abas (e Assinatura); no motoboy, só nas 4 abas e em Entregas.
  // As telas de fluxo têm o voltar.
  const showPanelBottomNav = isDashboard
    && (!isSellerPanel || sellerShowsTabBar(router.pathname))
    && (!isMotoboyPanel || motoboyShowsTabBar(router.pathname));
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
        {/* Com a sessão ainda carregando o painel já monta (e espera): as telas não fazem GET próprio
            antes dela, e a árvore não remonta quando o usuário chega (V12). */}
        <SellerPanelGate pathname={router.pathname} enabled={!!user || authLoading === true}>
        {/* Dentro do Gate: no painel, a loja do notificador vem do painel, sem outro GET (V12). */}
        {user && <RealtimeNotifier />}
        {!adminFrame && !navDesktopOnly && <Nav />}
        {/* Páginas com header próprio no mobile (produto/loja e o painel da loja) ainda
            mostram a Nav global no DESKTOP — a bottom bar é escondida no desktop, então
            sem isso elas ficariam sem navegação em telas grandes. */}
        {!adminFrame && navDesktopOnly && (
          <div className="navDesktopOnly">
            <Nav />
          </div>
        )}
        {user && isDashboard && !adminFrame && <AppSidebar />}
        {user && showPanelBottomNav && !adminFrame && <PanelBottomNav />}
        {CUSTOMER_ROUTES.includes(router.pathname) && <OfflineBanner />}
        {/* Nos painéis o aviso vira estado da tela: o Agora da loja (T5), o Corridas/Perfil do motoboy (D2) e as Verificações do admin (D3a). */}
        {!panelFrame && <VerificationBanner />}
        {shouldShowFooter && <SeasonalBanner />}
        <main
          className={`${spaceGrotesk.variable} ${inter.variable}${user && isDashboard && !adminFrame ? ' panelContentOffset' : ''}${user && isSellerPanel ? ' panelContentOffsetSeller' : ''}${user && isMotoboyPanel ? ' panelContentOffsetMotoboy' : ''}`}
          style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--drop-bg)' }}
        >
          {adminFrame ? (
            legacyAdminTitle !== null ? (
              <AdminShell title={legacyAdminTitle}>
                <Component {...pageProps} />
              </AdminShell>
            ) : (
              <Component {...pageProps} />
            )
          ) : (
            <PageTransition>
              <Component {...pageProps} />
            </PageTransition>
          )}
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

