import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import api from '../../lib/api';

interface PrizeEntry { position: number; amount: number; type: 'wallet' | 'manual' }
interface PrizesData { month: number; year: number; prizes: PrizeEntry[]; distributed: boolean; distributedAt?: string }
interface HistoryItem { month: number; year: number; prizes: PrizeEntry[]; distributedAt: string; distributedBy?: { name: string } }

const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const MEDAL: Record<number, string> = { 1: '#1', 2: '#2', 3: '#3' };

const DEFAULT_PRIZES: PrizeEntry[] = [
  { position: 1, amount: 500, type: 'wallet' },
  { position: 2, amount: 300, type: 'wallet' },
  { position: 3, amount: 150, type: 'wallet' },
];

export default function AdminRankingConfig() {
  const router = useRouter();

  const [current, setCurrent] = useState<PrizesData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prizes, setPrizes] = useState<PrizeEntry[]>(DEFAULT_PRIZES);
  const [saving, setSaving] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [curr, hist] = await Promise.all([
        api.get('/ranking-prizes'),
        api.get('/ranking-prizes/history'),
      ]);
      setCurrent(curr.data);
      setPrizes(curr.data.prizes?.length ? curr.data.prizes : DEFAULT_PRIZES);
      setHistory(hist.data);
    } catch { /* silencioso */ }
  };

  useEffect(() => { fetchData(); }, []);

  const updatePrize = (idx: number, field: 'amount' | 'type', value: string | number) => {
    setPrizes(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    setError('');
    try {
      await api.put('/ranking-prizes', { prizes });
      setMsg('Prêmios salvos com sucesso!');
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDistribute = async () => {
    if (!confirm('Distribuir prêmios do mês atual? Esta ação não pode ser desfeita.')) return;
    setDistributing(true);
    setMsg('');
    setError('');
    try {
      const res = await api.post('/ranking-prizes/distribute', {});
      const credited = res.data.results?.filter((r: any) => r.credited).length || 0;
      setMsg(`Prêmios distribuídos! ${credited} carteira(s) creditada(s).`);
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao distribuir');
    } finally {
      setDistributing(false);
    }
  };

  return (
    <ProtectedRoute required_permission="ranking:manage">
      <div style={{ minHeight: '100vh', background: 'var(--drop-bg)', padding: '32px 20px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>

          <div style={{ marginBottom: 28 }}>
            <button onClick={() => router.push('/admin/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--drop-text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>
              ← Dashboard
            </button>
            <h1 style={{ fontFamily: 'var(--drop-font-display)', fontSize: 26, fontWeight: 700, color: 'var(--drop-text)', margin: '0 0 4px' }}>
              Prêmios do Ranking
            </h1>
            <p style={{ fontSize: 14, color: 'var(--drop-text-muted)', margin: 0 }}>
              Configure os prêmios mensais para os motoboys — {current ? `${MONTH_NAMES[current.month]} ${current.year}` : ''}
            </p>
          </div>

          {/* Status atual */}
          {current?.distributed && (
            <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#4ade80', fontWeight: 600 }}>
              Prêmios de {MONTH_NAMES[current.month]} já foram distribuídos em {current.distributedAt ? new Date(current.distributedAt).toLocaleDateString('pt-BR') : ''}
            </div>
          )}

          {msg && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#4ade80', fontWeight: 600 }}>{msg}</div>}
          {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#f87171', fontWeight: 600 }}>{error}</div>}

          {/* Configuração de prêmios */}
          <div style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border-md)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--drop-font-display)', fontSize: 16, fontWeight: 600, color: 'var(--drop-text)', margin: '0 0 20px' }}>
              Prêmios para Top 3
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {prizes.map((prize, idx) => (
                <div key={prize.position} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: 22, textAlign: 'center' }}>{MEDAL[prize.position] || `#${prize.position}`}</div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--drop-text-muted)', display: 'block', marginBottom: 4 }}>Valor (R$)</label>
                    <input
                      type="number"
                      min={0}
                      value={prize.amount}
                      onChange={e => updatePrize(idx, 'amount', Number(e.target.value))}
                      style={{ width: '100%', background: 'var(--drop-bg-2)', border: '1px solid var(--drop-border-md)', borderRadius: 8, color: 'var(--drop-text)', padding: '9px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none', fontWeight: 700 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--drop-text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
                    <select
                      value={prize.type}
                      onChange={e => updatePrize(idx, 'type', e.target.value)}
                      style={{ width: '100%', background: 'var(--drop-bg-2)', border: '1px solid var(--drop-border-md)', borderRadius: 8, color: 'var(--drop-text)', padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                    >
                      <option value="wallet">Crédito na carteira</option>
                      <option value="manual">Manual (externo)</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1, padding: '12px', background: 'var(--drop-purple)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Salvando...' : 'Salvar Configuração'}
              </button>
              <button
                onClick={handleDistribute}
                disabled={distributing || current?.distributed}
                title={current?.distributed ? 'Já distribuído' : 'Distribuir prêmios do mês atual'}
                style={{ padding: '12px 20px', background: current?.distributed ? 'var(--drop-bg-2)' : 'rgba(74,222,128,0.15)', border: `1px solid ${current?.distributed ? 'var(--drop-border)' : 'rgba(74,222,128,0.4)'}`, borderRadius: 10, color: current?.distributed ? 'var(--drop-text-dim)' : '#4ade80', fontWeight: 700, fontSize: 14, cursor: current?.distributed ? 'not-allowed' : 'pointer', opacity: distributing ? 0.6 : 1, whiteSpace: 'nowrap' }}
              >
                {distributing ? '...' : current?.distributed ? 'Distribuído' : 'Distribuir Prêmios'}
              </button>
            </div>
          </div>

          {/* Histórico */}
          {history.length > 0 && (
            <div style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border-md)', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontFamily: 'var(--drop-font-display)', fontSize: 16, fontWeight: 600, color: 'var(--drop-text)', margin: '0 0 16px' }}>
                Histórico de Distribuições
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((h, i) => (
                  <div key={i} style={{ background: 'var(--drop-bg-2)', border: '1px solid var(--drop-border)', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--drop-text)' }}>{MONTH_NAMES[h.month]} {h.year}</span>
                      <span style={{ fontSize: 12, color: 'var(--drop-text-dim)' }}>
                        {h.distributedAt ? new Date(h.distributedAt).toLocaleDateString('pt-BR') : ''}{h.distributedBy ? ` por ${h.distributedBy.name}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {h.prizes.map(p => (
                        <span key={p.position} style={{ fontSize: 12, color: 'var(--drop-text-muted)' }}>
                          {MEDAL[p.position] || `#${p.position}`} R$ {p.amount.toFixed(0)} ({p.type === 'wallet' ? 'carteira' : 'manual'})
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
