import { Sheet } from '../../ui/Sheet';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { formatDateTime, formatHour } from '../../../lib/sellerApi';
import { transferView } from '../../../lib/motoboyMoney';
import type { MoneyInfo } from '../../../lib/motoboyMoney';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './PixAtrasadoSheet.module.css';

const HOUR = 60 * 60 * 1000;

export interface PixAtrasadoSheetProps {
  transfer: MoneyInfo | null;
  /** PlatformConfig.transferBlockHours: depois disso a loja para de receber pedidos novos (failed/failed_final). */
  blockHours: number | null;
  onClose: () => void;
  onSupport: () => void;
}

/**
 * Pix atrasado (protótipo "Pix atrasado"), SÓ INFORMATIVA: quem envia o Pix é a loja, então o
 * motoboy não tem "Tentar agora". Nenhuma chamada de API sai daqui. Rótulo, tom e explicação de
 * cada status vêm de transferView (fonte única, K30).
 */
export function PixAtrasadoSheet({ transfer, blockHours, onClose, onSupport }: PixAtrasadoSheetProps) {
  const t = transfer;
  const view = t ? transferView(t.status) : null;
  const created = t?.createdAt ?? null;
  const storeBlocks = t?.status === 'failed' || t?.status === 'failed_final';
  const createdMs = created ? Date.parse(created) : NaN;
  const deadline = storeBlocks && blockHours && Number.isFinite(createdMs) ? formatDateTime(createdMs + blockHours * HOUR) : null;

  return (
    <Sheet open={!!t} onClose={onClose} presentation="bottom" title={t ? `${formatMoney(t.amount)} da loja` : 'Pix'}>
      {t && view && (
        <div className={styles.body}>
          <p className={blocks.sub}>{`Entrega #${shortOrderCode(t.orderId || '')}${created ? ` · ${formatDateTime(created)}` : ''}`}</p>
          <ol className={styles.tl}>
            <li className={styles.done}><span>Entrega confirmada com o PIN</span><time>{formatHour(created) ?? ''}</time></li>
            <li className={styles.done}><span>Pix pedido à conta da loja</span><time>{formatHour(created) ?? ''}</time></li>
            <li className={styles.current}><span>{view.label}<small>{view.detail}</small></span></li>
            <li className={styles.todo}><span>Na sua conta</span></li>
          </ol>
          <Alert tone="info" title="Você vai receber">
            {storeBlocks
              ? deadline
                ? `Se o Pix não sair até ${deadline}, a loja para de receber pedidos novos e a DROP entra no caso.`
                : 'Se o Pix demorar, a loja para de receber pedidos novos e a DROP entra no caso.'
              : 'A gente avisa aqui quando o Pix cair na sua chave.'}
          </Alert>
          <div className={styles.btns}>
            <Button variant="secondary" onClick={onSupport}>Falar com o suporte</Button>
            <Button onClick={onClose}>Entendi</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default PixAtrasadoSheet;
