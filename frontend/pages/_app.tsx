import '../styles/globals.css';
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
import WalletAccessInbox from '../components/WalletAccessInbox';
import ForceLogoutListener from '../components/ForceLogoutListener';
import RealtimeNotifier from '../components/RealtimeNotifier';
import NotificationToaster from '../components/NotificationToaster';
import { SeasonalThemeProvider } from '../contexts/SeasonalThemeContext';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useLivePresence } from '../hooks/useLivePresence';
import { spaceGrotesk, inter } from '../lib/fonts';

// Pequeno componente renderizado DENTRO do SocketProvider para que o hook
// de presença consiga acessar o contexto do socket.
function LivePresenceMount() {
  useLivePresence();
  return null;
}

function AppWrapper({ Component, pageProps }: AppProps) {
  const { user } = useAuth() || {};
  const router = useRouter();
  const [isSeller, setIsSeller] = useState(false);

  // Detectar se é lojista ou cliente
  useEffect(() => {
    if (user) {
      setIsSeller(user.role === 'lojista' || user.role === 'seller');
    }
  }, [user]);

  // Não mostrar chat em páginas específicas
  const isSellerPage = router.pathname.startsWith('/seller/') || router.pathname.startsWith('/store/');
  const isChatPage = router.pathname.includes('/chat');
  const shouldShowChat = !isChatPage;

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
  const showBottomChrome =
    router.pathname === '/' ||
    router.pathname === '/inicio' ||
    router.pathname === '/wallet' ||
    router.pathname === '/stores' ||
    router.pathname === '/stores/[id]' ||
    router.pathname === '/product/[id]';
  // Páginas que escondem a Nav global (usam header próprio do DS). O /inicio
  // agora usa a Nav global; só /stores e /product mantêm header próprio.
  const hideChrome =
    router.pathname === '/stores' ||
    router.pathname === '/stores/[id]' ||
    router.pathname === '/product/[id]';
  const shouldShowFooter = !isDashboard && !showBottomChrome;

  return (
    <SocketProvider enabled={!!user}>
      {/* Título padrão da aba (páginas podem sobrescrever com seu próprio <title>) */}
      <Head>
        <title>DROP</title>
      </Head>
      <LivePresenceMount />
      <ForceLogoutListener />
      {user && <RealtimeNotifier />}
      <NotificationToaster />
      <CartProvider>
        <OverlayProvider>
        <ToastProvider>
        <SeasonalThemeProvider>
        {!hideChrome && <Nav />}
        {user && isDashboard && <AppSidebar />}
        {user && isDashboard && <PanelBottomNav />}
        <VerificationBanner />
        {shouldShowFooter && <SeasonalBanner />}
        <main
          className={`${spaceGrotesk.variable} ${inter.variable}${user && isDashboard ? ' panelContentOffset' : ''}`}
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

