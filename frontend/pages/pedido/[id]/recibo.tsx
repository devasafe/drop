import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { FileText, Printer } from 'lucide-react';
import api from '../../../lib/api';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { ScreenHeader } from '../../../components/drop/ScreenHeader';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { ROUTES, pedidoConversaHref, pedidoHref } from '../../../lib/routes';
import styles from '../Recibo.module.css';

const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null);
const km = (n?: number | null) => (typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(1).replace('.', ',')} km` : null);

export default function ReciboPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const [nota, setNota] = useState<any | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none' | 'error'>('loading');

  const load = useCallback(() => {
    if (!id) return;
    setState('loading');
    api
      .get(`/invoices/by-order/${id}`)
      .then((r) => {
        setNota(r.data);
        setState('ok');
      })
      .catch((e) => setState(e?.response?.status === 404 ? 'none' : 'error'));
  }, [id]);
  useEffect(load, [load]);

  const fee = Number(nota?.deliveryFee) || 0;
  return (
    <ProtectedRoute required_role="cliente">
      <main className={styles.page}>
        <ScreenHeader
          title="Recibo da entrega"
          onBack={() => router.push(id ? pedidoHref(id) : ROUTES.pedidos)}
          end={
            state === 'ok' ? (
              <button type="button" className={styles.iconBtn} aria-label="Imprimir recibo" onClick={() => window.print()}>
                <Printer size={22} aria-hidden="true" />
              </button>
            ) : undefined
          }
        />
        {state === 'loading' ? (
          <div className={styles.body}>
            <Skeleton height={96} />
            <Skeleton height={160} />
          </div>
        ) : state === 'none' ? (
          <EmptyState icon={<FileText />} title="Ainda não há recibo para este pedido" description="O recibo sai quando a entrega é concluída. Loja vitrine não tem recibo de entrega." />
        ) : state === 'error' ? (
          <EmptyState variant="error" icon={<FileText />} title="Não carregamos o recibo" description="Confira sua conexão." onRetry={load} />
        ) : (
          <div className={styles.body}>
            <section className={styles.card}>
              <p className={styles.cap}>{`Nota de serviço nº ${nota.invoiceNumber}`}</p>
              <p className={styles.value}>{formatMoney(fee)}</p>
              <p className={styles.sub}>{[`Serviço de entrega do pedido #${shortOrderCode(id!)}`, km(nota.distance)].filter(Boolean).join(' · ')}</p>
            </section>
            <dl className={styles.card}>
              <div>
                <dt>Prestador</dt>
                <dd>{`${nota.motoboyName} · motoboy autônomo`}</dd>
              </div>
              <div>
                <dt>Tomador</dt>
                <dd>{nota.customerName}</dd>
              </div>
              <div>
                <dt>Retirada</dt>
                <dd>{[nota.storeName, hhmm(nota.pickedAt)].filter(Boolean).join(' · ')}</dd>
              </div>
              <div>
                <dt>Entrega</dt>
                <dd>{[nota.customerAddress, hhmm(nota.deliveredAt)].filter(Boolean).join(' · ')}</dd>
              </div>
            </dl>
            <dl className={styles.card}>
              <div>
                <dt>Taxa de entrega</dt>
                <dd>{formatMoney(fee)}</dd>
              </div>
              <div>
                <dt>{`Plataforma DROP (${Number(nota.commissionPercent)}%)`}</dt>
                <dd>{formatMoney(Number(nota.appCommission) || 0)}</dd>
              </div>
              <div className={styles.total}>
                <dt>Líquido do motoboy</dt>
                <dd>{formatMoney(Number(nota.motoboyAmount) || 0)}</dd>
              </div>
            </dl>
            <Alert tone="info" title="E a nota dos produtos?" action={{ label: 'Pedir nota à loja', onClick: () => router.push(pedidoConversaHref(id!, 'loja')) }}>
              {`Quem emite é a ${nota.storeName}.`}
            </Alert>
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}
