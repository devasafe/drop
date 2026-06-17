import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { SocketProvider } from '../contexts/SocketContext';
import { CartProvider } from '../contexts/CartContext';
import Nav from '../components/Nav';
import VerificationBanner from '../components/VerificationBanner';
import Footer from '../components/Footer';
import SeasonalBanner from '../components/SeasonalBanner';
import PageTransition from '../components/PageTransition';
import ChatWidgetWithTabs from '../components/ChatWidgetWithTabs';
import WalletAccessInbox from '../components/WalletAccessInbox';
import ForceLogoutListener from '../components/ForceLogoutListener';
import { SeasonalThemeProvider } from '../contexts/SeasonalThemeContext';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useLivePresence } from '../hooks/useLivePresence';

// Pequeno componente renderizado DENTRO do SocketProvider para que o hook
// de presença consiga acessar o contexto do socket.
function LivePresenceMount() {
  useLivePresence();
  return null;
}

function AppWrapper({ Component, pageProps }: AppProps) {
  const { token, user } = useAuth() || {};
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
  const shouldShowFooter = !isDashboard;

  return (
    <SocketProvider token={token}>
      <LivePresenceMount />
      <ForceLogoutListener />
      <CartProvider>
        <SeasonalThemeProvider>
        <Nav />
        <VerificationBanner />
        {shouldShowFooter && <SeasonalBanner />}
        <main style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--drop-bg)' }}>
          <PageTransition>
            <Component {...pageProps} />
          </PageTransition>
        </main>
        
        {shouldShowFooter && <Footer />}
        </SeasonalThemeProvider>

        {/* Chat Widget - Mostrar para todos os usuários autenticados */}
        {token && shouldShowChat && (
          <ChatWidgetWithTabs
            mode={isSeller ? 'seller' : 'customer'}
            storeId={isSeller ? user?._id : undefined}
            conversationType="user"
          />
        )}

        {/* Inbox de solicitações de acesso à carteira (clientes) */}
        {token && user?.role === 'cliente' && <WalletAccessInbox />}
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

