import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { ChevronRight } from 'lucide-react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import useCancellation from '../../../hooks/useCancellation';
import { apiError } from '../../../lib/sellerApi';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './ProblemSheet.module.css';

export type ProblemStage = 'retirar' | 'entregar';
export interface ProblemOption {
  key: string;
  label: string;
  sub: string;
  tone: 'warn' | 'err' | 'info';
  kind: 'reject' | 'absent' | 'other';
  code?: string;
  reason?: string;
}

/** Só motivos que o reject já recebe (mesmos códigos do modal antigo). Nada de motivo novo sem rota. */
export const PROBLEM_OPTIONS: Record<ProblemStage, ProblemOption[]> = {
  retirar: [
    { key: 'loja_demorando', label: 'Loja demorando', sub: 'Devolve a corrida, sem taxa', tone: 'warn', kind: 'reject', code: 'other', reason: 'Loja demorando para liberar o pedido' },
    { key: 'nao_consigo_ir', label: 'Não consigo ir', sub: 'Devolve a corrida, sem taxa', tone: 'warn', kind: 'reject', code: 'delivery_failed', reason: 'Não consigo chegar ao local' },
    { key: 'moto', label: 'Problema com a moto', sub: 'Devolve a corrida, sem taxa', tone: 'err', kind: 'reject', code: 'motoboy_unavailable', reason: 'Problema pessoal ou técnico' },
    { key: 'outro', label: 'Outro motivo', sub: 'Conte o que aconteceu', tone: 'info', kind: 'other', code: 'other' },
  ],
  entregar: [
    { key: 'ausente', label: 'Cliente não atende', sub: 'Conta a espera no local', tone: 'warn', kind: 'absent' },
    { key: 'endereco', label: 'Endereço errado ou não encontro', sub: 'Devolve o pacote à loja', tone: 'warn', kind: 'reject', code: 'address_invalid', reason: 'Endereço incorreto ou não encontrado' },
    { key: 'danificado', label: 'Pacote danificado', sub: 'Devolve o pacote à loja', tone: 'err', kind: 'reject', code: 'other', reason: 'Pacote danificado' },
    { key: 'moto', label: 'Problema com a moto', sub: 'Devolve o pacote à loja', tone: 'err', kind: 'reject', code: 'motoboy_unavailable', reason: 'Problema pessoal ou técnico' },
    { key: 'outro', label: 'Outro motivo', sub: 'Conte o que aconteceu', tone: 'info', kind: 'other', code: 'other' },
  ],
};

const ICON_TONE = { warn: blocks.icoWarn, err: blocks.icoErr, info: blocks.icoInfo } as const;

export interface ProblemSheetProps {
  open: boolean;
  onClose: () => void;
  deliveryId: string;
  orderCode: string;
  stage: ProblemStage;
  /** Abre direto na confirmação deste motivo (ex.: "Devolver corrida" da retirada atrasada). */
  initialKey?: string;
  onCustomerAbsent: () => void;
  onDone: (r: { pending: boolean; pinDevolucao: string | null }) => void;
}

export function ProblemSheet({ open, onClose, deliveryId, orderCode, stage, initialKey, onCustomerAbsent, onDone }: ProblemSheetProps) {
  const options = PROBLEM_OPTIONS[stage];
  const textId = useId();
  const { rejectDelivery } = useCancellation();
  const [chosen, setChosen] = useState<ProblemOption | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    setChosen(options.find((o) => o.key === initialKey) ?? null);
    setText('');
    setError(null);
  }, [open, initialKey, options]);

  const pick = (o: ProblemOption) => {
    if (o.kind === 'absent') { onCustomerAbsent(); return; }
    setChosen(o);
    setError(null);
  };

  const confirm = async () => {
    if (!chosen || inFlight.current) return;
    const reason = chosen.kind === 'other' ? text.trim() : chosen.reason || chosen.label;
    if (!reason) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const r: any = await rejectDelivery(deliveryId, reason, 'reassign', chosen.code);
      if (r?.success) {
        onDone({ pending: !!r.isPending, pinDevolucao: r.pinDevolucao ?? r.data?.pinDevolucao ?? null });
      } else {
        setError(r?.error || 'Não deu para devolver agora. Tente de novo.');
      }
    } catch (err) {
      setError(apiError(err).message || 'Não deu para devolver agora. Tente de novo.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const consequence = stage === 'retirar'
    ? 'A corrida volta para outros entregadores. Devolver antes de retirar o pacote não tem taxa.'
    : 'Você leva o pacote de volta à loja e mostra o código de devolução. Devolver depois da retirada pode ter taxa de cancelamento.';

  return (
    <Sheet open={open} onClose={onClose} presentation="bottom" title={chosen ? (stage === 'retirar' ? 'Devolver a corrida?' : 'Devolver o pacote à loja?') : 'O que aconteceu?'}>
      {!chosen ? (
        <div className={styles.body}>
          <p className={blocks.meta}>Pedido #{orderCode}</p>
          <ul className={blocks.list}>
            {options.map((o) => (
              <li key={o.key}>
                <button type="button" className={`${blocks.row} ${blocks.rowButton}`} onClick={() => pick(o)}>
                  <span className={`${blocks.ico} ${ICON_TONE[o.tone]}`} aria-hidden="true">!</span>
                  <span className={blocks.tx}><b>{o.label}</b><span>{o.sub}</span></span>
                  <ChevronRight size={18} className={blocks.chev} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <Link href={MOTOBOY_ROUTES.perfilAjuda} className={blocks.link}>Falar com o suporte</Link>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      ) : (
        <div className={styles.body}>
          <p className={blocks.sub}>{consequence}</p>
          <p className={blocks.meta}>Motivo: {chosen.label}</p>
          {chosen.kind === 'other' && (
            <div className={styles.field}>
              <label htmlFor={textId} className={styles.label}>O que aconteceu?</label>
              <textarea id={textId} className={styles.textarea} value={text} maxLength={300} rows={3} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
          {error && <p role="alert" className={blocks.errText}>{error}</p>}
          <div className={styles.buttons}>
            <Button variant="tertiary" onClick={() => setChosen(null)} disabled={sending}>Voltar</Button>
            <Button variant="danger" onClick={confirm} disabled={sending || (chosen.kind === 'other' && !text.trim())} loading={sending}>Devolver corrida</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default ProblemSheet;
