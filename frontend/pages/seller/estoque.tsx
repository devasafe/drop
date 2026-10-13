// frontend/pages/seller/estoque.tsx
import { useEffect, useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useMyStore } from '../../hooks/useMyStore';
import api from '../../lib/api';
import { storeAnalytics } from '../../lib/analyticsApi';
import { LOW_STOCK_MAX, daysLeft, isLowStock } from '../../lib/sellerOrders';
import { apiError, unwrap } from '../../lib/sellerApi';
import styles from './Estoque.module.css';

const validStock = (s: string) => /^\d+$/.test(s.trim());

export default function EstoquePage() {
  const { store, products, loading } = useMyStore();
  const [sold, setSold] = useState<Record<string, number>>({});
  const [base, setBase] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const b: Record<string, number> = {};
    for (const p of products || []) b[String(p._id)] = Number(p.quantity) || 0;
    setBase(b);
    setDraft({});
  }, [products]);

  useEffect(() => {
    let off = false;
    storeAnalytics.topProducts('30d', 50)
      .then((r: any) => {
        if (off) return;
        const m: Record<string, number> = {};
        for (const p of r?.products ?? []) m[String(p._id)] = Number(p.quantity) || 0;
        setSold(m);
      })
      .catch(() => { /* ritmo é opcional */ });
    return () => { off = true; };
  }, []);

  // A lista é fixada na entrada: repor não tira a linha da tela enquanto o lojista ajusta.
  const rows = useMemo(() => {
    const list = (products || []).filter((p: any) => p?.isActive !== false && isLowStock(p));
    const left = (p: any) => {
      const d = daysLeft(Number(p.quantity) || 0, sold[String(p._id)] || 0);
      return d === null ? Number.POSITIVE_INFINITY : d;
    };
    return [...list].sort((a, b) => left(a) - left(b) || (Number(a.quantity) || 0) - (Number(b.quantity) || 0));
  }, [products, sold]);

  const changed = rows.filter((p: any) => {
    const v = draft[String(p._id)];
    return v !== undefined && validStock(v) && Number(v) !== base[String(p._id)];
  });

  const statusText = (p: any) => {
    const id = String(p._id);
    const q = base[id] ?? (Number(p.quantity) || 0);
    const s30 = sold[id] || 0;
    if (q <= 0) {
      const perDay = s30 / 30;
      return perDay > 0 ? `Esgotado · ${perDay.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${perDay < 1.5 ? 'venda' : 'vendas'}/dia` : 'Esgotado';
    }
    const d = daysLeft(q, s30);
    if (d === null) return `${q} un. · sem vendas em 30 dias`;
    return `${q} un. · ${d <= 1 ? 'acaba amanhã' : `acaba em ~${d} dias`}`;
  };

  const save = async () => {
    if (!store?._id || changed.length === 0) return;
    setSaving(true);
    setResult(null);
    const items = changed.map((p: any) => ({ productId: String(p._id), stock: Number(draft[String(p._id)]) }));
    try {
      const r = await api.patch('/products/stock', { storeId: String(store._id), items });
      const updated = Number(unwrap<any>(r)?.updated ?? items.length);
      setBase((b) => {
        const next = { ...b };
        for (const it of items) next[it.productId] = it.stock;
        return next;
      });
      setDraft({});
      setResult({ tone: 'success', text: `Estoque salvo: ${updated} ${updated === 1 ? 'produto' : 'produtos'}.` });
    } catch (err) {
      // O lote não é transacional: pode ter salvado só parte. Relê o servidor em vez de presumir.
      try {
        const fresh = await api.get('/stores/dashboard');
        const list = fresh?.data?.products;
        if (Array.isArray(list)) {
          setBase((b) => {
            const next = { ...b };
            for (const p of list) if (String(p._id) in next) next[String(p._id)] = Number(p.quantity) || 0;
            return next;
          });
        }
      } catch { /* mantém o que está na tela */ }
      setResult({ tone: 'error', text: apiError(err).message || 'Confira a conexão e tente de novo.' });
    } finally {
      setSaving(false);
    }
  };

  const others = (products || []).filter((p: any) => p?.isActive !== false && (Number(p.quantity) || 0) > LOW_STOCK_MAX);
  const nextOut = others
    .map((p: any) => ({ p, d: daysLeft(Number(p.quantity) || 0, sold[String(p._id)] || 0) }))
    .filter((x) => x.d !== null)
    .sort((a, b) => (a.d as number) - (b.d as number))[0];

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Repor estoque" back="/seller/products">
        <div className={styles.page}>
          {loading ? (
            <div role="status" aria-label="Carregando" className={styles.loading}><Skeleton height={56} /><Skeleton height={56} /></div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<PackageCheck size={28} />}
              title="Estoque em dia"
              description={nextOut ? `O próximo a acabar é ${nextOut.p.name}, em ~${nextOut.d} dias.` : `Nenhum produto à venda com ${LOW_STOCK_MAX} unidades ou menos.`}
            />
          ) : (
            <>
              <p className={styles.sub}>Ordenado pelo que acaba primeiro, no ritmo de vendas dos últimos 30 dias.</p>
              <table className={styles.table}>
                <caption className={styles.srOnly}>Produtos acabando</caption>
                <thead>
                  <tr><th scope="col">Produto</th><th scope="col">Situação</th><th scope="col">Novo estoque</th></tr>
                </thead>
                <tbody>
                  {rows.map((p: any) => {
                    const id = String(p._id);
                    const value = draft[id] ?? String(base[id] ?? (Number(p.quantity) || 0));
                    const invalid = draft[id] !== undefined && !validStock(draft[id]);
                    const q = base[id] ?? (Number(p.quantity) || 0);
                    return (
                      <tr key={id}>
                        <td className={styles.cName}>{p.name}</td>
                        <td className={[styles.cStatus, q <= 0 ? styles.out : styles.low].join(' ')}>{statusText(p)}</td>
                        <td className={styles.cInput}>
                          <input
                            className={[styles.input, invalid ? styles.inputError : ''].filter(Boolean).join(' ')}
                            inputMode="numeric"
                            aria-label={`Novo estoque de ${p.name}`}
                            aria-invalid={invalid || undefined}
                            value={value}
                            onChange={(e) => { setResult(null); setDraft((d) => ({ ...d, [id]: e.target.value.replace(/[^\d-]/g, '') })); }}
                          />
                          {invalid && <span className={styles.inputHint}>Use 0 ou mais</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {result?.tone === 'success' && <p role="status" className={styles.notice}>{result.text}</p>}
              {result?.tone === 'error' && (
                <Alert tone="error" title="Não deu para salvar" action={{ label: 'Tentar de novo', onClick: save }}>{result.text}</Alert>
              )}
              <div className={styles.bar}>
                <Button onClick={save} loading={saving} disabled={changed.length === 0}>
                  {`Salvar ${changed.length} ${changed.length === 1 ? 'alteração' : 'alterações'}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </SellerShell>
    </ProtectedRoute>
  );
}
