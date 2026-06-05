import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';

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

const today = () => new Date().toISOString().slice(0, 10);
const nextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
};

export default function AdminCoupons() {
  useRequireAuth(['ceo']);
  const router = useRouter();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'global' | 'store'>('all');

  const [code, setCode] = useState('');
  const [type, setType] = useState<'global' | 'store'>('global');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [minOrderValue, setMinOrderValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validFrom, setValidFrom] = useState(today());
  const [validUntil, setValidUntil] = useState(nextMonth());
  const [saving, setSaving] = useState(false);

  const fetchCoupons = async () => {
    try {
      const params: any = {};
      if (filterType !== 'all') params.type = filterType;
      const res = await api.get('/coupons', { params });
      setCoupons(res.data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCoupons(); }, [filterType]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/coupons', {
        code, type, discountType, discountValue: Number(discountValue),
        minOrderValue: minOrderValue ? Number(minOrderValue) : undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
        validFrom, validUntil,
      });
      setShowForm(false);
      setCode(''); setDiscountValue(10); setMinOrderValue(''); setMaxUses('');
      setValidFrom(today()); setValidUntil(nextMonth());
      await fetchCoupons();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao criar cupom');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.put(`/coupons/${id}/toggle`);
      await fetchCoupons();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar este cupom?')) return;
    try {
      await api.delete(`/coupons/${id}`);
      await fetchCoupons();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro');
    }
  };

  return (
    <ProtectedRoute required_role="ceo">
      <div style={{ minHeight: '100vh', background: 'var(--drop-bg)', padding: '32px 20px' }}>
        <div className="drop-fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <button onClick={() => router.push('/admin/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--drop-text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>
                ← Dashboard
              </button>
              <h1 style={{ fontFamily: 'var(--drop-font-display)', fontSize: 24, fontWeight: 700, color: 'var(--drop-text)', margin: 0 }}>
                Gerenciar Cupons
              </h1>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              style={{ padding: '10px 20px', background: 'var(--drop-purple)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              {showForm ? 'Cancelar' : '+ Novo Cupom'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border-md)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontFamily: 'var(--drop-font-display)', fontSize: 16, fontWeight: 600, color: 'var(--drop-text)', marginBottom: 16 }}>Criar Cupom</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Código</label>
                  <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required placeholder="EX: DROPDESCONTO20" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Tipo de cupom</label>
                  <select value={type} onChange={e => setType(e.target.value as any)} style={inputStyle}>
                    <option value="global">Global (todo o app)</option>
                    <option value="store">Loja específica</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tipo de desconto</label>
                  <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} style={inputStyle}>
                    <option value="percent">Percentual (%)</option>
                    <option value="fixed">Fixo (R$)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Valor do desconto</label>
                  <input type="number" min="1" max={discountType === 'percent' ? 100 : undefined} step="0.01" value={discountValue} onChange={e => setDiscountValue(Number(e.target.value))} required style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Pedido mínimo (R$) — opcional</label>
                  <input type="number" min="0" step="0.01" value={minOrderValue} onChange={e => setMinOrderValue(e.target.value)} placeholder="Sem mínimo" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Limite de usos — opcional</label>
                  <input type="number" min="1" value={maxUses} onChange={e => setMaxUses(e.target.value)} placeholder="Ilimitado" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Válido de</label>
                  <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} required style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Válido até</label>
                  <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} required style={inputStyle} />
                </div>
              </div>

              {type === 'global' && (
                <p style={{ fontSize: 12, color: 'var(--drop-warning)', marginBottom: 12 }}>
                  <Icon name="alert-triangle" size={14} /> Cupons globais são descontados do caixa do app quando utilizados.
                </p>
              )}

              <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'var(--drop-purple)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Salvando...' : 'Criar Cupom'}
              </button>
            </form>
          )}

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['all', 'global', 'store'] as const).map(f => (
              <button key={f} onClick={() => setFilterType(f)} style={{ padding: '6px 16px', borderRadius: 8, border: `1px solid ${filterType === f ? 'var(--drop-purple)' : 'var(--drop-border-md)'}`, background: filterType === f ? 'var(--drop-purple-bg)' : 'transparent', color: filterType === f ? 'var(--drop-purple-2)' : 'var(--drop-text-muted)', fontSize: 13, fontWeight: filterType === f ? 600 : 400, cursor: 'pointer' }}>
                {f === 'all' ? 'Todos' : f === 'global' ? 'Globais' : 'Por loja'}
              </button>
            ))}
          </div>

          {loading ? (
            <LoadingSkeleton variant="list" count={4} />
          ) : coupons.length === 0 ? (
            <div style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--drop-text-muted)' }}>
              Nenhum cupom encontrado.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {coupons.map(c => (
                <div key={c._id} style={{ background: 'var(--drop-surface)', border: `1px solid ${c.isActive ? 'var(--drop-border-md)' : 'var(--drop-border)'}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, opacity: c.isActive ? 1 : 0.55 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: 'var(--drop-purple-2)', letterSpacing: 1 }}>{c.code}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: c.type === 'global' ? 'rgba(108,43,217,0.2)' : 'rgba(56,189,248,0.15)', color: c.type === 'global' ? 'var(--drop-purple-2)' : 'var(--drop-info)', fontWeight: 600 }}>
                        {c.type === 'global' ? 'Global' : 'Loja'}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: c.isActive ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)', color: c.isActive ? '#22C55E' : 'var(--drop-text-dim)', fontWeight: 600 }}>
                        {c.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--drop-text-muted)' }}>
                      {c.discountType === 'percent' ? `${c.discountValue}% de desconto` : `R$ ${c.discountValue.toFixed(2)} de desconto`}
                      {c.minOrderValue ? ` • mín. R$ ${c.minOrderValue.toFixed(2)}` : ''}
                      {' • '}
                      {c.usedCount}/{c.maxUses ?? '∞'} usos
                      {' • '}
                      {new Date(c.validFrom).toLocaleDateString('pt-BR')} – {new Date(c.validUntil).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <button onClick={() => handleToggle(c._id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--drop-border-md)', background: 'transparent', color: 'var(--drop-text-muted)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {c.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => handleDelete(c._id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 12, cursor: 'pointer' }}>
                    Excluir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--drop-bg-2)', border: '1px solid var(--drop-border-md)',
  borderRadius: 8, color: 'var(--drop-text)', padding: '9px 12px', fontSize: 14, fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13, color: 'var(--drop-text-muted)', display: 'block', marginBottom: 4,
};
