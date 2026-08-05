import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import ProtectedRoute from '../../components/ProtectedRoute';
import { List, Row } from '../../components/ui/List';

interface Coupon {
  _id: string;
  code: string;
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

export default function SellerCoupons() {
  useRequireAuth(['lojista']);
  const router = useRouter();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [minOrderValue, setMinOrderValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validFrom, setValidFrom] = useState(today());
  const [validUntil, setValidUntil] = useState(nextMonth());
  const [saving, setSaving] = useState(false);

  const fetchCoupons = async () => {
    try {
      const res = await api.get('/coupons');
      setCoupons(res.data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCoupons(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/coupons', {
        code, type: 'store', discountType, discountValue: Number(discountValue),
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

  const labelStyle: React.CSSProperties = { fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  return (
    <ProtectedRoute required_role="lojista">
      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 20px', fontFamily: 'var(--font-body)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <button onClick={() => router.push('/seller/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>
                ← Painel
              </button>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
                Cupons da Loja
              </h1>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              style={{ padding: '10px 20px', background: 'var(--brand)', border: 'none', borderRadius: 10, color: 'var(--on-brand)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              {showForm ? 'Cancelar' : '+ Novo Cupom'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 16 }}>Criar Cupom</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Código</label>
                  <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required placeholder="EX: PROMO10" style={inputStyle} />
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
                <div />
                <div>
                  <label style={labelStyle}>Válido de</label>
                  <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} required style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Válido até</label>
                  <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} required style={inputStyle} />
                </div>
              </div>

              <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: 'var(--brand)', border: 'none', borderRadius: 10, color: 'var(--on-brand)', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Salvando...' : 'Criar Cupom'}
              </button>
            </form>
          )}

          {loading ? (
            <LoadingSkeleton variant="list" count={4} />
          ) : coupons.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Nenhum cupom criado ainda.
            </div>
          ) : (
            <List>
              {coupons.map(c => (
                <Row key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: c.isActive ? 1 : 0.55 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: 'var(--brand-2)', letterSpacing: 1 }}>{c.code}</span>
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: c.isActive ? 'color-mix(in srgb, var(--success) 15%, transparent)' : 'var(--surface-chip)', color: c.isActive ? 'var(--success)' : 'var(--text-subtle)', fontWeight: 600 }}>
                        {c.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {c.discountType === 'percent' ? `${c.discountValue}% de desconto` : `R$ ${c.discountValue.toFixed(2)} de desconto`}
                      {c.minOrderValue ? ` • mín. R$ ${c.minOrderValue.toFixed(2)}` : ''}
                      {' • '}
                      {c.usedCount}/{c.maxUses ?? '∞'} usos
                      {' • '}
                      até {new Date(c.validUntil).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <button onClick={() => handleToggle(c._id)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                    {c.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => handleDelete(c._id)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)', color: 'var(--danger)', fontSize: 13, cursor: 'pointer' }}>
                    Excluir
                  </button>
                </Row>
              ))}
            </List>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--surface-field)', border: '1px solid var(--line)',
  borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: 14, fontFamily: 'inherit',
};
