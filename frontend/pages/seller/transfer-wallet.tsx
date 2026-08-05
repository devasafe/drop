import { useEffect } from 'react';
import { useRouter } from 'next/router';

// A "dança" de transferir saldo foi removida — o lojista saca direto da carteira
// pro PIX da loja. Esta rota redireciona pra carteira (compat com links antigos).
export default function TransferWalletRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/seller/wallet'); }, [router]);
  return <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Redirecionando…</div>;
}
