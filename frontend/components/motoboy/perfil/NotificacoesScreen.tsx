import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Bell, Bike, CheckCheck, Megaphone, MessageSquare } from 'lucide-react';
import MotoboyShell from '../panel/MotoboyShell';
import blocks from '../../panel/PanelBlocks.module.css';
import { Alert } from '../../ui/Alert';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { useNotifications } from '../../../hooks/useSync';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import api from '../../../lib/api';
import { groupByDay } from '../../../lib/groupNotifications';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';

const ICON: Record<string, typeof Bell> = { order: Bike, chat: MessageSquare, broadcast: Megaphone };
const ICON_CLASS: Record<string, string> = { order: blocks.icoBrand, broadcast: blocks.icoInfo };
/** Só navega para rota do painel do motoboy; qualquer outro valor é ignorado. */
const safeLink = (l: unknown): l is string => typeof l === 'string' && (l === '/motoboy' || l.startsWith('/motoboy/') || l === '/dados-recebimento');
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

/** Avisos do motoboy (protótipo 27), sem filtros: o tipo da notificação não separa dinheiro, corrida e conta (spec 8). */
export function NotificacoesScreen() {
  const router = useRouter();
  const { notifications, loading, error, reload } = useNotifications();
  const push = usePushNotifications();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    setItems((notifications || []).filter((x: any) => typeof x?._id === 'string'));
  }, [notifications]);

  const unread = items.some((x) => !x.read);

  const markAll = async () => {
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    try { await api.patch('/notifications/read-all'); } catch { /* a lista volta como o servidor tem na próxima carga */ }
  };

  const open = (x: any) => {
    if (!x.read) {
      setItems((list) => list.map((y) => (y._id === x._id ? { ...y, read: true } : y)));
      Promise.resolve(api.patch(`/notifications/${x._id}/read`)).catch(() => undefined);
    }
    if (safeLink(x.link)) router.push(x.link);
  };

  return (
    <MotoboyShell
      title="Avisos"
      back={MOTOBOY_ROUTES.corridas}
      actions={unread && !error ? (
        <button type="button" className={blocks.link} onClick={markAll}>
          <CheckCheck size={16} aria-hidden="true" /> Marcar lidas
        </button>
      ) : undefined}
    >
      <div className={blocks.body}>
        {push.supported && !push.subscribed && (
          push.permission === 'denied' ? (
            <Alert tone="warning" title="Você pode perder corridas">
              {push.blockedText}
            </Alert>
          ) : (
            <Alert tone="warning" title="Você pode perder corridas" action={{ label: 'Ativar', onClick: () => { void push.enable(); } }}>
              {push.error || 'Ative os avisos para saber de corrida nova com o app fechado.'}
            </Alert>
          )
        )}

        <section aria-label="Avisos" className={blocks.stack}>
          {loading ? (
            <>
              <Skeleton height={64} radius="var(--radius-lg)" />
              <Skeleton height={64} radius="var(--radius-lg)" />
            </>
          ) : error ? (
            <Alert tone="error" title="Não carregamos seus avisos" action={{ label: 'Tentar de novo', onClick: () => { void reload(); } }}>
              Confira a conexão e tente de novo.
            </Alert>
          ) : items.length === 0 ? (
            <EmptyState icon={<Bell />} title="Sem avisos por aqui" description="Avisos de corridas, dinheiro e da DROP aparecem aqui." />
          ) : (
            groupByDay(items).map((g) => (
              <div key={g.label} className={blocks.stack}>
                <h2 className={blocks.cap}>{g.label}</h2>
                <ul className={blocks.list}>
                  {g.items.map((x: any) => {
                    const Icon = ICON[x.type] ?? Bell;
                    return (
                      <li key={x._id} className={[blocks.row, !x.read && blocks.rowCurrent].filter(Boolean).join(' ')}>
                        <button type="button" className={blocks.rowMain} onClick={() => open(x)}>
                          <span className={[blocks.ico, ICON_CLASS[x.type]].filter(Boolean).join(' ')} aria-hidden="true"><Icon size={18} /></span>
                          <span className={blocks.tx}>
                            <b>{x.title || 'Aviso'}</b>
                            <span>{x.message}</span>
                          </span>
                          <span className={blocks.end}>
                            <time className={blocks.time}>{hhmm(x.createdAt)}</time>
                            {!x.read && <span className={blocks.dot}><span className={blocks.srOnly}>Não lida</span></span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </MotoboyShell>
  );
}

export default NotificacoesScreen;
