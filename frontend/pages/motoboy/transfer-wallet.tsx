import { useEffect } from 'react';
import { useRouter } from 'next/router';

// A "dança" de transferir saldo foi removida — o motoboy saca direto da carteira
// pro PIX dele. Esta rota redireciona pra carteira (compat com links antigos).
export default function TransferWalletRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/motoboy/wallet'); }, [router]);
  return null;
}
