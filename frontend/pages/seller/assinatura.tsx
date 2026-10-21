import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bike, FileText, QrCode, Store } from 'lucide-react';
import api from '../../lib/api';
import { formatFullDate } from '../../lib/sellerApi';
import ProtectedRoute from '../../components/ProtectedRoute';
import ModeGate from '../../components/ModeGate';
import SellerShell from '../../components/seller/panel/SellerShell';
import { Alert } from '../../components/ui/Alert';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import {
  formatBRL, saasCancelledSellsUntil, saasStatusLabel, saasTrialDaysLeft, saasTrialLabel, saasStatusMessage, SAAS_PENDING_MESSAGE,
  type SaasBillingView,
} from '../../lib/saasBilling';
import blocks from '../../components/panel/PanelBlocks.module.css';
import styles from './SellerAssinatura.module.css';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthLabel = (iso: string) => {
  const [, mm, yyyy] = (formatFullDate(iso) || '').split('/');
  const name = MONTHS[Number(mm) - 1];
  return name ? `${name} de ${yyyy}` : 'Fatura';
};
const TAG: Record<string, string> = {
  trialing: blocks.tagInfo, active: blocks.tagOk, past_due: blocks.tagErr, paused: blocks.tagErr, cancelled: blocks.tagErr,
};

function Assinatura() {
  const { user } = useAuth() as any;
  const [data, setData] = useState<SaasBillingView | null>(null);
  const [error, setError] = useState('');
  // V12: no painel, a loja vem do SellerPanelProvider (espera ele carregar); fora, o GET próprio.
  const panel = useSellerPanel();
  const inPanel = panel?.inPanel === true;
  const panelWaiting = inPanel && panel.loading;
  const panelStore = inPanel ? panel.store : null;

  useEffect(() => {
    if (panelWaiting) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const dash = inPanel
          ? { store: panelStore }
          : await api.get('/stores/dashboard').then((r) => r.data).catch(() => null);
        const id = dash?.store?._id || dash?._id || user?.storeId;
        if (!id) { if (!cancelled) setError('Não encontramos a sua loja.'); return; }
        const r = await api.get(`/stores/${id}/saas-billing`);
        if (!cancelled) setData(r.data?.data ?? null);
      } catch {
        if (!cancelled) setError('Não foi possível carregar a sua assinatura.');
      }
    })();
    return () => { cancelled = true; };
  }, [user?.storeId, panelWaiting]); // eslint-disable-line react-hooks/exhaustive-deps

  // D3b-2b: a cancelada não é aviso vermelho, nem depois do período (onda final): o texto só informa até quando
  // vendeu, e a pausa pelo DROP tem a faixa própria.
  const sellsUntil = data ? saasCancelledSellsUntil(data) : null;
  const warn = !!data && (data.status === 'past_due' || data.status === 'paused');
  const pay = data?.nextPayment;
  const payments = Array.isArray(data?.payments) ? data!.payments! : [];
  const daysLeft = data?.status === 'trialing' && data.trialEndsAt
    ? saasTrialDaysLeft(data.trialEndsAt)
    : null;

  return (
    <div className={blocks.body}>
      {error && <Alert tone="error" title={error} />}
      {!data && !error && <Skeleton height={160} radius="var(--radius-lg)" />}
      {data && (
        <>
          <section className={[blocks.blk, warn ? blocks.blkDanger : blocks.blkBrand].join(' ')} aria-label="Situação">
            <div className={blocks.head}>
              <span className={[blocks.tag, TAG[data.status] || ''].filter(Boolean).join(' ')}>{saasStatusLabel(data.status)}</span>
            </div>
            {daysLeft != null && <span className={blocks.big}>{saasTrialLabel(daysLeft)}</span>}
            <p className={styles.status}>{saasStatusMessage(data)}</p>
            {data.status === 'past_due' && data.blockAt && (
              <p className={blocks.sub}>{`Pague até ${(formatFullDate(data.blockAt) || '—')} para a sua loja não ser pausada. Pausada, ela sai da vitrine e não recebe pedidos novos.`}</p>
            )}
            {data.status === 'trialing' && <p className={blocks.sub}>Sem cartão cadastrado: a primeira cobrança chega por Pix ou boleto.</p>}
            {data.status === 'paused' && <p className={blocks.sub}>Pedidos já pagos seguem até o fim. Produtos, pedidos e avaliações estão guardados.</p>}
            {data.status === 'cancelled' && (
              <p className={blocks.sub}>
                {sellsUntil
                  ? 'A cobrança parou. Depois dessa data a loja sai da vitrine e não recebe pedidos novos. Para continuar, fale com o suporte.'
                  : 'A cobrança parou. Para continuar, fale com o suporte.'}
              </p>
            )}
          </section>

          {data.pendingReason === 'owner_document' && (
            <section className={blocks.blk} aria-label="Fatura pendente">
              <p className={styles.status}>{SAAS_PENDING_MESSAGE.owner_document}</p>
              <Link href="/verificacao" className={blocks.link}>Ir para a verificação</Link>
            </section>
          )}

          {pay && (
            <section className={blocks.blk} aria-label="Próxima cobrança">
              <h2 className={blocks.headTitle}>Próxima cobrança</h2>
              <div className={blocks.sum}>
                <div><span>Vencimento</span><span>{(formatFullDate(pay.dueDate) || '—')}</span></div>
                <div><span>Valor da fatura</span><span>{formatBRL(pay.value)}</span></div>
              </div>
              {pay.invoiceUrl ? (
                <a className={styles.payBtn} href={pay.invoiceUrl} target="_blank" rel="noopener noreferrer">Pagar fatura</a>
              ) : (
                <p className={blocks.meta}>A fatura está sendo gerada. Tente de novo em alguns minutos.</p>
              )}
              <p className={blocks.meta}>Pix ou boleto. Pagou agora? A confirmação chega em alguns minutos.</p>
            </section>
          )}

          <section className={blocks.blk} aria-label="Valores">
            <div className={blocks.sum}>
              <div><span>Mensalidade</span>{data.fee > 0 ? <span>{formatBRL(data.fee)}</span> : <span>Sua loja não paga mensalidade</span>}</div>
              <div><span>Comissão por venda</span><span className={blocks.ok}>Nenhuma</span></div>
              {data.paidUntil && <div><span>Coberto até</span><span>{(formatFullDate(data.paidUntil) || '—')}</span></div>}
              {data.blockAt && <div><span>Pausa a partir de</span><span>{(formatFullDate(data.blockAt) || '—')}</span></div>}
            </div>
          </section>

          <section aria-label="O que está incluído" className={blocks.stack}>
            <h2 className={blocks.cap}>O que está incluído</h2>
            <ul className={blocks.list}>
              <li className={blocks.row}><span className={[blocks.ico, blocks.icoBrand].join(' ')} aria-hidden="true"><Store size={18} /></span><span className={blocks.tx}><b>Sua loja no app e na vitrine</b><span>Clientes da região encontram você</span></span></li>
              <li className={blocks.row}><span className={[blocks.ico, blocks.icoBrand].join(' ')} aria-hidden="true"><QrCode size={18} /></span><span className={blocks.tx}><b>Pix direto na sua conta</b><span>Sem esperar repasse</span></span></li>
              <li className={blocks.row}><span className={[blocks.ico, blocks.icoBrand].join(' ')} aria-hidden="true"><Bike size={18} /></span><span className={blocks.tx}><b>Motoboys do DROP</b><span>Pagos pela sua conta, com trava</span></span></li>
            </ul>
          </section>

          <section aria-label="Faturas pagas" className={blocks.stack}>
            <h2 className={blocks.cap}>Faturas pagas</h2>
            {payments.length === 0 ? (
              <p className={blocks.meta}>A primeira fatura paga aparece aqui.</p>
            ) : (
              <ul className={blocks.list}>
                {payments.map((p) => (
                  <li key={p.id} className={blocks.row}>
                    <span className={[blocks.ico, blocks.icoOk].join(' ')} aria-hidden="true"><FileText size={18} /></span>
                    <span className={blocks.tx}>
                      <b>{monthLabel(p.dueDate)}</b>
                      <span>{p.paidAt ? `Paga em ${(formatFullDate(p.paidAt) || '—')}` : 'Paga'}</span>
                    </span>
                    <span className={blocks.end}>
                      <span className={styles.value}>{formatBRL(p.value)}</span>
                      {p.invoiceUrl && <a className={blocks.link} href={p.invoiceUrl} target="_blank" rel="noopener noreferrer">Recibo</a>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function SellerAssinatura() {
  return (
    <ProtectedRoute required_role="lojista">
      <ModeGate mode="direto">
        <SellerShell title="Assinatura" back="/seller/loja">
          <Assinatura />
        </SellerShell>
      </ModeGate>
    </ProtectedRoute>
  );
}
