import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import api from '../../../lib/api';
import { Sheet } from '../../ui/Sheet';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import type { TransferRow } from '../../drop/asaas/MotoboyTransfersCard';
import { humanizeTransferError, TRANSFER_STATUS_LABEL } from '../../../lib/transferErrors';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { apiError, formatDateTime, formatHour, unwrap } from '../../../lib/sellerApi';
import { ASAAS_URL } from './moneyLabels';
import styles from './StuckPixSheet.module.css';

interface Props {
  transfer: TransferRow | null;
  storeId: string;
  /** PlatformConfig.transferBlockHours: depois disso a loja deixa de receber pedidos diretos novos. */
  blockHours: number | null;
  onClose: () => void;
  onRetried: (t: any) => void;
}

export function StuckPixSheet({ transfer, storeId, blockHours, onClose, onRetried }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  // Envio único: a ref trava o duplo clique antes de o estado `busy` renderizar.
  const sending = useRef(false);

  useEffect(() => { setBusy(false); setMsg(null); sending.current = false; }, [transfer?.id]);

  const first = transfer?.motoboyName ? String(transfer.motoboyName).split(' ')[0] : 'o motoboy';
  const lastError = transfer?.lastError || '';
  const keyMissing = /MOTOBOY_PIX_KEY_MISSING/.test(lastError);
  const noBalance = /saldo|insufficient|balance/i.test(lastError);
  const uncertain = transfer?.status === 'uncertain';
  const withAdmin = transfer?.status === 'failed_final' || uncertain;
  // Só `failed` pode ser reenviado pela loja; `uncertain` pode já ter saído e nunca se tenta de novo.
  const canRetry = transfer?.status === 'failed' && !keyMissing;
  const reason = uncertain
    ? 'Em conferência pelo admin'
    : humanizeTransferError(transfer?.lastError) || (transfer ? TRANSFER_STATUS_LABEL[transfer.status] : '') || 'O Pix não saiu.';
  // O bloqueio de pedidos novos conta da criação da transferência (createdAt), não da primeira falha.
  const deadlineMs = transfer?.createdAt && blockHours ? Date.parse(transfer.createdAt) + blockHours * 3600000 : NaN;

  const retry = async () => {
    if (!transfer || sending.current) return;
    sending.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post(`/stores/${storeId}/transfers/${transfer.id}/retry`);
      const d = unwrap<any>(r);
      const next = d?.transfer ?? d;
      // O servidor só reagenda a tentativa (e não envia com os pagamentos diretos desligados): nunca diga "enviado".
      setMsg({ tone: 'success', text: 'Pedimos uma nova tentativa. Acompanhe na lista.' });
      onRetried(next);
    } catch (err) {
      const e = apiError(err);
      setMsg({
        tone: 'error',
        text: e.message || (e.status === 429 || e.code === 'RETRY_TOO_SOON'
          ? 'Você tentou há pouco. Espere 5 minutos para tentar de novo.'
          : 'Não deu para tentar agora.'),
      });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const title = uncertain ? `O Pix para ${first} está em conferência` : `O Pix para ${first} não saiu`;

  return (
    <Sheet open={!!transfer} onClose={onClose} presentation="bottom" title={title}>
      {transfer && (
        <div className={styles.body}>
          <Alert tone={uncertain ? 'warning' : 'error'} title={reason}>
            {keyMissing
              ? `${first.charAt(0).toUpperCase()}${first.slice(1)} ainda não cadastrou a chave Pix. Avisamos ele.`
              : uncertain
                ? 'O Pix pode ter saído. A DROP confere no Asaas. Não tente de novo.'
                : withAdmin
                  ? 'A DROP está conferindo. Você não precisa fazer nada.'
                  : noBalance
                    ? 'Coloque saldo no Asaas ou espere cair o Pix de uma venda. A gente tenta de novo sozinho.'
                    : 'A gente tenta de novo sozinho.'}
          </Alert>
          <dl className={styles.sum}>
            <div><dt>Entrega</dt><dd>{`#${shortOrderCode(transfer.orderId)}`}</dd></div>
            <div><dt>Valor (frete que o cliente pagou)</dt><dd>{formatMoney(Number(transfer.amount) || 0)}</dd></div>
            {transfer.pixKeyMasked && <div><dt>Chave do motoboy</dt><dd>{transfer.pixKeyMasked}</dd></div>}
            <div>
              <dt>Tentativas</dt>
              <dd>{`${transfer.attempts ?? 0}${transfer.nextAttemptAt && transfer.status === 'failed' ? ` · próxima às ${formatHour(transfer.nextAttemptAt)}` : ''}`}</dd>
            </div>
          </dl>
          {!keyMissing && !withAdmin && Number.isFinite(deadlineMs) && (
            <Alert tone="warning" title={`Prazo: ${formatDateTime(deadlineMs)}`}>
              Se ainda estiver parado, a loja deixa de receber pedidos novos até o Pix sair.
            </Alert>
          )}
          {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={msg.tone === 'error' ? styles.error : styles.ok}>{msg.text}</p>}
          <div className={styles.actions}>
            {canRetry && <Button onClick={retry} loading={busy}>Tentar agora</Button>}
            <a className={styles.link} href={ASAAS_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden="true" /> Abrir o Asaas
            </a>
          </div>
        </div>
      )}
    </Sheet>
  );
}
