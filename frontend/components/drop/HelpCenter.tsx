import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ChevronRight, Headphones, MessageCircle, Package } from 'lucide-react';
import api from '../../lib/api';
import { useOrders } from '../../hooks/useSync';
import { customerOrderStatus, shortOrderCode } from '../../lib/customerOrder';
import { SupportThread, type SupportTicketView } from './SupportThread';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { orderStatusView } from './OrderStatusBadge';
import styles from './HelpCenter.module.css';

const STATUS: Record<string, string> = { aberto: 'Aberto', em_atendimento: 'Em atendimento', resolvido: 'Resolvido' };
const ddmm = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export interface HelpCenterProps {
  faq: { q: string; a: string }[];
  /** Lista os pedidos recentes do cliente como atalho para abrir um chamado. Não faz sentido para o lojista. */
  withOrders?: boolean;
  /** Casca da tela. Recebe o conteúdo e se a conversa está aberta (a conversa tem o próprio "voltar"). */
  frame: (content: ReactNode, inThread: boolean) => ReactNode;
}

/** Central de ajuda (dúvidas + chamados com o suporte), compartilhada por /conta/ajuda e /seller/ajuda. */
export function HelpCenter({ faq, withOrders = false, frame }: HelpCenterProps) {
  const { orders } = useOrders();
  const [tickets, setTickets] = useState<any[]>([]);
  const [thread, setThread] = useState<{ ticket: SupportTicketView; draft: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTickets = useCallback(() => {
    api.get('/support/tickets').then((r) => setTickets(Array.isArray(r.data) ? r.data : [])).catch(() => setTickets([]));
  }, []);
  useEffect(loadTickets, [loadTickets]);

  /** Abre (ou retoma) um chamado. Com pedido, o chamado nasce com o orderId e a conversa mostra o card dele. */
  const openTicket = async (subject: string, order: SupportTicketView['order'] = null, draft = '') => {
    // Chamado ainda aberto sobre o mesmo pedido (ou, sem pedido, o mesmo assunto): continua nele.
    const existing = tickets.find((t) => t.status !== 'resolvido' && t.conversationId
      && (order ? t.orderId === order._id || (!t.orderId && t.subject === subject) : !t.orderId && t.subject === subject));
    if (existing) { setThread({ ticket: existing, draft }); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/support/tickets', order ? { subject, orderId: order._id } : { subject });
      const created = r.data?.ticket || {};
      setThread({
        ticket: {
          _id: String(created._id ?? created.id ?? r.data?._id ?? ''),
          conversationId: r.data.conversationId,
          subject,
          status: 'aberto',
          assignedTo: [],
          order,
          resolvedAt: null,
        },
        draft,
      });
      loadTickets();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Não abrimos o chamado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (thread) {
    const { ticket, draft } = thread;
    return (
      <>
        {frame(
          <SupportThread
            key={ticket.conversationId}
            ticket={ticket}
            initialText={draft}
            onBack={() => { setThread(null); loadTickets(); }}
            onNewTicket={(text) => openTicket(ticket.subject, ticket.order ?? null, text)}
          />,
          true,
        )}
      </>
    );
  }

  const recent = withOrders ? (orders || []).slice(0, 3) : [];
  return (
    <>
      {frame(
        <>
          <div className={styles.body}>
            {recent.length > 0 && (
              <section aria-labelledby="ajuda-pedidos">
                <h2 id="ajuda-pedidos" className={styles.cap}>Sobre um pedido</h2>
                <div className={styles.card}>
                  {recent.map((o: any) => {
                    const label = `#${shortOrderCode(o._id)} · ${o.storeName || 'Loja'}`;
                    return (
                      <button
                        key={o._id}
                        type="button"
                        className={styles.row}
                        disabled={busy}
                        onClick={() => openTicket(`Pedido ${label}`, { _id: o._id, storeName: o.storeName || 'Loja', status: o.status, totalValue: Number(o.totalValue) || 0, createdAt: o.createdAt })}
                      >
                        <span className={styles.ico} aria-hidden="true"><Package size={18} /></span>
                        <span className={styles.tx}><b>{label}</b><span>{`${orderStatusView(customerOrderStatus(o)).label} · ${ddmm(o.createdAt)}`}</span></span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            <section aria-labelledby="ajuda-faq">
              <h2 id="ajuda-faq" className={styles.cap}>Dúvidas comuns</h2>
              <div className={styles.card}>
                {faq.map((f) => (
                  <details key={f.q} className={styles.faq}><summary>{f.q}</summary><p>{f.a}</p></details>
                ))}
              </div>
            </section>
            {tickets.length > 0 && (
              <section aria-labelledby="ajuda-conversas">
                <h2 id="ajuda-conversas" className={styles.cap}>Conversas</h2>
                <div className={styles.card}>
                  {tickets.map((t) => (
                    <button key={t._id} type="button" className={styles.row} onClick={() => setThread({ ticket: t, draft: '' })}>
                      <span className={styles.ico} aria-hidden="true"><Headphones size={18} /></span>
                      <span className={styles.tx}><b>{t.order ? `${t.subject} · #${shortOrderCode(t.order._id)}` : t.subject}</b><span>{ddmm(t.createdAt)}</span></span>
                      <span className={t.status === 'resolvido' ? styles.done : styles.open}>{STATUS[t.status] ?? t.status}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {error && <Alert tone="error" title={error} />}
          </div>
          <div className={styles.bar}>
            <Button leftIcon={<MessageCircle size={18} aria-hidden="true" />} loading={busy} onClick={() => openTicket('Ajuda pelo app')}>Falar com a gente</Button>
          </div>
        </>,
        false,
      )}
    </>
  );
}

export default HelpCenter;
