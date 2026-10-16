import { useCallback, useEffect, useId, useState } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import type { BrakeKey, SwitchesState } from '../../components/admin/regras/switches';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { adminErrorMessage } from '../../lib/adminErrors';
import blocks from '../../components/admin/AdminBlocks.module.css';
import styles from '../../components/admin/freios/Freios.module.css';

/**
 * Freios (D3a, tela 23): pausar funções que custam dinheiro. GET /admin/switches e
 * PUT /admin/switches { [chave]: !atual } — iguais aos de hoje; a confirmação fica no cartão.
 */
interface BrakeDef { key: BrakeKey; title: string; on: string; off: string; cost: string }

const BRAKES: BrakeDef[] = [
  {
    key: 'rankingPrizesEnabled',
    title: 'Prêmios do ranking',
    on: 'Dá para distribuir os prêmios mensais (dinheiro na carteira dos melhores motoboys).',
    off: 'Nenhum prêmio é pago. A distribuição fica bloqueada.',
    cost: 'R$ 500 / 300 / 150 por mês',
  },
  {
    key: 'benefitsRedeemEnabled',
    title: 'Resgate de benefícios',
    on: 'Motoboys trocam pontos por benefícios (alguns creditam saldo real).',
    off: 'O resgate fica bloqueado. Nenhum crédito é gerado.',
    cost: 'R$ 20 / 50 por resgate',
  },
  {
    key: 'gamificationPointsEnabled',
    title: 'Gamificação (pontos)',
    on: 'Motoboys acumulam pontos por corrida (alimenta ranking e resgates).',
    off: 'Não acumula pontos. As conquistas continuam funcionando.',
    cost: 'Indireto (habilita ranking e resgates)',
  },
];

export default function FreiosPage() {
  return (
    <ProtectedRoute required_permission="settings:manage">
      <AdminShell title="Freios">
        <FreiosBody />
      </AdminShell>
    </ProtectedRoute>
  );
}

function BrakeCard({ def, on, onSave }: { def: BrakeDef; on: boolean; onSave: (next: boolean) => Promise<void> }) {
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSave(!on);
      setConfirming(false);
    } catch (e) {
      setErr(adminErrorMessage(e, 'Erro ao salvar.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardHead}>
        <h2 id={titleId} className={styles.cardTitle}>{def.title}</h2>
        <span className={on ? styles.badgeOn : styles.badgeOff}>{on ? 'Ativo' : 'Pausado'}</span>
      </div>
      <p className={styles.desc}>{on ? def.on : def.off}</p>
      <p className={styles.cost}>Custo: <strong>{def.cost}</strong></p>
      {confirming ? (
        <div className={styles.confirm} role="group" aria-label={`Confirmar: ${on ? 'pausar' : 'ativar'} ${def.title}`}>
          <p className={styles.confirmText}>
            {on ? `Se pausar: ${def.off}` : `Se ativar: ${def.on} Custo: ${def.cost}.`}
          </p>
          <div className={styles.cardActions}>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={busy}>Cancelar</Button>
            <Button variant={on ? 'danger' : 'primary'} size="sm" onClick={confirm} loading={busy}>Confirmar</Button>
          </div>
        </div>
      ) : (
        <div className={styles.cardActions}>
          <Button variant={on ? 'secondary' : 'primary'} size="sm" onClick={() => { setErr(null); setConfirming(true); }}>
            {on ? 'Pausar' : 'Ativar'}
          </Button>
        </div>
      )}
      {err && <p className={styles.err} role="alert">{err}</p>}
    </article>
  );
}

function FreiosBody() {
  const [state, setState] = useState<SwitchesState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get('/admin/switches');
      setState(r.data);
    } catch (err) {
      setError(adminErrorMessage(err, 'Falha ao carregar os freios.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveBrake = async (key: BrakeKey, next: boolean) => {
    const r = await api.put('/admin/switches', { [key]: next });
    setState(r.data);
  };

  return (
    <div className={styles.page}>
      <Alert tone="info" title="Freios são para gastos que saem do caixa do DROP">
        Cada freio pausa uma função que custa dinheiro. A mudança vale na hora.
      </Alert>

      {error ? (
        <div className={`${blocks.block} ${styles.state}`}>
          <p className={blocks.errText} role="alert">{error}</p>
          <div><Button variant="secondary" onClick={load}>Tentar de novo</Button></div>
        </div>
      ) : !state ? (
        <div className={`${blocks.block} ${styles.state}`} aria-busy="true" aria-label="Carregando">
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
      ) : (
        <div className={styles.list}>
          {BRAKES.map((b) => (
            <BrakeCard key={b.key} def={b} on={!!state[b.key]} onSave={(next) => saveBrake(b.key, next)} />
          ))}
        </div>
      )}

      <p className={styles.foot}>
        As <strong>conquistas</strong> dos motoboys não custam nada e continuam ativas, mesmo com a gamificação pausada.
      </p>
    </div>
  );
}
