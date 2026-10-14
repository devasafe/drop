import { useRef, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import api from '../../../lib/api';
import { Alert } from '../../ui/Alert';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { ProgressBar } from '../../ui/ProgressBar';
import { apiError, formatClock } from '../../../lib/sellerApi';
import blocks from '../../panel/PanelBlocks.module.css';
import { absentRemainingMs, telHref } from './rideView';
import styles from './Corrida.module.css';

export interface ClienteAusenteViewProps {
  ride: any;
  now: number;
  onChat: () => void;
  /** K11: o PIN de devolução vem na resposta; a página o guarda até o servidor trazer o próprio. */
  onClosed: (result: { compensation: number | null; pinDevolucao: string | null }) => void;
  onReload: () => void;
}

/** Espera de cliente ausente contada da hora do servidor (customerAbsentAvailableAt). Fail closed. */
export function ClienteAusenteView({ ride, now, onChat, onClosed, onReload }: ClienteAusenteViewProps) {
  const [override, setOverride] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);

  const customer = ride?.customerObj || {};
  const serverAt = ride?.customerAbsentAvailableAt ?? null;
  const availableAt = override && (!serverAt || Date.parse(override) > Date.parse(serverAt)) ? override : serverAt;
  const remaining = absentRemainingMs(availableAt, now);
  const waitMin = Number(ride?.customerAbsentWaitMin);
  const totalMs = Number.isFinite(waitMin) && waitMin > 0 ? waitMin * 60_000 : null;
  const elapsed = totalMs !== null && remaining !== null ? Math.min(totalMs, Math.max(0, totalMs - remaining)) : null;
  const ready = remaining === 0;
  const tel = telHref(customer.telefone);

  const close = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setMessage('');
    try {
      const r: any = await api.post(`/deliveries/${ride._id}/cliente-ausente`, {});
      const c = Number(r?.data?.motoboyCompensation);
      const pin = r?.data?.pinDevolucao;
      onClosed({ compensation: Number.isFinite(c) ? c : null, pinDevolucao: typeof pin === 'string' && pin ? pin : null });
      return; // sucesso: continua travado até a página trocar de tela
    } catch (err) {
      const e = apiError(err);
      const rem = Number((err as any)?.response?.data?.remainingMs);
      if (e.status === 400 && Number.isFinite(rem) && rem > 0) {
        setOverride(new Date(Date.now() + rem).toISOString());
        setMessage(`Ainda faltam ${formatClock(rem)} de espera.`);
      } else if (e.status === 409 || (e.status === 400 && (err as any)?.response?.data?.currentStatus)) {
        setMessage(e.message || 'Esta entrega mudou. Atualizamos a tela.');
        onReload();
      } else {
        setMessage(e.message || 'Não deu para encerrar agora. Confira a conexão e tente de novo.');
      }
    }
    inFlight.current = false;
    setSending(false);
  };

  return (
    <div className={styles.screen}>
      {remaining === null ? (
        <Alert tone="warning" title="Não conseguimos conferir a espera agora" action={{ label: 'Tentar de novo', onClick: onReload }}>
          O botão de encerrar fica travado até o servidor confirmar o tempo.
        </Alert>
      ) : (
        <section className={`${blocks.blk} ${styles.center}`}>
          <span className={blocks.cap}>Espera no local</span>
          <span>
            <span className={styles.clock}>{formatClock(elapsed ?? 0)}</span>
            {totalMs !== null && <> <span className={styles.clockOf}>de {formatClock(totalMs)}</span></>}
          </span>
          {totalMs !== null && <ProgressBar value={elapsed ?? 0} max={totalMs} label="Espera no local" />}
          {totalMs !== null && <span className={blocks.meta}>Depois de {waitMin} min você pode encerrar como "cliente ausente".</span>}
        </section>
      )}

      <ul className={blocks.list}>
        <li className={blocks.row}>
          <Avatar name={customer.name || 'Cliente'} size="sm" />
          <span className={blocks.tx}><b>{customer.name || 'Cliente'}</b></span>
        </li>
        {tel && (
          <li>
            <a className={`${blocks.row} ${blocks.rowButton}`} href={tel}>
              <span className={blocks.ico} aria-hidden="true"><Phone size={18} /></span>
              <span className={blocks.tx}><b>Ligar</b><span>Ligue para o cliente</span></span>
            </a>
          </li>
        )}
        <li>
          <button type="button" className={`${blocks.row} ${blocks.rowButton}`} onClick={onChat}>
            <span className={blocks.ico} aria-hidden="true"><MessageCircle size={18} /></span>
            <span className={blocks.tx}><b>Mandar mensagem</b><span>"Cheguei, estou na portaria"</span></span>
          </button>
        </li>
      </ul>

      <section className={`${blocks.blk} ${blocks.blkBrand}`}>
        <div className={blocks.head}><b className={blocks.headTitle}>O que acontece se encerrar</b></div>
        <ul className={styles.bullets}>
          <li>Você recebe a corrida inteira</li>
          <li>Você leva o pacote de volta à loja</li>
          <li>A loja confirma a devolução com um código</li>
        </ul>
      </section>

      {message && <p role="alert" className={blocks.errText}>{message}</p>}

      <div className={styles.bar}>
        <Button variant="secondary" onClick={close} disabled={!ready || sending}>
          {remaining && remaining > 0 ? `Encerrar como ausente · em ${formatClock(remaining)}` : 'Encerrar como ausente'}
        </Button>
        {remaining !== null && remaining > 0 && <small>O botão libera quando a espera terminar</small>}
      </div>
    </div>
  );
}

export default ClienteAusenteView;
