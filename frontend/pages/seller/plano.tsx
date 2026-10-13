// frontend/pages/seller/plano.tsx
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, Wallet } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import ModeGate from '../../components/ModeGate';
import SellerShell from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { uploadStoreImage, MAX_IMAGE_BYTES } from '../../components/seller/loja/IdentitySheet';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import api from '../../lib/api';
import { imageUrl } from '../../lib/config';
import { formatMoney } from '../../lib/money';
import { storeAnalytics } from '../../lib/analyticsApi';
import { payload, apiErrorMessage } from '../../lib/sellerApi';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';
import styles from './SellerPlano.module.css';

const PLANS = [
  { id: 'plan1', n: 1, name: 'Vitrine', who: 'Você entrega' },
  { id: 'plan2', n: 2, name: 'Pool de motoboys', who: 'Motoboys do DROP' },
  { id: 'plan3', n: 3, name: 'Premium', who: 'Motoboys e banner no Início' },
] as const;
type Plan = (typeof PLANS)[number];

const pad = (n: number) => String(n).padStart(2, '0');
const ddmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

/** Mês anterior inteiro (datas locais YYYY-MM-DD) e o nome do mês. */
export function prevMonthRange(now: Date = new Date()) {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: iso(first), to: iso(last), label: first.toLocaleDateString('pt-BR', { month: 'long' }) };
}

/** Quanto a loja recebe de uma venda depois da comissão (mesma conta de calculateOrderDistribution). */
export function received(sales: number, commissionPct: number): number {
  return Math.round(sales * (1 - commissionPct / 100) * 100) / 100;
}

function PlanoInner() {
  const { store, refresh } = useSellerPanel();
  const { showToast } = useToast();
  const { loading: modeLoading, error: modeError, retry: modeRetry } = useSaasConfig();
  const month = useMemo(() => prevMonthRange(), []);
  const [sub, setSub] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [sales, setSales] = useState<number | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [s, c] = await Promise.all([api.get('/settings/store-subscription'), api.get('/settings/platform-config')]);
      setSub(payload(s));
      setConfig(payload(c));
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    storeAnalytics.overview('custom', { from: month.from, to: month.to })
      .then((o) => setSales(Number(o?.current?.revenue) || 0))
      .catch(() => setSales(null));
  }, [month]);

  const current: Plan = PLANS.find((p) => p.id === sub?.currentPlan) ?? PLANS[0];
  const commissionOf = (p: Plan) => Number(config?.[`commissionPlan${p.n}`] ?? 0);
  const custom = store?.customCommissionRate != null ? Number(store.customCommissionRate) : null;
  const myCommission = custom ?? commissionOf(current);
  const pending = sub?.planChangeStatus === 'pending';
  const requested = PLANS.find((p) => p.id === sub?.requestedPlan);

  const cancelChange = async () => {
    setBusy(true);
    try {
      const r = await api.delete('/settings/store-subscription/request-change');
      setSub(payload(r) ?? { ...sub, planChangeStatus: 'none', requestedPlan: null });
      showToast('Pedido de troca cancelado', 'success');
    } catch (e) {
      showToast(apiErrorMessage(e, 'Não foi possível cancelar agora. Tente de novo.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const requestChange = async () => {
    if (!confirmPlan) return;
    setBusy(true);
    try {
      const r = await api.post('/settings/store-subscription/request-change', { newPlan: confirmPlan.id });
      setSub(r.data?.subscription ?? payload(r));
      setConfirmPlan(null);
      showToast('Pedido enviado para o DROP', 'success');
    } catch (e) {
      showToast(apiErrorMessage(e, 'Não foi possível pedir a troca agora. Tente de novo.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onBanner = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) { showToast('A imagem pode ter até 5 MB.', 'error'); return; }
    setBannerBusy(true);
    try {
      await uploadStoreImage(String(store?._id), 'featured', file);
      showToast('Banner enviado', 'success');
      refresh();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Não foi possível enviar o banner. Tente de novo.'), 'error');
    } finally {
      setBannerBusy(false);
    }
  };

  if (modeError && !modeLoading) {
    // sem confirmar o modo, não mostra plano nem comissão (o hook assume custódia no erro)
    return <div className={blocks.body}><EmptyState variant="error" icon={<Wallet />} title="Não carregamos o seu plano" onRetry={() => modeRetry?.()} /></div>;
  }
  if (failed) {
    return <div className={blocks.body}><EmptyState variant="error" icon={<Wallet />} title="Não carregamos o seu plano" onRetry={load} /></div>;
  }
  if (modeLoading || !sub || !config) {
    return (
      <div className={blocks.body}>
        <Skeleton height={160} radius="var(--radius-lg)" />
        <Skeleton height={200} radius="var(--radius-lg)" />
      </div>
    );
  }

  return (
    <div className={blocks.body}>
      <section className={[blocks.blk, blocks.blkBrand].join(' ')} aria-label="Plano atual">
        <div className={blocks.head}>
          <h2 className={blocks.headTitle}>{`${current.name} · Plano ${current.n}`}</h2>
          <span className={[blocks.tag, blocks.tagOk].join(' ')}>ativo</span>
        </div>
        <div className={blocks.kpis}>
          <div className={blocks.kpi}>
            <small>Sua comissão</small>
            <b>{`${myCommission}%`}</b>
            <em>{custom != null ? 'condição especial' : 'padrão do plano'}</em>
          </div>
          <div className={blocks.kpi}>
            <small>{`Vendas em ${month.label}`}</small>
            <b>{sales != null ? formatMoney(sales) : '—'}</b>
            <em>produtos, sem o frete</em>
          </div>
        </div>
        {sales != null && <p className={blocks.sub}>{`Em ${month.label} você recebeu ${formatMoney(received(sales, myCommission))} das suas vendas.`}</p>}
      </section>

      {pending && requested && (
        <Alert tone="info" title={`Troca para ${requested.name} em análise`} action={busy ? undefined : { label: 'Cancelar pedido de troca', onClick: cancelChange }}>
          {`${sub.requestedAt ? `Pedida em ${ddmm(sub.requestedAt)}. ` : ''}Até a aprovação, segue valendo o plano ${current.name}.`}
        </Alert>
      )}
      {sub.planChangeStatus === 'rejected' && (
        <Alert tone="error" title="Troca de plano recusada">
          {sub.rejectionReason || 'O DROP não aprovou a troca. Fale com o suporte para entender o motivo.'}
        </Alert>
      )}

      <section className={blocks.blk} aria-label="Banner no Início">
        <div className={blocks.head}>
          <h2 className={blocks.headTitle}>Seu banner no Início</h2>
          <span className={[blocks.tag, blocks.tagWarn].join(' ')}>Premium</span>
        </div>
        <div className={styles.banner}>
          {store?.featuredBannerUrl
            ? <img src={imageUrl(store.featuredBannerUrl)} alt="Banner da loja no Início" />
            : <span className={blocks.meta}>Sem banner ainda</span>}
        </div>
        <p className={blocks.sub}>
          {current.id === 'plan3'
            ? 'Aparece no carrossel do Início para os clientes da região.'
            : 'Pode enviar agora: ele entra no ar quando o Premium for aprovado.'}
        </p>
        <label className={blocks.fileBtn}>
          <Upload size={16} aria-hidden="true" /> {bannerBusy ? 'Enviando…' : 'Enviar banner'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className={blocks.hiddenInput} aria-label="Escolher o banner do Início" disabled={bannerBusy} onChange={onBanner} />
        </label>
        <span className={blocks.meta}>1200 × 400 · texto curto, sem preço que muda todo dia</span>
      </section>

      <div className={blocks.head}>
        <h2 className={blocks.headTitle}>Comparar</h2>
        <span className={blocks.meta}>{`quanto você teria recebido em ${month.label}`}</span>
      </div>
      <ul className={blocks.list}>
        {PLANS.map((p) => {
          const isCurrent = p.id === current.id;
          const c = isCurrent ? myCommission : commissionOf(p);
          const money = sales != null ? formatMoney(received(sales, c)) : 'sem vendas no mês';
          const isRequested = pending && p.id === sub.requestedPlan;
          return (
            <li key={p.id} className={[blocks.row, isCurrent && blocks.rowCurrent].filter(Boolean).join(' ')}>
              <span className={blocks.tx}>
                <b>{`${p.name} · ${c}%`}</b>
                <span>{`${isCurrent ? 'Plano atual' : p.who} · ${money}`}</span>
              </span>
              {isCurrent ? (
                <span className={[blocks.tag, blocks.tagBrand].join(' ')}>atual</span>
              ) : isRequested ? (
                <span className={[blocks.tag, blocks.tagWarn].join(' ')}>em análise</span>
              ) : (
                <Button size="sm" variant="secondary" aria-label={`Trocar para ${p.name}`} disabled={pending} onClick={() => setConfirmPlan(p)}>Trocar</Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className={blocks.meta}>Sem fidelidade. A troca de plano passa pela aprovação do DROP.</p>

      <Sheet open={!!confirmPlan} onClose={() => setConfirmPlan(null)} title={confirmPlan ? `Trocar para ${confirmPlan.name}?` : undefined} presentation="bottom">
        {confirmPlan && (
          <div className={blocks.stack}>
            <p className={blocks.sub}>
              {`A comissão passa a ser ${commissionOf(confirmPlan)}% por venda depois que o DROP aprovar. Até lá, segue valendo o plano ${current.name}.`}
            </p>
            <Button loading={busy} onClick={requestChange}>Pedir troca</Button>
            <Button variant="tertiary" onClick={() => setConfirmPlan(null)}>Cancelar</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export default function SellerPlano() {
  return (
    <ProtectedRoute required_role="lojista">
      <ModeGate mode="custodia">
        <SellerShell title="Plano e comissão" back="/seller/loja">
          <PlanoInner />
        </SellerShell>
      </ModeGate>
    </ProtectedRoute>
  );
}
