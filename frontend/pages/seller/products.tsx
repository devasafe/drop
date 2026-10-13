// frontend/pages/seller/products.tsx
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ImageOff, PackagePlus, Plus } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { Switch } from '../../components/ui/Switch';
import { Chip } from '../../components/ui/Chip';
import { SearchField } from '../../components/ui/SearchField';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { useMyStore } from '../../hooks/useMyStore';
import api from '../../lib/api';
import { storeAnalytics } from '../../lib/analyticsApi';
import { imageUrl } from '../../lib/config';
import { formatMoney } from '../../lib/money';
import { SELLER_ROUTES } from '../../lib/sellerRoutes';
import { hasPhoto, stockTone, LOW_STOCK_MAX } from '../../lib/sellerOrders';
import { apiError } from '../../lib/sellerApi';
import styles from './Produtos.module.css';

type Filter = 'todos' | 'esgotados' | 'pausados' | 'semFoto';

export default function SellerProducts() {
  const router = useRouter();
  // Rota autenticada do dono: loja pausada some da vitrine pública, mas o painel segue funcionando.
  const { products, loading, reload } = useMyStore({ fresh: true }); // V12: relê o catálogo ao entrar
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [sold, setSold] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');

  useEffect(() => {
    let off = false;
    storeAnalytics.topProducts('30d', 50)
      .then((r: any) => {
        if (off) return;
        const m: Record<string, number> = {};
        for (const p of r?.products ?? []) m[String(p._id)] = Number(p.quantity) || 0;
        setSold(m);
      })
      .catch(() => { /* vendidos são opcionais */ });
    return () => { off = true; };
  }, []);

  const isOn = (p: any) => active[p._id] ?? p.isActive !== false;
  const qty = (p: any) => Number(p.quantity) || 0;

  const toggle = async (p: any, next: boolean) => {
    setActive((s) => ({ ...s, [p._id]: next }));
    setBusy((s) => ({ ...s, [p._id]: true }));
    setError(null);
    try {
      await api.put(`/products/${p._id}/active`, { isActive: next });
      reload?.(); // V12: o painel guarda o catálogo; a próxima tela já abre com a mudança
    } catch (err) {
      setActive((s) => ({ ...s, [p._id]: !next }));
      setError(`Não deu para ${next ? 'ativar' : 'pausar'} ${p.name}. ${apiError(err).message || 'Tente de novo.'}`);
    } finally {
      setBusy((s) => ({ ...s, [p._id]: false }));
    }
  };

  const all: any[] = Array.isArray(products) ? products : [];
  const counts = {
    todos: all.length,
    // mesmo critério da tela Repor estoque: à venda e com até LOW_STOCK_MAX unidades
    baixo: all.filter((p) => isOn(p) && qty(p) <= LOW_STOCK_MAX).length,
    esgotados: all.filter((p) => qty(p) <= 0).length,
    pausados: all.filter((p) => !isOn(p)).length,
    semFoto: all.filter((p) => !hasPhoto(p)).length,
  };
  const term = q.trim().toLowerCase();
  const shown = all
    .filter((p) => (filter === 'esgotados' ? qty(p) <= 0 : filter === 'pausados' ? !isOn(p) : filter === 'semFoto' ? !hasPhoto(p) : true))
    .filter((p) => !term || String(p.name || '').toLowerCase().includes(term));

  const stockText = (p: any) => {
    const n = qty(p);
    const tone = stockTone(n);
    if (tone === 'out') return <span className={styles.stockOut}>Esgotado</span>;
    if (tone === 'low') return <span className={styles.stockLow}>{`só ${n} em estoque`}</span>;
    return <span>{`${n} em estoque`}</span>;
  };

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell
        title="Produtos"
        actions={<Button size="sm" leftIcon={<Plus size={16} aria-hidden="true" />} onClick={() => router.push('/seller/create-product')}>Novo</Button>}
      >
        <div className={styles.page}>
          {loading ? (
            <div role="status" aria-label="Carregando" className={styles.loading}>
              <Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} />
            </div>
          ) : all.length === 0 ? (
            <EmptyState
              icon={<PackagePlus size={28} />}
              title="Cadastre seu primeiro produto"
              description="Leva 1 minuto. Com foto e preço certos, ele já sai vendável."
              action={<Button onClick={() => router.push('/seller/create-product')}>Cadastrar produto</Button>}
            />
          ) : (
            <>
              <SearchField
                value={q}
                onChange={setQ}
                placeholder={`Buscar nos seus ${all.length} produtos`}
                inputProps={{ 'aria-label': 'Buscar produtos' }}
              />
              <div className={styles.chips}>
                <Chip label={`Todos ${counts.todos}`} active={filter === 'todos'} onClick={() => setFilter('todos')} />
                <Chip label={`Estoque baixo ${counts.baixo}`} onClick={() => router.push('/seller/estoque')} />
                <Chip label={`Esgotados ${counts.esgotados}`} active={filter === 'esgotados'} onClick={() => setFilter('esgotados')} />
                <Chip label={`Pausados ${counts.pausados}`} active={filter === 'pausados'} onClick={() => setFilter('pausados')} />
                <Chip label={`Sem foto ${counts.semFoto}`} active={filter === 'semFoto'} onClick={() => setFilter('semFoto')} />
              </div>
              {error && <p role="alert" className={styles.error}>{error}</p>}
              {shown.length === 0 ? (
                <EmptyState
                  icon={<PackagePlus size={28} />}
                  title={term ? `Nada com "${q.trim()}".` : 'Nenhum produto neste filtro.'}
                  action={term ? <Button variant="secondary" onClick={() => router.push('/seller/create-product')}>Cadastrar agora</Button> : undefined}
                />
              ) : (
                <table className={styles.table}>
                  <caption className={styles.srOnly}>Seus produtos</caption>
                  <thead>
                    <tr>
                      <th scope="col">Produto</th>
                      <th scope="col">Preço</th>
                      <th scope="col">Estoque</th>
                      <th scope="col">Vendidos (30 dias)</th>
                      <th scope="col">À venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => {
                      const photo = p.image || (Array.isArray(p.images) ? p.images[0] : null);
                      const n = sold[String(p._id)] || 0;
                      return (
                        <tr key={p._id}>
                          <td className={styles.cName}>
                            <span className={styles.thumb} aria-hidden="true">
                              {photo ? <img src={imageUrl(photo)} alt="" className={styles.thumbImg} /> : <ImageOff size={20} />}
                            </span>
                            <span className={styles.nameWrap}>
                              <Link href={SELLER_ROUTES.editarProduto(p._id)} className={styles.name}>{p.name}</Link>
                              {!isOn(p) && <span className={styles.paused}>Pausado</span>}
                            </span>
                          </td>
                          <td className={styles.cPrice}>{formatMoney(Number(p.price) || 0)}</td>
                          <td className={styles.cStock}>{stockText(p)}</td>
                          <td className={styles.cSold}>
                            {!hasPhoto(p) ? (
                              <button type="button" className={styles.linkBtn} onClick={() => router.push(SELLER_ROUTES.editarProduto(p._id))}>Pôr foto</button>
                            ) : n > 0 ? `${n} vendidos` : ''}
                          </td>
                          <td className={styles.cSwitch}>
                            <Switch label="À venda" checked={isOn(p)} disabled={!!busy[p._id]} onChange={(v) => toggle(p, v)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </SellerShell>
    </ProtectedRoute>
  );
}
