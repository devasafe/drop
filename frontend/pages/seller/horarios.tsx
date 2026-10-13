import { useEffect, useState } from 'react';
import { CirclePause, Store } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import OperatingHoursEditor from '../../components/OperatingHoursEditor';
import { PauseSheet, isPaused, pausedUntilLabel, resumeStore } from '../../components/seller/loja/PauseSheet';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { openStatus } from '../../lib/storeHours';
import { apiErrorMessage } from '../../lib/sellerApi';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';

export default function SellerHorarios() {
  const { store, orders, refresh } = useSellerPanel();
  const { showToast } = useToast();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => { setPausedUntil(store?.pausedUntil ?? null); }, [store?.pausedUntil]);

  const storeId = store?._id ? String(store._id) : null;
  const paused = isPaused(pausedUntil);
  const st = store ? openStatus({ ...store, pausedUntil }) : null;
  const activeOrders = (orders || []).filter((o: any) => o?.status === 'pago').length;

  const resume = async () => {
    if (!storeId) return;
    setResuming(true);
    try {
      await resumeStore(storeId);
      setPausedUntil(null);
      refresh();
      showToast('Loja reaberta', 'success');
    } catch (e) {
      showToast(apiErrorMessage(e, 'Não foi possível reabrir agora. Tente de novo.'), 'error');
    } finally {
      setResuming(false);
    }
  };

  const title = paused ? pausedUntilLabel(pausedUntil as string) : st?.open ? 'Aberta agora' : 'Fechada agora';
  const sub = paused
    ? 'Reabre sozinha nesse horário'
    : st?.open
      ? (st.closesAt ? `Fecha hoje às ${st.closesAt}` : 'Sem horário definido para hoje')
      : (st?.opensAt ? `Abre hoje às ${st.opensAt}` : 'Fora do horário de hoje');

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Horários" back="/seller/loja">
        {!store ? (
          <div className={blocks.body}>
            <Skeleton height={72} radius="var(--radius-lg)" />
            <Skeleton height={320} radius="var(--radius-lg)" />
          </div>
        ) : (
          <div className={blocks.body}>
            <div className={[blocks.blk, blocks.blkRow].join(' ')}>
              <span className={[blocks.ico, paused ? blocks.icoWarn : st?.open ? blocks.icoOk : ''].filter(Boolean).join(' ')} aria-hidden="true">
                <Store size={20} />
              </span>
              <span className={blocks.tx}>
                <b>{title}</b>
                <span>{sub}</span>
              </span>
              {paused ? (
                <Button size="sm" variant="secondary" loading={resuming} onClick={resume}>Reabrir agora</Button>
              ) : (
                <Button size="sm" variant="secondary" leftIcon={<CirclePause size={16} />} onClick={() => setPauseOpen(true)}>Pausar</Button>
              )}
            </div>
            <Alert tone="info">Fora do horário, a loja aparece como fechada e ninguém consegue pedir.</Alert>
            <OperatingHoursEditor storeId={String(store._id)} initialHours={store.operatingHours} onSaved={refresh} />
          </div>
        )}
        <PauseSheet
          open={pauseOpen}
          onClose={() => setPauseOpen(false)}
          storeId={storeId}
          activeOrders={activeOrders}
          onChanged={(u) => { setPausedUntil(u); refresh(); }}
        />
      </SellerShell>
    </ProtectedRoute>
  );
}