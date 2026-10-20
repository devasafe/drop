/**
 * Precisa de mim (D3b-1, spec 3.1; protótipo tela 1). Permissão operation:view (padrão só CEO).
 * GET /admin/ops/summary → KPIs de hoje, "Pedidos por hora hoje" e "Saúde agora" (últimas 2 h).
 * GET /admin/queue → "Fila de hoje": cada tipo vem só para quem tem a permissão do assunto; um tipo que falhou
 * mostra a própria linha de erro sem esconder os outros. Ordem: dinheiro do cliente → pessoa esperando →
 * receita → operação; no grupo, a mais antiga primeiro. Cada bloco carrega e falha sozinho (fail closed).
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { Kpi } from '../../components/admin/Kpi';
import { EmptyNote, LoadError, LoadSkeleton } from '../../components/admin/LoadState';
import { StatusTag } from '../../components/admin/StatusTag';
import { serverErrorMessage } from '../../components/admin/dinheiro/serverError';
import ui from '../../components/admin/operacao/Operacao.module.css';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { plural } from '../../lib/adminMoney';
import {
  QUEUE_FILTERS, QUEUE_TAG_TONE, QUEUE_TYPE_LABEL, ageLabel, buildQueueRows, fetchOpsSummary, fetchQueue,
  gmvComparison, minutesLabel, pctLabel, queueTotal,
  type OpsSummary, type QueueFilter, type QueueGroupEntry, type QueueRow,
} from '../../lib/adminOps';
import { formatMoney } from '../../lib/money';

export default function AdminOperacaoPage() {
  return (
    <ProtectedRoute required_permission="operation:view">
      <AdminShell title="Precisa de mim">
        <PrecisaDeMim />
      </AdminShell>
    </ProtectedRoute>
  );
}

function PrecisaDeMim() {
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [groups, setGroups] = useState<QueueGroupEntry[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>('tudo');
  const [now, setNow] = useState(() => Date.now());

  const loadSummary = useCallback(async () => {
    setSummaryError(null);
    setSummary(null);
    try {
      setSummary(await fetchOpsSummary());
    } catch (err) {
      setSummaryError(serverErrorMessage(err, 'Não deu para carregar os números de hoje.'));
    }
  }, []);

  /** `silent`: "Tentar de novo" de um tipo relê a fila sem apagar as linhas que já estão na tela. */
  const loadQueue = useCallback(async (silent = false) => {
    setQueueError(null);
    if (!silent) setGroups(null);
    try {
      const q = await fetchQueue();
      setGroups(q.groups);
      setNow(Date.now());
    } catch (err) {
      setQueueError(serverErrorMessage(err, 'Não deu para carregar a fila de hoje.'));
    }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void loadQueue(); }, [loadQueue]);
  // "há N min" anda sozinho entre uma leitura e outra.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const rows = groups ? buildQueueRows(groups, filter) : null;

  return (
    <div className={ui.stack}>
      <section aria-label="Hoje">
        {summaryError ? (
          <LoadError message={summaryError} onRetry={() => { void loadSummary(); }} />
        ) : !summary ? (
          <LoadSkeleton lines={2} />
        ) : (
          <TodayKpis s={summary} />
        )}
      </section>

      <div className={ui.split}>
        <section className={blocks.block} aria-label="Fila de hoje">
          <div className={blocks.blockHead}>
            <h2 className={blocks.blockTitle}>{groups ? `Fila de hoje · ${queueTotal(groups, filter)}` : 'Fila de hoje'}</h2>
          </div>
          <div className={ui.filters} role="group" aria-label="Filtrar a fila">
            {QUEUE_FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={filter === f.key} onClick={() => setFilter(f.key)} />
            ))}
          </div>
          {queueError ? (
            <LoadError message={queueError} onRetry={() => { void loadQueue(); }} />
          ) : !rows ? (
            <LoadSkeleton lines={5} />
          ) : rows.length === 0 ? (
            <EmptyNote text="Nada depende de você agora" />
          ) : (
            <ul className={ui.queue} aria-label="Itens da fila">
              {rows.map((r) => <QueueLine key={r.key} row={r} now={now} onRetry={() => { void loadQueue(true); }} />)}
            </ul>
          )}
        </section>

        <div className={ui.side}>
          <section className={blocks.block} aria-label="Pedidos por hora hoje">
            <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Pedidos por hora hoje</h2></div>
            {summaryError ? (
              <p className={blocks.muted}>Sem os números de hoje (veja o erro acima).</p>
            ) : !summary ? (
              <LoadSkeleton lines={4} />
            ) : (
              <PerHour perHour={summary.perHour} />
            )}
          </section>
          <section className={blocks.block} aria-label="Saúde agora">
            <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Saúde agora</h2></div>
            {summaryError ? (
              <p className={blocks.muted}>Sem os números de hoje (veja o erro acima).</p>
            ) : !summary ? (
              <LoadSkeleton lines={3} />
            ) : (
              <>
                <dl className={ui.facts}>
                  <div><dt>Aceite médio da loja</dt><dd>{minutesLabel(summary.health.storeAcceptAvgMin)}</dd></div>
                  <div><dt>Achar motoboy</dt><dd>{minutesLabel(summary.health.findMotoboyAvgMin)}</dd></div>
                  <div><dt>Entrega média</dt><dd>{minutesLabel(summary.health.deliveryAvgMin)}</dd></div>
                </dl>
                <p className={blocks.muted}>Últimas 2 horas</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TodayKpis({ s }: { s: OpsSummary }) {
  const t = s.today;
  return (
    <div className={blocks.kpis}>
      <Kpi label="GMV hoje" value={formatMoney(t.gmv)} hint={gmvComparison(t.gmv, t.gmvLastWeekSameTime)} />
      <Kpi label="Pedidos hoje" value={t.orders} hint={`${t.ordersActive} em andamento`} />
      <Kpi label="Cancelamentos" value={pctLabel(t.cancelPct)} hint={plural(t.cancelLate, 'tardio', 'tardios')} />
      <Kpi
        label="Motoboys online"
        value={t.motoboysOnline}
        hint={`${t.motoboysDelivering} em entrega · ${t.motoboysFree} livres`}
      />
    </div>
  );
}

function QueueLine({ row, now, onRetry }: { row: QueueRow; now: number; onRetry: () => void }) {
  if (row.kind === 'error') {
    return (
      <li className={ui.queueRow}>
        <p className={ui.rowError} role="alert">
          {/* Texto do servidor (g.error); o nome do assunto é a reserva. */}
          {row.message.trim() || `Não deu para carregar ${QUEUE_TYPE_LABEL[row.type]}`}
          <span aria-hidden="true">·</span>
          <Button variant="tertiary" size="sm" onClick={onRetry}>Tentar de novo</Button>
        </p>
      </li>
    );
  }
  if (row.kind === 'more') {
    return (
      <li className={ui.queueRow}>
        <span className={ui.rowNote}>{`Mais ${row.count} em ${QUEUE_TYPE_LABEL[row.type]}`}</span>
      </li>
    );
  }
  const it = row.item;
  return (
    <li className={ui.queueRow}>
      <div className={ui.queueText}>
        <strong className={ui.queueTitle}>{it.title}</strong>
        {it.context && <span className={ui.queueContext}>{it.context}</span>}
      </div>
      <div className={ui.queueMeta}>
        <span className={ui.age}>{ageLabel(it.since, now)}</span>
        <StatusTag tone={QUEUE_TAG_TONE[it.tag] ?? 'neutral'}>{it.tag}</StatusTag>
        <Link href={it.href} className={ui.go} aria-label={`Resolver: ${it.title}`}>Resolver</Link>
      </div>
    </li>
  );
}

function PerHour({ perHour }: { perHour: OpsSummary['perHour'] }) {
  const max = Math.max(0, ...perHour.map((h) => h.count));
  if (max === 0) return <EmptyNote text="Nenhum pedido hoje ainda" />;
  return (
    <ul className={ui.bars}>
      {perHour.map((h) => {
        const hh = `${String(h.hour).padStart(2, '0')}h`;
        return (
          <li key={h.hour} className={ui.bar}>
            <span>{hh}</span>
            <ProgressBar value={h.count} max={max} label={`Pedidos às ${hh}`} valueText={plural(h.count, 'pedido', 'pedidos')} />
            <span>{h.count}</span>
          </li>
        );
      })}
    </ul>
  );
}
