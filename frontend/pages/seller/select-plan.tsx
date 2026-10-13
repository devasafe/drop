import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Wallet } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import ModeGate from '../../components/ModeGate';
import SellerShell from '../../components/seller/panel/SellerShell';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { RadioRow } from '../../components/ui/RadioRow';
import { Skeleton } from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { payload, apiErrorMessage } from '../../lib/sellerApi';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';

const PLANS = [
  { id: 'plan1', n: 1, name: 'Vitrine', desc: 'Plano 1 · você mesmo entrega ou o cliente retira. Frete zero para o cliente.' },
  { id: 'plan2', n: 2, name: 'Pool de motoboys', desc: 'Plano 2 · motoboys do DROP buscam e entregam. O cliente paga o frete.' },
  { id: 'plan3', n: 3, name: 'Premium', desc: 'Plano 3 · motoboys e destaque no Início, com o seu banner.' },
] as const;

function EscolherPlano() {
  const router = useRouter();
  const ready = router.isReady !== false;
  const onboarding = router.query.onboarding === '1';
  const [sub, setSub] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Com a loja aberta, a troca de plano mora em "Plano e comissão".
  useEffect(() => { if (ready && !onboarding) router.replace('/seller/plano'); }, [ready, onboarding, router]);

  const load = async () => {
    setFailed(false);
    try {
      const [s, c] = await Promise.all([api.get('/settings/store-subscription'), api.get('/settings/platform-config')]);
      const subData = payload<any>(s);
      setSub(subData);
      setConfig(payload(c));
      setChosen(subData?.currentPlan || 'plan1');
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => { if (onboarding) load(); }, [onboarding]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!onboarding) return null;
  if (failed) return <div className={blocks.body}><EmptyState variant="error" icon={<Wallet />} title="Não carregamos os planos" onRetry={load} /></div>;
  if (!sub || !config) return <div className={blocks.body}><Skeleton height={300} radius="var(--radius-lg)" /></div>;

  const commission = (n: number) => Number(config[`commissionPlan${n}`] ?? 0);
  const plan = PLANS.find((p) => p.id === chosen) ?? PLANS[0];

  const start = async () => {
    const same = chosen === sub.currentPlan || (sub.planChangeStatus === 'pending' && sub.requestedPlan === chosen);
    if (same) { router.push('/seller/abrir'); return; }
    setBusy(true);
    setError('');
    try {
      await api.post('/settings/store-subscription/request-change', { newPlan: chosen });
      router.push('/seller/abrir');
    } catch (e) {
      setError(apiErrorMessage(e, 'Não foi possível salvar o plano. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={blocks.body}>
      <p className={blocks.sub}>A diferença é quem entrega e quanto fica com o DROP. Dá para trocar depois.</p>
      <div className={blocks.stack} role="radiogroup" aria-label="Planos">
        {PLANS.map((p) => {
          const c = commission(p.n);
          return (
            <RadioRow
              key={p.id}
              name="plano"
              value={p.id}
              checked={chosen === p.id}
              onChange={setChosen}
              label={`${p.name} · ${c}%`}
              description={`${p.desc} Venda de R$ 100,00 → você recebe ${formatMoney(100 - c)}.`}
            />
          );
        })}
      </div>
      {error && <p role="alert" className={blocks.errText}>{error}</p>}
      <div className={blocks.bar}>
        <Button loading={busy} onClick={start}>{`Começar com ${plan.name}`}</Button>
        <small>Sem fidelidade · a troca de plano passa pela aprovação do DROP</small>
      </div>
    </div>
  );
}

// Tela do modo custódia: fora dele, o ModeGate leva ao painel em vez de bater 404 na API.
export default function SelectPlan() {
  return (
    <ProtectedRoute required_role="lojista">
      <ModeGate mode="custodia">
        <SellerShell title="Escolha seu plano" back="/seller/abrir">
          <EscolherPlano />
        </SellerShell>
      </ModeGate>
    </ProtectedRoute>
  );
}
