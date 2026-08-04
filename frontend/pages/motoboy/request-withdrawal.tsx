import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * O saque agora é direto pra chave PIX, feito na própria carteira
 * (/motoboy/wallet). Esta rota vira redirect para não quebrar links antigos.
 */
export default function RequestWithdrawalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/motoboy/wallet');
  }, [router]);
  return null;
}
