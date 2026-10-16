import { FormEvent, useCallback, useEffect, useId, useState } from 'react';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable';
import { Kpi } from '../../components/admin/Kpi';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { adminErrorMessage } from '../../lib/adminErrors';
import { couponCostText, couponMaxCost } from '../../lib/couponCost';
import { formatMoney } from '../../lib/money';
import { parseAmount } from '../../lib/adminAmount';
import blocks from '../../components/admin/AdminBlocks.module.css';
import styles from '../../components/admin/comunicacao/Cupons.module.css';

/**
 * Avisos e broadcasts · Cupons (D3a, tela 21; só o CEO, como hoje). GET /coupons { params },
 * POST /coupons (cupom global), PUT /coupons/:id/toggle. Excluir virou pausar (spec 5.3): não há DELETE na tela.
 */
interface Coupon {
  _id: string;
  code: string;
  type: 'store' | 'global';
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderValue?: number;
  maxUses?: number;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

type Filter = 'all' | 'global' | 'store';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'global', label: 'Globais' },
  { id: 'store', label: 'Por loja' },
];

const today = () => new Date().toISOString().slice(0, 10);
const nextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

function situation(c: Coupon): { label: string; tone: 'on' | 'off' | 'warn' } {
  if (!c.isActive) return { label: 'Pausado', tone: 'off' };
  if (c.maxUses && c.usedCount >= c.maxUses) return { label: 'Esgotado', tone: 'warn' };
  if (new Date(c.validUntil).getTime() < Date.now()) return { label: 'Vencido', tone: 'warn' };
  return { label: 'Ativo', tone: 'on' };
}

export default function AdminCoupons() {
  useRequireAuth(['ceo']);
  return (
    <ProtectedRoute required_role="ceo">
      <AdminShell title="Avisos e broadcasts · Cupons" tabs="comunicacao">
        <CuponsBody />
      </AdminShell>
    </ProtectedRoute>
  );
}

function CuponsBody() {
  const { showToast } = useToast();
  const formId = useId();
  const [filterType, setFilterType] = useState<Filter>('all');
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validFrom, setValidFrom] = useState(today());
  const [validUntil, setValidUntil] = useState(nextMonth());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCoupons = useCallback(async () => {
    setLoadError(null);
    setCoupons(null);
    try {
      const params: Record<string, string> = {};
      if (filterType !== 'all') params.type = filterType;
      const res = await api.get('/coupons', { params });
      setCoupons(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setLoadError(adminErrorMessage(err, 'Não deu para ler os cupons.'));
    }
  }, [filterType]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setFormError('Preencha o código do cupom.');
      return;
    }
    const value = Number(discountValue);
    if (discountValue.trim() === '' || !Number.isFinite(value) || value <= 0) {
      setFormError('O valor do desconto precisa ser maior que zero.');
      return;
    }
    if (discountType === 'percent' && value > 100) {
      setFormError('O desconto percentual não pode passar de 100%.');
      return;
    }
    const maxUsesRaw = maxUses.trim();
    if (maxUsesRaw !== '' && (!/^\d+$/.test(maxUsesRaw) || Number(maxUsesRaw) < 1)) {
      setFormError('O limite de usos tem que ser um número inteiro, 1 ou mais (vazio = ilimitado).');
      return;
    }
    const minOrderRaw = minOrderValue.trim();
    const minOrder = minOrderRaw === '' ? undefined : parseAmount(minOrderRaw);
    if (minOrder === null) {
      setFormError('O pedido mínimo tem que ser um valor em reais, 0 ou mais (ex.: 25,50).');
      return;
    }
    if (!validFrom || !validUntil) {
      setFormError('Preencha as datas de início e fim.');
      return;
    }
    if (validUntil < validFrom) {
      setFormError('A data final não pode ser antes da inicial.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await api.post('/coupons', {
        code,
        type: 'global',
        discountType,
        discountValue: Number(discountValue),
        minOrderValue: minOrder,
        maxUses: maxUsesRaw ? Number(maxUsesRaw) : undefined,
        validFrom,
        validUntil,
      });
      showToast(`Cupom ${code} criado`, 'success');
      setCode('');
      setDiscountValue('10');
      setMinOrderValue('');
      setMaxUses('');
      setValidFrom(today());
      setValidUntil(nextMonth());
      await fetchCoupons();
    } catch (err) {
      setFormError(adminErrorMessage(err, 'Erro ao criar cupom'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (c: Coupon) => {
    try {
      await api.put(`/coupons/${c._id}/toggle`);
      await fetchCoupons();
    } catch (err) {
      showToast(adminErrorMessage(err, 'Não deu para mudar o cupom'), 'error');
    }
  };

  const cost = couponCostText(couponMaxCost({
    discountType,
    discountValue: Number(discountValue),
    maxUses: maxUses ? Number(maxUses) : null,
    minOrderValue: minOrderValue ? Number(minOrderValue) : null,
  }));

  const columns: AdminColumn<Coupon>[] = [
    {
      key: 'code',
      header: 'Cupom',
      primary: true,
      render: (c) => (
        <span>
          <span className={styles.code}>{c.code}</span>
          <span className={blocks.muted}>
            {c.type === 'global' ? 'Global' : 'Loja'} · {c.minOrderValue ? `mín. ${formatMoney(c.minOrderValue)}` : 'sem mínimo'} · até {fmtDate(c.validUntil)}
          </span>
        </span>
      ),
    },
    {
      key: 'discount',
      header: 'Desconto',
      render: (c) => (c.discountType === 'percent' ? `${c.discountValue}%` : formatMoney(c.discountValue)),
    },
    { key: 'uses', header: 'Usos', align: 'right', render: (c) => `${c.usedCount} / ${c.maxUses ?? '∞'}` },
    {
      key: 'status',
      header: 'Situação',
      render: (c) => {
        const s = situation(c);
        return <span className={s.tone === 'on' ? styles.badgeOn : s.tone === 'off' ? styles.badgeOff : styles.badgeWarn}>{s.label}</span>;
      },
    },
  ];

  const active = coupons?.filter((c) => c.isActive).length ?? 0;
  const globals = coupons?.filter((c) => c.type === 'global').length ?? 0;
  const uses = coupons?.reduce((sum, c) => sum + (c.usedCount || 0), 0) ?? 0;

  return (
    <div className={styles.page}>
      {coupons && (
        <div className={blocks.kpis}>
          <Kpi label="Cupons ativos" value={active} />
          <Kpi label="Globais" value={globals} hint="pagos pelo caixa do DROP" />
          <Kpi label="Usos registrados" value={uses} hint="somando a lista" />
          <Kpi label="Na lista" value={coupons.length} />
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.listCol}>
          <div className={styles.filters} role="group" aria-label="Filtrar cupons">
            {FILTERS.map((f) => (
              <Chip key={f.id} label={f.label} active={filterType === f.id} onClick={() => setFilterType(f.id)} />
            ))}
          </div>
          <AdminTable
            caption="Cupons"
            columns={columns}
            rows={coupons}
            rowKey={(c) => c._id}
            rowLabel={(c) => c.code}
            error={loadError}
            onRetry={fetchCoupons}
            empty="Nenhum cupom ainda. Crie o primeiro ao lado."
            rowAction={(c) => (
              <Button
                variant="secondary"
                size="sm"
                className={styles.rowBtn}
                aria-label={`${c.isActive ? 'Pausar' : 'Ativar'} ${c.code}`}
                onClick={() => handleToggle(c)}
              >
                {c.isActive ? 'Pausar' : 'Ativar'}
              </Button>
            )}
          />
        </div>

        <form className={blocks.block} onSubmit={handleCreate} aria-labelledby={formId} noValidate>
          <h2 id={formId} className={blocks.blockTitle}>Novo cupom global</h2>
          <Input label="Código" value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="EX: DROPDESCONTO20" />
          <Select
            label="Tipo de desconto"
            value={discountType}
            onChange={(v) => setDiscountType(v === 'fixed' ? 'fixed' : 'percent')}
            options={[{ value: 'percent', label: 'Percentual (%)' }, { value: 'fixed', label: 'Valor fixo (R$)' }]}
          />
          <div className={styles.fields2}>
            <Input label="Valor do desconto" type="number" value={discountValue} onChange={setDiscountValue} min={1} step="0.01" />
            <Input label="Pedido mínimo (R$)" type="number" value={minOrderValue} onChange={setMinOrderValue} placeholder="Sem mínimo" min={0} step="0.01" />
          </div>
          <div className={styles.fields2}>
            <Input label="Limite de usos" type="number" value={maxUses} onChange={setMaxUses} placeholder="Ilimitado" min={1} />
            <Input label="Vale de" type="date" value={validFrom} onChange={setValidFrom} />
          </div>
          <Input label="Vale até" type="date" value={validUntil} onChange={setValidUntil} />
          <Alert tone="info" title={cost.title}>{cost.detail} Cupom global sai do caixa do DROP quando é usado.</Alert>
          {formError && <Alert tone="error">{formError}</Alert>}
          <div className={styles.submit}><Button type="submit" loading={saving}>Criar cupom</Button></div>
        </form>
      </div>
    </div>
  );
}
