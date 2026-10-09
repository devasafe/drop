import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '../../lib/api';

/**
 * Aviso no painel da loja quando a mensalidade está atrasada ou a loja pausada (modo direto).
 * Silencioso: se a consulta falhar, não mostra nada e não quebra o painel.
 */
export default function SaasBillingBanner({ storeId }: { storeId: string }) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/stores/${storeId}/saas-billing`)
      .then((r) => { if (!cancelled) setStatus(r.data?.data?.status ?? null); })
      .catch(() => { /* silencioso */ });
    return () => { cancelled = true; };
  }, [storeId]);

  if (status !== 'past_due' && status !== 'paused') return null;
  const msg = status === 'paused'
    ? 'Sua loja está pausada por falta de pagamento da mensalidade.'
    : 'A mensalidade da sua loja está atrasada.';
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap',
        padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-3)',
        border: '1px solid var(--danger)', borderRadius: 'var(--r-md)',
        background: 'color-mix(in srgb, var(--danger) 8%, transparent)', color: 'var(--danger)', fontSize: 'var(--fs-sm)',
      }}
    >
      <span>{msg}</span>
      <Link href="/seller/assinatura" style={{ color: 'var(--danger)', fontWeight: 700 }}>Ver assinatura</Link>
    </div>
  );
}
