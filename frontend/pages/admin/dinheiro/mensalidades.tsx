/**
 * Dinheiro · Mensalidades (D3b-4b, spec 6.2). Permissão money:overview (padrão só CEO); a aba aparece só no modo direto.
 * GET /admin/money/saas?month=AAAA-MM&cursor= → cartões (MRR, recebido no mês, em atraso), situação das lojas e
 * faturas do mês (50 por página, "Carregar mais", sempre com o mês da primeira página). Sem `month` o servidor usa
 * o mês atual de São Paulo, e o seletor mostra o mês que ele devolveu. Custódia: só o aviso.
 * Fail closed: erro com "Tentar de novo", nunca zero. Cursor recusado (400): recarrega do começo com aviso.
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminShell from '../../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../../components/admin/AdminTable';
import { Kpi } from '../../../components/admin/Kpi';
import blocks from '../../../components/admin/AdminBlocks.module.css';
import { EmptyNote, LoadError, LoadSkeleton } from '../../../components/admin/LoadState';
import { StatusTag } from '../../../components/admin/StatusTag';
import ui from '../../../components/admin/dinheiro/Dinheiro.module.css';
import { serverErrorMessage } from '../../../components/admin/dinheiro/serverError';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import api from '../../../lib/api';
import { plural } from '../../../lib/adminMoney';
import {
  MONTH_RE, SAAS_BILLING_STATUSES, SAAS_SITUATION_LABEL, formatDueDate, invoiceStatus, isSaasRevenue, monthLabel,
  type SaasInvoice, type SaasRevenueDirect,
} from '../../../lib/adminSaasRevenue';
import { formatMoney } from '../../../lib/money';

const LIST_CHANGED = 'A lista mudou; recarregamos do começo.';
const CUSTODY_TEXT = 'A mensalidade só existe no modo direto.';

const httpStatus = (err: unknown): number | undefined => (err as { response?: { status?: number } } | null)?.response?.status;

export default function AdminDinheiroMensalidadesPage() {
  return (
    <ProtectedRoute required_permission="money:overview">
      <AdminShell title="Dinheiro · Mensalidades" tabs="dinheiro">
        <Mensalidades />
      </AdminShell>
    </ProtectedRoute>
  );
}

function Mensalidades() {
  // '' = mês atual (o servidor decide pelo fuso de São Paulo).
  const [month, setMonth] = useState('');
  const [data, setData] = useState<SaasRevenueDirect | null>(null);
  const [custody, setCustody] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SaasInvoice[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Só a última leitura vale; trava síncrona do "Carregar mais".
  const req = useRef(0);
  const moreInFlight = useRef(false);

  const badMonth = month !== '' && !MONTH_RE.test(month);

  const urlFor = useCallback((c?: string, pageMonth?: string) => {
    const p = new URLSearchParams();
    const m = pageMonth ?? month;
    if (m) p.set('month', m);
    if (c) p.set('cursor', c);
    const qs = p.toString();
    return `/admin/money/saas${qs ? `?${qs}` : ''}`;
  }, [month]);

  const load = useCallback(async (aviso?: string) => {
    const id = ++req.current;
    moreInFlight.current = false;
    setData(null);
    setCustody(false);
    setItems(null);
    setCursor(null);
    setError(null);
    setMoreError(null);
    setNotice(aviso ?? null);
    setLoadingMore(false);
    try {
      const res = await api.get(urlFor());
      if (id !== req.current) return;
      if (!isSaasRevenue(res.data)) throw new Error('resposta fora do formato');
      if (res.data.mode === 'custodia') {
        setCustody(true);
        return;
      }
      setData(res.data);
      setItems(res.data.invoices.items);
      setCursor(res.data.invoices.nextCursor);
    } catch (err) {
      if (id === req.current) setError(serverErrorMessage(err, 'Não deu para carregar as mensalidades.'));
    }
  }, [urlFor]);

  useEffect(() => {
    if (badMonth) {
      req.current += 1; // mês inválido: descarta qualquer leitura em voo
      return;
    }
    void load();
  }, [load, badMonth]);

  const loadMore = async () => {
    if (!cursor || !data || moreInFlight.current) return;
    moreInFlight.current = true;
    const id = req.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      // Mesmo mês da primeira página, mesmo que o mês vire no meio.
      const res = await api.get(urlFor(cursor, data.month));
      if (id !== req.current) return;
      const page = isSaasRevenue(res.data) && res.data.mode === 'direto' ? res.data.invoices : null;
      if (!page) throw new Error('lista fora do formato');
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((i) => i.id));
        return [...(prev ?? []), ...page.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(page.nextCursor);
    } catch (err) {
      if (id !== req.current) return;
      if (httpStatus(err) === 400) {
        // Cursor recusado: repetir o mesmo cursor falharia de novo. Recomeça a lista.
        void load(LIST_CHANGED);
        return;
      }
      setMoreError(serverErrorMessage(err, 'Não deu para carregar mais faturas.'));
    } finally {
      if (id === req.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  };

  if (custody) return <EmptyNote text={CUSTODY_TEXT} />;

  const columns: AdminColumn<SaasInvoice>[] = [
    {
      key: 'loja', header: 'Loja', primary: true,
      render: (i) => <Link href={`/admin/lojas/${encodeURIComponent(i.storeId)}`} className={ui.link}>{i.storeName}</Link>,
    },
    { key: 'valor', header: 'Valor', align: 'right', render: (i) => formatMoney(i.value) },
    { key: 'vencimento', header: 'Vencimento', render: (i) => formatDueDate(i.dueDate) },
    {
      key: 'situacao', header: 'Situação',
      render: (i) => {
        const s = invoiceStatus(i.status);
        return <StatusTag tone={s.tone}>{s.label}</StatusTag>;
      },
    },
  ];

  return (
    <div className={ui.stack}>
      <div className={ui.toolbar}>
        <Input label="Mês" type="month" value={month || data?.month || ''} onChange={setMonth} />
      </div>
      {badMonth ? (
        <p role="alert" className={blocks.errText}>Escolha um mês válido.</p>
      ) : error ? (
        <LoadError message={error} onRetry={() => { void load(); }} />
      ) : !data ? (
        <LoadSkeleton lines={3} />
      ) : (
        <>
          <section aria-label="Resumo das mensalidades">
            <div className={blocks.kpis}>
              <Kpi
                label="Receita recorrente (MRR)"
                value={formatMoney(data.mrr)}
                hint={plural(data.byStatus.active + data.byStatus.past_due, 'loja pagante', 'lojas pagantes')}
              />
              <Kpi label="Recebido no mês" value={formatMoney(data.receivedThisMonth)} hint={monthLabel(data.month)} />
              <Kpi
                label="Em atraso"
                value={formatMoney(data.overdue.amount)}
                hint={plural(data.overdue.stores, 'loja em atraso', 'lojas em atraso')}
              />
            </div>
          </section>

          <section className={blocks.block} aria-label="Situação das lojas">
            <div className={blocks.blockHead}><h2 className={blocks.blockTitle}>Situação das lojas</h2></div>
            <dl className={ui.flow}>
              {SAAS_BILLING_STATUSES.map((s) => (
                <div key={s} className={ui.flowRow}>
                  <dt>{SAAS_SITUATION_LABEL[s]}</dt>
                  <dd>{data.byStatus[s]}</dd>
                </div>
              ))}
            </dl>
            <p className={blocks.muted}>
              {`${plural(data.trialsEndingIn7Days, 'teste acaba', 'testes acabam')} nos próximos 7 dias`}
            </p>
          </section>

          <section className={blocks.block} aria-label="Faturas do mês">
            <div className={blocks.blockHead}>
              <h2 className={blocks.blockTitle}>{`Faturas de ${monthLabel(data.month)}`}</h2>
            </div>
            {notice && <p role="status" className={blocks.muted}>{notice}</p>}
            <AdminTable
              columns={columns}
              rows={items}
              rowKey={(i) => i.id}
              rowLabel={(i) => i.storeName}
              empty="Nenhuma fatura com vencimento neste mês"
              caption="Faturas do mês"
            />
            {moreError && <p role="alert" className={blocks.errText}>{moreError}</p>}
            {items && cursor && (
              <div className={ui.loadMore}>
                <Button variant="secondary" className={ui.touch} loading={loadingMore} onClick={() => { void loadMore(); }}>
                  {moreError ? 'Tentar de novo' : 'Carregar mais'}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
