// Etapa "Plano" do cadastro (protótipo 12), embutida em /seller/abrir e reaproveitada por
// /seller/select-plan?onboarding=1. Regra portada sem mudança: escolher outro plano pede a troca
// (POST /settings/store-subscription/request-change, aprovada pelo DROP); ficar no atual, ou no
// plano que já está pedido, não chama a API. Comissões vêm de /settings/platform-config.
import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { RadioRow } from '../../ui/RadioRow';
import { Skeleton } from '../../ui/Skeleton';
import api from '../../../lib/api';
import { formatMoney } from '../../../lib/money';
import { payload, apiErrorMessage } from '../../../lib/sellerApi';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './Etapas.module.css';

const PLANS = [
  { id: 'plan1', n: 1, name: 'Vitrine', desc: 'Plano 1 · você mesmo entrega ou o cliente retira. Frete zero para o cliente.' },
  { id: 'plan2', n: 2, name: 'Pool de motoboys', desc: 'Plano 2 · motoboys do DROP buscam e entregam. O cliente paga o frete.' },
  { id: 'plan3', n: 3, name: 'Premium', desc: 'Plano 3 · motoboys e destaque no Início, com o seu banner.' },
] as const;

export function PlanoStep({ onDone }: { onDone: () => void }) {
  const [sub, setSub] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setFailed(false);
    try {
      const [s, c] = await Promise.all([api.get('/settings/store-subscription'), api.get('/settings/platform-config')]);
      const subData = payload<any>(s);
      setSub(subData);
      setConfig(payload(c));
      setChosen((subData?.planChangeStatus === 'pending' && subData?.requestedPlan) || subData?.currentPlan || 'plan1');
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <EmptyState variant="error" icon={<Wallet />} title="Não carregamos os planos" onRetry={load} />;
  if (!sub || !config) return <Skeleton height={300} radius="var(--radius-lg)" />;

  const commission = (n: number) => Number(config[`commissionPlan${n}`] ?? 0);
  const plan = PLANS.find((p) => p.id === chosen) ?? PLANS[0];

  const start = async () => {
    const same = chosen === sub.currentPlan || (sub.planChangeStatus === 'pending' && sub.requestedPlan === chosen);
    if (same) { onDone(); return; }
    setBusy(true);
    setError('');
    try {
      await api.post('/settings/store-subscription/request-change', { newPlan: chosen });
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, 'Não foi possível salvar o plano. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={blocks.stack} aria-label="Escolha seu plano">
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
              label={<span className={styles.planHead}><span>{p.name}</span><span>{`${c}%`}</span></span>}
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
    </section>
  );
}

export default PlanoStep;
