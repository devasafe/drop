import { useEffect } from 'react';
import { useRouter } from 'next/router';

// A "dança" de transferir saldo foi removida — o motoboy saca direto da carteira
// pro PIX dele. Esta rota redireciona pra carteira (compat com links antigos).
export default function TransferWalletRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/motoboy/wallet'); }, [router]);
  return <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Redirecionando…</div>;
}
