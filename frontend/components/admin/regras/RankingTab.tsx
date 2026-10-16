import { useCallback, useEffect, useId, useState } from 'react';
import api from '../../../lib/api';
import { adminErrorMessage } from '../../../lib/adminErrors';
import { formatMoney } from '../../../lib/money';
import { AdminSheet } from '../AdminSheet';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../ui/Toast';
import blocks from '../AdminBlocks.module.css';
import styles from './Ranking.module.css';

/**
 * Regras e taxas · Ranking (D3a, tela 22; antes a página ranking-config). Endpoints de sempre:
 * GET /ranking-prizes, /ranking-prizes/history, /ranking-prizes/config-status;
 * PUT /ranking-prizes { prizes }; POST /ranking-prizes/distribute {}; PUT /ranking-prizes/config-status { enabled }.
 */
interface PrizeEntry { position: number; amount: number; type: 'wallet' | 'manual' }
interface PrizesData { month: number; year: number; prizes: PrizeEntry[]; distributed: boolean; distributedAt?: string }
interface HistoryItem { month: number; year: number; prizes: PrizeEntry[]; distributedAt: string; distributedBy?: { name: string } }

const MONTHS = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthYear = (m: number, y: number) => `${MONTHS[m] ?? ''} de ${y}`;
const DEFAULT_PRIZES: PrizeEntry[] = [
  { position: 1, amount: 500, type: 'wallet' },
  { position: 2, amount: 300, type: 'wallet' },
  { position: 3, amount: 150, type: 'wallet' },
];
const TYPE_OPTIONS = [
  { value: 'wallet', label: 'Crédito na carteira' },
  { value: 'manual', label: 'Manual (externo)' },
];
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

export function RankingTab() {
  const { showToast } = useToast();
  const statusId = useId();
  const prizesId = useId();
  const historyId = useId();
  const [current, setCurrent] = useState<PrizesData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prizes, setPrizes] = useState<PrizeEntry[]>(DEFAULT_PRIZES);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [curr, hist, status] = await Promise.all([
        api.get('/ranking-prizes'),
        api.get('/ranking-prizes/history'),
        api.get('/ranking-prizes/config-status').catch(() => null),
      ]);
      setCurrent(curr.data);
      setPrizes(curr.data?.prizes?.length ? curr.data.prizes : DEFAULT_PRIZES);
      setHistory(Array.isArray(hist.data) ? hist.data : []);
      setStatusError(status === null);
      setEnabled(status === null ? null : !!status.data?.rankingPrizesEnabled);
    } catch (err) {
      setLoadError(adminErrorMessage(err, 'Não deu para ler os prêmios do ranking.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (idx: number, patch: Partial<PrizeEntry>) => {
    setPrizes((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const toggle = async () => {
    setToggling(true);
    setActionError(null);
    try {
      const res = await api.put('/ranking-prizes/config-status', { enabled: !enabled });
      setEnabled(!!res.data?.rankingPrizesEnabled);
    } catch (err) {
      setActionError(adminErrorMessage(err, 'Erro ao alterar'));
    } finally {
      setToggling(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setActionError(null);
    try {
      await api.put('/ranking-prizes', { prizes });
      showToast('Prêmios salvos', 'success');
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, 'Erro ao salvar'));
    } finally {
      setSaving(false);
    }
  };

  const distribute = async () => {
    const res = await api.post('/ranking-prizes/distribute', {});
    const results: Array<{ credited?: boolean }> = Array.isArray(res.data?.results) ? res.data.results : [];
    const credited = results.filter((r) => r.credited).length;
    setConfirmOpen(false);
    showToast(`Prêmios distribuídos! ${credited} carteira(s) creditada(s).`, 'success');
    await load();
  };

  if (loadError) {
    return (
      <div className={blocks.block}>
        <p className={blocks.errText} role="alert">{loadError}</p>
        <div><Button variant="secondary" onClick={load}>Tentar de novo</Button></div>
      </div>
    );
  }
  if (!current) {
    return (
      <div className={blocks.block} aria-busy="true" aria-label="Carregando">
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={blocks.block} aria-labelledby={statusId}>
        <div className={blocks.blockHead}>
          <h2 id={statusId} className={blocks.blockTitle}>Prêmios do ranking</h2>
          <span className={enabled === null ? styles.badgeUnknown : enabled ? styles.badgeOn : styles.badgeOff}>
            {enabled === null ? 'Situação desconhecida' : enabled ? 'Ativos' : 'Pausados'}
          </span>
        </div>
        <p className={blocks.muted}>
          {statusError
            ? 'Não deu para ler se os prêmios estão ativos.'
            : enabled
              ? 'Dá para distribuir os prêmios do mês (dinheiro real na carteira dos motoboys).'
              : 'A distribuição está bloqueada: nada é pago.'}
        </p>
        <p className={blocks.muted}>É o mesmo freio “Prêmios do ranking” da tela Freios.</p>
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={toggle} loading={toggling} disabled={enabled === null}>
            {enabled ? 'Pausar prêmios' : 'Ativar prêmios'}
          </Button>
          {statusError && <Button variant="secondary" onClick={load}>Tentar de novo</Button>}
        </div>
      </section>

      <section className={blocks.block} aria-labelledby={prizesId}>
        <div className={blocks.blockHead}>
          <h2 id={prizesId} className={blocks.blockTitle}>Prêmios para o top 3</h2>
          <span className={blocks.muted}>{monthYear(current.month, current.year)}</span>
        </div>
        {current.distributed && (
          <Alert tone="success" title={`Prêmios de ${MONTHS[current.month] ?? ''} já distribuídos`}>
            {current.distributedAt ? `Em ${fmtDate(current.distributedAt)}.` : undefined}
          </Alert>
        )}
        <div className={styles.prizes}>
          {prizes.map((p, idx) => {
            const id = `prize-${p.position}`;
            return (
              <div key={p.position} className={styles.prizeRow}>
                <span className={styles.place}>{p.position}º lugar</span>
                <div className={styles.field}>
                  <label htmlFor={id} className={styles.label}>Valor do {p.position}º lugar (R$)</label>
                  <input
                    id={id}
                    type="number"
                    min={0}
                    className={styles.input}
                    value={String(p.amount)}
                    onChange={(e) => update(idx, { amount: Number(e.target.value) })}
                  />
                </div>
                <Select
                  label={`Tipo do ${p.position}º lugar`}
                  value={p.type}
                  onChange={(v) => update(idx, { type: v === 'manual' ? 'manual' : 'wallet' })}
                  options={TYPE_OPTIONS}
                />
              </div>
            );
          })}
        </div>
        {actionError && <Alert tone="error" title="Não deu certo">{actionError}</Alert>}
        <div className={styles.buttons}>
          <Button onClick={save} loading={saving}>Salvar prêmios</Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)} disabled={current.distributed}>
            {current.distributed ? 'Distribuído' : 'Distribuir prêmios'}
          </Button>
        </div>
      </section>

      {history.length > 0 && (
        <section className={blocks.block} aria-labelledby={historyId}>
          <h2 id={historyId} className={blocks.blockTitle}>Distribuições anteriores</h2>
          <ul className={styles.history}>
            {history.map((h) => (
              <li key={`${h.year}-${h.month}`} className={styles.historyItem}>
                <div className={styles.historyHead}>
                  <span>{monthYear(h.month, h.year)}</span>
                  <span className={styles.historyMeta}>
                    {fmtDate(h.distributedAt)}{h.distributedBy ? ` por ${h.distributedBy.name}` : ''}
                  </span>
                </div>
                <span className={styles.historyMeta}>
                  {h.prizes.map((p) => `${p.position}º ${formatMoney(p.amount)} (${p.type === 'wallet' ? 'carteira' : 'manual'})`).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AdminSheet
        open={confirmOpen}
        title={`Distribuir os prêmios de ${MONTHS[current.month] ?? ''}?`}
        onClose={() => setConfirmOpen(false)}
        primary={{ label: 'Distribuir prêmios', tone: 'danger', onClick: distribute }}
      >
        <p className={blocks.muted}>
          Credita os prêmios do tipo “Crédito na carteira” nos primeiros do ranking deste mês. Não dá para desfazer.
        </p>
      </AdminSheet>
    </div>
  );
}

export default RankingTab;
