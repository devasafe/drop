import { TriangleAlert } from 'lucide-react';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import blocks from '../../panel/PanelBlocks.module.css';
import type { CancelInfo } from './useRide';
import { rideCode } from './rideView';
import styles from './Corrida.module.css';

/** Substitui o modal antigo de delivery:cancelled. Compensação só quando o servidor disser. */
export function CanceladaView({ ride, cancelInfo, onNext }: { ride: any; cancelInfo: CancelInfo | null; onNext: () => void }) {
  const raw = cancelInfo?.compensation ?? ride?.cancellationCompensation;
  const reason = cancelInfo?.reason ?? ride?.cancelReason ?? ride?.reason ?? null;
  const comp = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
  const picked = !!ride?.pickedAt;
  return (
    <div className={styles.screen}>
      <div className={styles.done}>
        <span className={`${styles.doneIcon} ${styles.doneWarn}`} aria-hidden="true"><TriangleAlert size={28} /></span>
        <h1 className={styles.doneTitle}>A corrida foi cancelada</h1>
        <p className={styles.doneText}>Pedido #{rideCode(ride)}.</p>
      </div>
      <section className={blocks.blk}>
        <dl className={styles.sum}>
          {reason && (
            <div className={styles.sumRow}><dt>Motivo</dt><dd>&quot;{reason}&quot;</dd></div>
          )}
          <div className={styles.sumRow}><dt>Você estava</dt><dd>{picked ? 'com o pacote' : 'a caminho da loja'}</dd></div>
          {comp !== null && (
            <div className={`${styles.sumRow} ${styles.sumTotal}`}><dt>Você recebe</dt><dd>{formatMoney(comp)}</dd></div>
          )}
        </dl>
      </section>
      {!picked && (
        <Alert tone="info" title="Ainda não pegou o pacote">Não precisa voltar à loja.</Alert>
      )}
      <div className={styles.bar}>
        <Button onClick={onNext}>Procurar próxima corrida</Button>
      </div>
    </div>
  );
}

export default CanceladaView;
