// frontend/pages/seller/edit-product.tsx
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PackageX, Trash2 } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { ProductForm, EMPTY_MEDIA, EMPTY_VALUES, buildProductFormData, validateProduct, type ProductErrors, type ProductMedia, type ProductValues } from '../../components/seller/products/ProductForm';
import { Switch } from '../../components/ui/Switch';
import { Sheet } from '../../components/ui/Sheet';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useMyStore } from '../../hooks/useMyStore';
import { useCategories } from '../../hooks/useSync';
import api from '../../lib/api';
import { storeAnalytics } from '../../lib/analyticsApi';
import { imageUrl } from '../../lib/config';
import { daysLeft } from '../../lib/sellerOrders';
import { apiError } from '../../lib/sellerApi';
import styles from './ProdutoPagina.module.css';

const toInput = (n: any) => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', ','));

export default function EditProduct() {
  const router = useRouter();
  const editId = typeof router.query.edit === 'string' ? router.query.edit : undefined;
  // Catálogo do dono (rota autenticada): produto pausado continua editável mesmo fora da vitrine.
  // V12: leitura nova ao abrir — o PUT regrava o estoque, então o formulário não pode vir do cache do painel.
  const { store, products, loading, reload } = useMyStore({ fresh: true });
  const product = useMemo(() => (products || []).find((p: any) => String(p._id) === editId) || null, [products, editId]);
  const { categories } = useCategories(store?._id);
  const [values, setValues] = useState<ProductValues>(EMPTY_VALUES);
  const [media, setMedia] = useState<ProductMedia>(EMPTY_MEDIA);
  const [errors, setErrors] = useState<ProductErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [active, setActive] = useState(true);
  const [activeBusy, setActiveBusy] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [sold30, setSold30] = useState<number | null>(null);
  const [rating, setRating] = useState<{ average: number; count: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    setValues({
      name: product.name || '',
      description: product.description || '',
      price: toInput(product.price),
      oldPrice: toInput(product.oldPrice),
      quantity: String(product.quantity ?? 0),
      category: product.categoryId ? String(product.categoryId) : '',
      subCategory: product.subCategory || '',
    });
    const imgs: string[] = Array.isArray(product.images) && product.images.length ? product.images : product.image ? [product.image] : [];
    setMedia({ ...EMPTY_MEDIA, kept: imgs.map((i) => imageUrl(i)), existingVideo: product.video || null });
    setActive(product.isActive !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?._id]);

  useEffect(() => {
    if (!editId) return;
    let off = false;
    storeAnalytics.topProducts('30d', 50)
      .then((r: any) => {
        if (off) return;
        const row = (r?.products ?? []).find((p: any) => String(p._id) === editId);
        setSold30(row ? Number(row.quantity) || 0 : 0);
      })
      .catch(() => { /* opcional */ });
    api.get(`/products/${editId}/reviews`)
      .then((r) => { if (!off && r?.data) setRating({ average: Number(r.data.average) || 0, count: Number(r.data.count) || 0 }); })
      .catch(() => { /* opcional */ });
    return () => { off = true; };
  }, [editId]);

  const toggleActive = async (next: boolean) => {
    if (!editId) return;
    setActive(next);
    setActiveBusy(true);
    setActiveError(null);
    try {
      await api.put(`/products/${editId}/active`, { isActive: next });
      reload?.(); // V12: o painel guarda o catálogo; a próxima tela já abre com a mudança
    } catch (err) {
      setActive(!next);
      setActiveError(apiError(err).message || 'Não deu para mudar agora. Tente de novo.');
    } finally {
      setActiveBusy(false);
    }
  };

  const save = async () => {
    if (!editId) return;
    const e = validateProduct(values);
    setErrors(e);
    setSaved(false);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.put(`/products/${editId}`, buildProductFormData('edit', values, media), { headers: { 'Content-Type': 'multipart/form-data' } });
      setSaved(true);
      reload?.(); // V12: idem
    } catch (err) {
      setSaveError(apiError(err).message || 'Confira a conexão e tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/products/${editId}`);
      await reload?.(); // V12: Produtos lê o catálogo do painel; recarrega antes de abrir
      router.push('/seller/products');
    } catch (err) {
      setDeleteError(apiError(err).message || 'Não deu para excluir agora.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute required_role="lojista">
        <SellerShell title="Produto" back="/seller/products">
          <div className={styles.page} role="status" aria-label="Carregando"><Skeleton height={96} /><Skeleton height={240} /></div>
        </SellerShell>
      </ProtectedRoute>
    );
  }
  if (!product) {
    return (
      <ProtectedRoute required_role="lojista">
        <SellerShell title="Produto" back="/seller/products">
          <div className={styles.page}>
            <EmptyState
              icon={<PackageX size={28} />}
              title="Produto não encontrado"
              description="Ele pode ter sido excluído ou ser de outra loja."
              action={<Link href="/seller/products">Voltar para Produtos</Link>}
            />
          </div>
        </SellerShell>
      </ProtectedRoute>
    );
  }

  const left = sold30 === null ? null : daysLeft(Number(values.quantity) || 0, sold30);
  const stockHint = Number(values.quantity) <= 0
    ? 'Esgotado'
    : left === null ? undefined : `acaba em ~${left} ${left === 1 ? 'dia' : 'dias'} no ritmo atual`;

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell
        title={product.name}
        back="/seller/products"
        actions={<Button variant="tertiary" size="sm" leftIcon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setConfirmDelete(true)}>Excluir produto</Button>}
      >
        <div className={styles.page}>
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <small>Vendidos</small>
              <b>{sold30 === null ? '—' : String(sold30)}</b>
              <em>30 dias</em>
            </div>
            <div className={styles.kpi}>
              <small>Avaliação</small>
              <b>{rating && rating.count > 0 ? `★ ${rating.average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '—'}</b>
              <em>{rating && rating.count > 0 ? `${rating.count} ${rating.count === 1 ? 'nota' : 'notas'}` : 'sem notas ainda'}</em>
            </div>
          </div>
          {sold30 === 0 && <p className={styles.meta}>Ainda sem vendas: compartilhe o link do produto.</p>}

          <section className={styles.block} aria-label="À venda">
            <Switch label="À venda" description="Desligue para esconder sem apagar" checked={active} disabled={activeBusy} onChange={toggleActive} />
            {activeError && <p role="alert" className={styles.error}>{activeError}</p>}
          </section>

          <ProductForm
            values={values}
            onChange={(v) => { setValues(v); setSaved(false); }}
            errors={errors}
            media={media}
            onMediaChange={setMedia}
            categories={categories || []}
            storeId={store?._id ? String(store._id) : ''}
            stockHint={stockHint}
          />

          <section className={styles.block} aria-label="Variações">
            <div className={styles.blockHead}>
              <h2 className={styles.blockTitle}>Variações</h2>
              <span className={styles.soon}>em breve</span>
            </div>
            <p className={styles.meta}>Cor e tamanho com estoque próprio para cada opção.</p>
          </section>

          {saveError && (
            <Alert tone="error" title="Não deu para salvar" action={{ label: 'Tentar de novo', onClick: save }}>{saveError}</Alert>
          )}
          {saved && <p role="status" className={styles.notice}>Alterações salvas. O preço novo vale para os próximos pedidos.</p>}

          <div className={styles.bar}>
            <Button onClick={save} loading={saving}>Salvar alterações</Button>
            <small className={styles.barNote}>Preço novo vale para pedidos a partir de agora</small>
          </div>
        </div>

        <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} presentation="bottom" title={`Excluir ${product.name}?`}>
          <div className={styles.sheetBody}>
            <p className={styles.meta}>O produto sai da loja e não dá para desfazer. Se quiser só esconder, desligue "À venda".</p>
            {deleteError && <p role="alert" className={styles.error}>{deleteError}</p>}
            <div className={styles.sheetActions}>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>Voltar</Button>
              <Button variant="danger" onClick={remove} loading={deleting}>Excluir de vez</Button>
            </div>
          </div>
        </Sheet>
      </SellerShell>
    </ProtectedRoute>
  );
}
