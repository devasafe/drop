// frontend/pages/seller/create-product.tsx
import { useState } from 'react';
import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { ProductForm, EMPTY_MEDIA, EMPTY_VALUES, buildProductFormData, validateProduct, type ProductErrors, type ProductMedia, type ProductValues } from '../../components/seller/products/ProductForm';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { useMyStore } from '../../hooks/useMyStore';
import { useCategories } from '../../hooks/useSync';
import api from '../../lib/api';
import { apiError } from '../../lib/sellerApi';
import styles from './ProdutoPagina.module.css';

export default function CreateProduct() {
  const router = useRouter();
  // Rota autenticada do dono: loja pausada some da vitrine pública (GET /stores).
  const { store, reload } = useMyStore();
  const { categories } = useCategories(store?._id);
  const storeId = store?._id ? String(store._id) : '';
  const [values, setValues] = useState<ProductValues>(EMPTY_VALUES);
  const [media, setMedia] = useState<ProductMedia>(EMPTY_MEDIA);
  const [errors, setErrors] = useState<ProductErrors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const publish = async () => {
    const e = validateProduct(values);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (!storeId) { setSubmitError('Loja não encontrada. Recarregue a página.'); return; }
    setBusy(true);
    setSubmitError(null);
    try {
      await api.post('/products', buildProductFormData('create', values, media, storeId), { headers: { 'Content-Type': 'multipart/form-data' } });
      await reload?.(); // V12: Produtos lê o catálogo do painel; recarrega antes de abrir
      router.push('/seller/products');
    } catch (err) {
      setSubmitError(apiError(err).message || 'Confira a conexão e tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Novo produto" back="/seller/products">
        <div className={styles.page}>
          <ProductForm
            values={values}
            onChange={setValues}
            errors={errors}
            media={media}
            onMediaChange={setMedia}
            categories={categories || []}
            storeId={storeId}
          />
          {submitError && (
            <Alert tone="error" title="Não deu para publicar" action={{ label: 'Tentar de novo', onClick: publish }}>
              {submitError}
            </Alert>
          )}
          <div className={styles.bar}>
            <Button onClick={publish} loading={busy}>Publicar produto</Button>
            <small className={styles.barNote}>Aparece na loja na hora · dá para editar depois</small>
          </div>
        </div>
      </SellerShell>
    </ProtectedRoute>
  );
}
