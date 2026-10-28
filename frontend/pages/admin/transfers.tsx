/**
 * Dinheiro · Pix aos motoboys (DS v2, D3a, tela 30). Só modo direto (menu directOnly; serviço do modo direto).
 * Chamadas iguais às da página antiga (__tests__/admin.dinheiro.pix.test.tsx):
 * GET /admin/transfers { params: { status?, cursor? } } · POST /admin/transfers/:id/retry ·
 * POST /admin/transfers/:id/resolve { note }. Ações só com payout:release, como a rota.
 * Pix incerto nunca é reenviado: "Tentar agora" só existe em failed/failed_final.
 * D3b-1: compensação com culpa platform vira Pix manual do DROP (payer 'platform', PLATFORM_MANUAL_PIX). O job nunca
 * o envia e o retry responde 409 TRANSFER_MANUAL_PIX: sem "Tentar agora"; o admin paga pelo banco e usa "Resolver".
 * Item sem `payer` (lista antiga) é Pix da loja.
 * "Ver chave" (só Pix manual, payout:release): GET /admin/transfers/:id/pix-key, auditado no Histórico do Dinheiro.
 * A chave vive só no estado local da folha e some ao fechar; nunca vai para log.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { AdminSheet } from '../../components/admin/AdminSheet';
import blocks from '../../components/admin/AdminBlocks.module.css';
import { StatusTag, type StatusTone } from '../../components/admin/StatusTag';
import ui from '../../components/admin/dinheiro/Dinheiro.module.css';
import { TextAreaField } from '../../components/admin/dinheiro/TextAreaField';
import { flattenServerError, serverErrorMessage } from '../../components/admin/dinheiro/serverError';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { humanizeTransferError, TRANSFER_STATUS_LABEL } from '../../lib/transferErrors';

interface Row {
  id: string;
  orderId: string;
  storeName: string | null;
  motoboyName: string | null;
  status: string;
  amount: number;
  attempts: number;
  lastError: string | null;
  pixKeyMasked: string;
  /** Quem paga: a loja (Pix pelo Asaas) ou o DROP (Pix manual). Ausente = loja. */
  payer?: 'store' | 'platform';
  /** "admin:<id>" quando o Pago veio do Resolver, não do Asaas. */
  resolvedBy?: string | null;
}

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'requested', label: 'Em andamento' },
  { value: 'failed', label: 'Falhou' },
  { value: 'failed_final', label: 'Falha final' },
  { value: 'uncertain', label: 'Incerto' },
  { value: 'done', label: 'Pagos' },
];

const TONE: Record<string, StatusTone> = {
  pending: 'neutral', requested: 'info', done: 'ok', failed: 'warn', failed_final: 'bad', uncertain: 'bad',
};
const ACTIONABLE = ['failed', 'failed_final', 'uncertain'];
const RETRYABLE = ['failed', 'failed_final'];

interface RevealedKey { pixKey: string; pixKeyType: string | null; motoboyName: string | null; amount: number }
const PIX_TYPE_LABEL: Record<string, string> = {
  CPF: 'CPF', CNPJ: 'CNPJ', EMAIL: 'E-mail', PHONE: 'Telefone', EVP: 'Chave aleatória',
};

const who = (r: Row) => `${r.storeName ?? 'Loja'} → ${r.motoboyName ?? 'Motoboy'}`;
const isManualPix = (r: Row) => r.payer === 'platform';
/** Pago por um Resolver do admin (não pelo Asaas): pode ser reenviado pela DROP. */
const isReopenable = (r: Row) => r.status === 'done' && !!r.resolvedBy && !isManualPix(r);

export default function AdminTransfersPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const canAct = typeof can === 'function' ? can('payout:release') : false;

  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Row | null>(null);
  const [reopening, setReopening] = useState<Row | null>(null);
  const [note, setNote] = useState('');
  const [keyRow, setKeyRow] = useState<Row | null>(null);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  /** Cada abertura/fechamento invalida a busca em voo: resposta tardia não traz a chave de volta. */
  const keyGen = useRef(0);

  // Geração da consulta: cada carga da 1ª página (troca de filtro, recarga) invalida as respostas em voo,
  // e um "Carregar mais" disparado antes não anexa linhas da lista antiga (igual à página antiga).
  const queryGen = useRef(0);

  const load = useCallback(async () => {
    const gen = ++queryGen.current;
    setNextCursor(null);
    setMoreError(null);
    try {
      const r = await api.get('/admin/transfers', { params: status ? { status } : {} });
      if (gen !== queryGen.current) return;
      setRows(r.data?.data ?? []);
      setNextCursor(r.data?.nextCursor ?? null);
      setError(null);
    } catch {
      if (gen === queryGen.current) setError('Não foi possível carregar as transferências.');
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const gen = queryGen.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const r = await api.get('/admin/transfers', {
        params: status ? { status, cursor: nextCursor } : { cursor: nextCursor },
      });
      if (gen !== queryGen.current) return; // filtro mudou: resposta da lista antiga
      const more: Row[] = r.data?.data ?? [];
      setRows((prev) => {
        const base = prev ?? [];
        return [...base, ...more.filter((m) => !base.some((p) => p.id === m.id))];
      });
      setNextCursor(r.data?.nextCursor ?? null);
    } catch {
      if (gen === queryGen.current) setMoreError('Não deu para carregar mais. Tente de novo.');
    } finally {
      setLoadingMore(false);
    }
  };

  const retry = async (r: Row) => {
    setBusy(r.id);
    try {
      await api.post(`/admin/transfers/${r.id}/retry`);
      showToast('Nova tentativa enviada.', 'success');
      await load();
    } catch (err) {
      showToast(serverErrorMessage(err, 'Ação não concluída.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const resolve = async () => {
    if (!resolving) return;
    try {
      await api.post(`/admin/transfers/${resolving.id}/resolve`, { note: note.trim() });
    } catch (err) {
      throw flattenServerError(err, 'Ação não concluída.');
    }
    setResolving(null);
    setNote('');
    showToast('Transferência marcada como resolvida.', 'success');
    await load();
  };

  const reopen = async () => {
    if (!reopening) return;
    try {
      await api.post(`/admin/transfers/${reopening.id}/reopen`, { note: note.trim() });
    } catch (err) {
      throw flattenServerError(err, 'Ação não concluída.');
    }
    setReopening(null);
    setNote('');
    showToast('Pix de volta na fila. A DROP envia em instantes.', 'success');
    await load();
  };

  const fetchKey = async (r: Row) => {
    const gen = ++keyGen.current;
    setRevealed(null);
    setKeyError(null);
    try {
      const res = await api.get(`/admin/transfers/${r.id}/pix-key`);
      if (gen === keyGen.current) setRevealed(res.data?.data ?? null);
    } catch (err) {
      if (gen === keyGen.current) setKeyError(serverErrorMessage(err, 'Não foi possível buscar a chave Pix.'));
    }
  };

  const openKey = (r: Row) => {
    setKeyRow(r);
    fetchKey(r);
  };

  const closeKey = () => {
    keyGen.current++;
    setKeyRow(null);
    setRevealed(null);
    setKeyError(null);
  };

  const copyKey = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard?.writeText(revealed.pixKey);
    } catch {
      /* sem clipboard (http, permissão): a chave continua visível para copiar à mão */
    }
  };

  const columns: AdminColumn<Row>[] = [
    { key: 'quem', header: 'Loja → motoboy', primary: true, render: who },
    { key: 'pedido', header: 'Pedido', render: (r) => <span className={ui.mono}>{`#${String(r.orderId).slice(-6)}`}</span> },
    {
      key: 'situacao', header: 'Situação',
      render: (r) => (
        <span>
          <StatusTag tone={TONE[r.status] ?? 'neutral'}>{TRANSFER_STATUS_LABEL[r.status] ?? r.status}</StatusTag>
          {isManualPix(r) && <StatusTag tone="info">Pix manual do DROP</StatusTag>}
          <span className={ui.sub}>{`${r.attempts} tentativa(s)${r.pixKeyMasked ? ` · Pix ${r.pixKeyMasked}` : ''}`}</span>
        </span>
      ),
    },
    {
      key: 'motivo', header: 'Motivo',
      render: (r) => {
        if (isManualPix(r) && r.status !== 'done') return <span className={ui.sub}>Pague pelo seu banco e use Resolver</span>;
        const msg = r.lastError && r.status !== 'done' ? humanizeTransferError(r.lastError) : null;
        return msg ? <span className={ui.errLine}>{msg}</span> : '—';
      },
    },
    { key: 'valor', header: 'Valor', align: 'right', render: (r) => formatMoney(Number(r.amount)) },
  ];

  const rowAction = (r: Row) => {
    if (canAct && isReopenable(r)) {
      return (
        <div className={ui.rowActions}>
          <Button size="sm" variant="secondary" className={ui.touch} onClick={() => { setReopening(r); setNote(''); }}>
            Reenviar pela DROP
          </Button>
        </div>
      );
    }
    if (!canAct || !ACTIONABLE.includes(r.status)) return null;
    return (
      <div className={ui.rowActions}>
        {RETRYABLE.includes(r.status) && !isManualPix(r) && (
          <Button size="sm" className={ui.touch} loading={busy === r.id} onClick={() => retry(r)}>Tentar agora</Button>
        )}
        {isManualPix(r) && (
          <Button size="sm" variant="tertiary" className={ui.touch} onClick={() => openKey(r)}>Ver chave</Button>
        )}
        <Button size="sm" variant="secondary" className={ui.touch} onClick={() => { setResolving(r); setNote(''); }}>
          Resolver
        </Button>
      </div>
    );
  };

  return (
    <ProtectedRoute required_permission="payout:view">
      <AdminShell title="Dinheiro · Pix aos motoboys" tabs="dinheiro">
        <div className={ui.stack}>
          <p className={blocks.muted}>
            Pix da loja ao motoboy no modo direto. Em resultado incerto, confira no painel do Asaas antes de marcar como
            resolvido: nunca reenviamos uma transferência incerta.
          </p>
          <section className={blocks.block} aria-label="Pix aos motoboys">
            <div className={ui.toolbar}>
              <Select label="Filtrar por status" value={status} onChange={setStatus} options={FILTERS} />
            </div>
            <AdminTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              rowLabel={who}
              error={error}
              onRetry={load}
              empty="Nenhuma transferência encontrada"
              rowAction={rowAction}
            />
            {moreError && <p role="alert" className={ui.formError}>{moreError}</p>}
            {nextCursor && rows && !error && (
              <div className={ui.loadMore}>
                <Button variant="tertiary" className={ui.touch} loading={loadingMore} onClick={loadMore}>Carregar mais</Button>
              </div>
            )}
          </section>
        </div>

        <AdminSheet
          open={!!resolving}
          title="Resolver Pix"
          onClose={() => setResolving(null)}
          primary={{ label: 'Confirmar resolução', disabled: note.trim().length < 10, onClick: resolve }}
        >
          {resolving && (isManualPix(resolving) ? (
            <p className={blocks.muted}>
              {`Pix manual do DROP de ${formatMoney(Number(resolving.amount))} para ${resolving.motoboyName ?? 'o motoboy'}.`}{' '}
              Pague pelo seu banco e use Resolver com os dados do comprovante na nota.
            </p>
          ) : (
            <p className={blocks.muted}>
              {`Pix de ${formatMoney(Number(resolving.amount))} para ${resolving.motoboyName ?? 'o motoboy'}.`} Confira no
              painel do Asaas antes de resolver: se o Pix anterior já saiu, nunca reenvie.
            </p>
          ))}
          <TextAreaField
            label="Nota da conferência"
            value={note}
            onChange={setNote}
            placeholder={resolving && isManualPix(resolving) ? 'Ex.: Pix pago pelo banco do DROP, comprovante 123' : 'Ex.: conferido no painel do Asaas, Pix concluído'}
            hint="Mínimo de 10 caracteres. Fica no histórico da transferência."
          />
        </AdminSheet>

        <AdminSheet
          open={!!reopening}
          title="Reenviar Pix pela DROP"
          onClose={() => setReopening(null)}
          primary={{ label: 'Reenviar', disabled: note.trim().length < 10, onClick: reopen }}
        >
          {reopening && (
            <p className={blocks.muted}>
              {`Este Pix de ${formatMoney(Number(reopening.amount))} para ${reopening.motoboyName ?? 'o motoboy'} foi marcado como resolvido.`}{' '}
              Se ele não foi pago, a DROP envia de novo pela conta Asaas da loja. Confira antes: se já foi pago por fora, o motoboy recebe em dobro.
            </p>
          )}
          <TextAreaField
            label="Por que reenviar"
            value={note}
            onChange={setNote}
            placeholder="Ex.: marquei como resolvido por engano, o Pix não foi pago"
            hint="Mínimo de 10 caracteres. Fica no Histórico do Dinheiro."
          />
        </AdminSheet>

        <AdminSheet open={!!keyRow} title="Chave Pix do motoboy" onClose={closeKey} secondaryLabel="Fechar">
          {keyError ? (
            <div className={ui.result}>
              <p role="alert" className={ui.formError}>{keyError}</p>
              <Button variant="secondary" className={ui.touch} onClick={() => keyRow && fetchKey(keyRow)}>Tentar de novo</Button>
            </div>
          ) : revealed ? (
            <div className={ui.result}>
              <dl className={ui.detail}>
                <div><dt>Motoboy</dt><dd>{revealed.motoboyName ?? keyRow?.motoboyName ?? 'Motoboy'}</dd></div>
                <div><dt>Valor</dt><dd>{formatMoney(Number(revealed.amount))}</dd></div>
                <div><dt>Tipo</dt><dd>{revealed.pixKeyType ? PIX_TYPE_LABEL[revealed.pixKeyType] ?? revealed.pixKeyType : 'Não informado'}</dd></div>
                <div><dt>Chave</dt><dd className={ui.mono}>{revealed.pixKey}</dd></div>
              </dl>
              <Button variant="secondary" className={ui.touch} onClick={copyKey}>Copiar chave</Button>
            </div>
          ) : (
            <p className={blocks.muted}>Buscando a chave…</p>
          )}
          <p className={ui.hint}>Esta consulta fica registrada no Histórico do Dinheiro.</p>
        </AdminSheet>
      </AdminShell>
    </ProtectedRoute>
  );
}
