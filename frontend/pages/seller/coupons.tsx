import { useCallback, useEffect, useState } from 'react';
import { Plus, Ticket } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { payload, apiErrorCode, apiErrorMessage, apiStatus, parseMoneyInput } from '../../lib/sellerApi';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';
import styles from './SellerCupons.module.css';

export interface Coupon {
  _id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderValue?: number | null;
  maxUses?: number | null;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  isPublic?: boolean;
  endedAt?: string | null;
}
interface Results { uses: number; ordersPaid: number; salesTotal: number; discountTotal: number }

export function couponState(c: Coupon, now: Date = new Date()): 'ativo' | 'pausado' | 'encerrado' {
  if (c.endedAt || new Date(c.validUntil).getTime() < now.getTime()) return 'encerrado';
  return c.isActive ? 'ativo' : 'pausado';
}

export function suggestCode(type: 'percent' | 'fixed', value: string): string {
  const n = Math.round(parseMoneyInput(value));
  return `${type === 'percent' ? 'VOLTA' : 'DESCONTO'}${Number.isFinite(n) && n > 0 ? n : ''}`;
}

const ddmm = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function couponSummary(c: Coupon): string {
  const v = c.discountType === 'percent' ? `${Number(c.discountValue)}% de desconto` : `${formatMoney(Number(c.discountValue))} de desconto`;
  const min = c.minOrderValue ? ` em pedidos acima de ${formatMoney(Number(c.minOrderValue))}` : '';
  return `${v}${min} · até ${ddmm(c.validUntil)}`;
}

function CouponCard({ c, onToggle, onEnd, onResults }: { c: Coupon; onToggle: (c: Coupon) => void; onEnd: (c: Coupon) => void; onResults: (c: Coupon) => void }) {
  const used = Number(c.usedCount) || 0;
  const max = c.maxUses ? Number(c.maxUses) : null;
  const ending = max != null && used / max >= 0.8;
  return (
    <article className={blocks.blk} aria-label={`Cupom ${c.code}`}>
      <div className={blocks.head}>
        <h3 className={styles.code}>{c.code}</h3>
        <span className={[blocks.tag, c.isPublic ? blocks.tagBrand : ''].filter(Boolean).join(' ')}>{c.isPublic ? 'Público' : 'Secreto'}</span>
      </div>
      <p className={blocks.sub}>{couponSummary(c)}</p>
      {max != null && <ProgressBar value={used} max={max} label={`Usos do cupom ${c.code}`} valueText={`${used} de ${max}`} />}
      <p className={[blocks.meta, ending ? blocks.warn : ''].filter(Boolean).join(' ')}>
        {max != null ? `${used} de ${max} usos` : `${used} usos`}{ending ? ' · acaba logo' : ''}
      </p>
      <Switch label="Ativo" checked={c.isActive} onChange={() => onToggle(c)} />
      <div className={blocks.actions}>
        <Button size="sm" variant="secondary" onClick={() => onResults(c)}>Resultados</Button>
        <Button size="sm" variant="tertiary" onClick={() => onEnd(c)}>Encerrar</Button>
      </div>
    </article>
  );
}

function CreateSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [min, setMin] = useState('');
  const [until, setUntil] = useState(() => isoDay(new Date(Date.now() + 30 * 86400000)));
  const [maxUses, setMaxUses] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!codeTouched) setCode(suggestCode(type, value)); }, [type, value, codeTouched]);
  useEffect(() => {
    if (!open) return;
    setType('percent'); setValue(''); setMin(''); setMaxUses(''); setIsPublic(false);
    setUntil(isoDay(new Date(Date.now() + 30 * 86400000)));
    setCode(''); setCodeTouched(false); setError(''); setCodeError('');
  }, [open]);

  const problem = (): string | null => {
    const v = parseMoneyInput(value);
    if (!Number.isFinite(v) || v <= 0) return 'Informe um desconto válido, maior que zero.';
    if (type === 'percent' && v > 100) return 'O desconto em % vai até 100.';
    if (min.trim()) {
      const m = parseMoneyInput(min);
      if (!Number.isFinite(m) || m < 0) return 'Informe um pedido mínimo válido ou deixe em branco.';
    }
    if (maxUses.trim() && !/^[1-9]\d*$/.test(maxUses.trim())) return 'O limite de usos precisa ser um número inteiro maior que zero.';
    if (!until || until < isoDay(new Date())) return 'A validade precisa ser hoje ou depois.';
    if (!/^[A-Z0-9]{3,20}$/.test(code)) return 'Use de 3 a 20 letras ou números, sem espaço.';
    return null;
  };

  const submit = async () => {
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true);
    setError('');
    setCodeError('');
    try {
      await api.post('/coupons', {
        code,
        type: 'store',
        discountType: type,
        discountValue: parseMoneyInput(value),
        minOrderValue: min.trim() ? parseMoneyInput(min) : undefined,
        maxUses: maxUses.trim() ? Number(maxUses) : undefined,
        validFrom: isoDay(new Date()),
        validUntil: until,
        isPublic,
      });
      showToast('Cupom criado', 'success');
      onCreated();
      onClose();
    } catch (e) {
      if (apiStatus(e) === 409) setCodeError('Esse código já está em uso. Tente outro.');
      else setError(apiErrorMessage(e, 'Não foi possível criar o cupom. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Novo cupom" presentation="bottom">
      <div className={blocks.stack}>
        <div className={blocks.chips} role="group" aria-label="Tipo de desconto">
          <Chip label="% de desconto" active={type === 'percent'} onClick={() => setType('percent')} />
          <Chip label="R$ de desconto" active={type === 'fixed'} onClick={() => setType('fixed')} />
        </div>
        <Input label="Valor do desconto" inputMode="decimal" value={value} onChange={setValue} placeholder={type === 'percent' ? 'Ex.: 10' : 'Ex.: 20,00'} />
        <Input label="Pedido mínimo (opcional)" inputMode="decimal" value={min} onChange={setMin} placeholder="Sem mínimo" />
        <Input label="Válido até" type="date" value={until} onChange={setUntil} />
        <Input label="Limite de usos (opcional)" inputMode="numeric" value={maxUses} onChange={setMaxUses} placeholder="Sem limite" />
        <Switch label="Mostrar na página da loja" description="Desligado, só quem tem o código consegue usar." checked={isPublic} onChange={setIsPublic} />
        <Input
          label="Código"
          value={code}
          onChange={(v) => { setCodeTouched(true); setCode(v.toUpperCase().replace(/\s+/g, '')); }}
          hint="Sugerimos um. Pode trocar: letras e números, de 3 a 20."
          error={codeError || undefined}
        />
        {error && <p role="alert" className={blocks.errText}>{error}</p>}
        <Button onClick={submit} loading={busy}>Criar cupom</Button>
      </div>
    </Sheet>
  );
}

export default function SellerCoupons() {
  const { showToast } = useToast();
  const [list, setList] = useState<Coupon[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<Coupon | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [resultsOf, setResultsOf] = useState<Coupon | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [resultsFailed, setResultsFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api.get('/coupons')
      .then((r) => { const d = payload<Coupon[]>(r); setList(Array.isArray(d) ? d : []); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (c: Coupon) => {
    try {
      await api.put(`/coupons/${c._id}/toggle`);
    } catch (e) {
      if (apiErrorCode(e) === 'COUPON_ENDED') showToast('Este cupom foi encerrado e não pode voltar.', 'error');
      else showToast(apiErrorMessage(e, 'Não foi possível mudar o cupom agora.'), 'error');
    }
    load();
  };

  const confirmEnd = async () => {
    if (!ending) return;
    setEndBusy(true);
    try {
      await api.post(`/coupons/${ending._id}/end`);
      showToast('Cupom encerrado', 'success');
      setEnding(null);
      load();
    } catch (e) {
      if (apiStatus(e) === 409) {
        showToast('Este cupom já estava encerrado.', 'error');
        setEnding(null);
        load();
      } else {
        showToast(apiErrorMessage(e, 'Não foi possível encerrar agora.'), 'error');
      }
    } finally {
      setEndBusy(false);
    }
  };

  const openResults = (c: Coupon) => {
    setResultsOf(c);
    setResults(null);
    setResultsFailed(false);
    api.get(`/coupons/${c._id}/results`)
      .then((r) => setResults(payload<Results>(r)))
      .catch(() => setResultsFailed(true));
  };

  const ativos = (list || []).filter((c) => couponState(c) !== 'encerrado');
  const encerrados = (list || []).filter((c) => couponState(c) === 'encerrado');

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell
        title="Cupons"
        back="/seller/loja"
        actions={<Button size="sm" leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>Criar</Button>}
      >
        <div className={blocks.body}>
          {failed ? (
            <EmptyState variant="error" icon={<Ticket />} title="Não carregamos os cupons" onRetry={load} />
          ) : !list ? (
            <>
              <Skeleton height={140} radius="var(--radius-lg)" />
              <Skeleton height={140} radius="var(--radius-lg)" />
            </>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Ticket />}
              title="Cupom traz o cliente de volta"
              description="Crie o primeiro em 30 segundos."
              action={<Button onClick={() => setCreating(true)}>Criar cupom</Button>}
            />
          ) : (
            <>
              {ativos.map((c) => (
                <CouponCard key={c._id} c={c} onToggle={toggle} onEnd={setEnding} onResults={openResults} />
              ))}
              {encerrados.length > 0 && (
                <section aria-label="Encerrados" className={blocks.stack}>
                  <h2 className={blocks.cap}>Encerrados</h2>
                  <ul className={blocks.list}>
                    {encerrados.map((c) => (
                      <li key={c._id} className={blocks.row}>
                        <span className={blocks.tx}>
                          <b className={blocks.mono}>{c.code}</b>
                          <span>{`${c.endedAt ? `Encerrado em ${ddmm(c.endedAt)}` : `Venceu em ${ddmm(c.validUntil)}`} · ${c.usedCount} usos`}</span>
                        </span>
                        <button type="button" className={blocks.link} onClick={() => openResults(c)}>Resultados</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        <CreateSheet open={creating} onClose={() => setCreating(false)} onCreated={load} />

        <Sheet open={!!ending} onClose={() => setEnding(null)} title={ending ? `Encerrar o cupom ${ending.code}?` : undefined} presentation="bottom">
          <div className={blocks.stack}>
            <p className={blocks.sub}>Ele para de valer na hora e não pode ser reativado. O histórico de usos fica guardado.</p>
            <Button variant="danger" loading={endBusy} onClick={confirmEnd}>Encerrar cupom</Button>
            <Button variant="tertiary" onClick={() => setEnding(null)}>Cancelar</Button>
          </div>
        </Sheet>

        <Sheet open={!!resultsOf} onClose={() => setResultsOf(null)} title={resultsOf ? `Resultados do ${resultsOf.code}` : undefined} presentation="bottom">
          {resultsFailed ? (
            <p className={blocks.errText}>Não carregamos os resultados. Feche e tente de novo.</p>
          ) : !results ? (
            <Skeleton height={120} />
          ) : (
            <div className={blocks.kpis}>
              <div className={blocks.kpi}><small>Usos</small><b>{results.uses}</b></div>
              <div className={blocks.kpi}><small>Pedidos pagos</small><b>{results.ordersPaid}</b></div>
              <div className={blocks.kpi}><small>Vendas com o cupom</small><b>{formatMoney(Number(results.salesTotal) || 0)}</b></div>
              <div className={blocks.kpi}><small>Desconto dado</small><b>{formatMoney(Number(results.discountTotal) || 0)}</b></div>
            </div>
          )}
        </Sheet>
      </SellerShell>
    </ProtectedRoute>
  );
}
