import { useEffect, useMemo } from 'react';
import api from '../../lib/api';
import { useRouter } from 'next/router';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import { imageUrl } from '../../lib/config';
import { useAuth } from '../../contexts/AuthContext';
import { useProducts } from '../../hooks/useSync';
import { useStores } from '../../hooks/useSync';
import styles from './SellerProducts.module.css';

export default function SellerProducts() {
  useRequireAuth(['lojista']);
  const { user } = useAuth();
  const { products: allProducts, loading: productsLoading } = useProducts();
  const { stores, loading: storesLoading } = useStores();
  const router = useRouter();

  const myStore = useMemo(() => {
    if (!user || !stores) return null;
    return stores.find((s: any) => s.ownerId === user.id || s.ownerId === user._id);
  }, [user, stores]);

  const products = useMemo(() => {
    if (!myStore || !allProducts) return [];
    return allProducts.filter((p: any) => p.storeId === myStore._id);
  }, [myStore, allProducts]);

  const loading = productsLoading || storesLoading;

  const handleEdit = (id: string) => {
    router.push(`/seller/edit-product?edit=${id}`);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este produto?')) return;
    try {
      await api.delete(`/products/${id}`);
      router.replace(router.asPath);
    } catch (e) {
      alert('Erro ao remover produto');
    }
  };

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>
                Meus Produtos
              </h1>
              <p className={styles.pageSubtitle}>
                {loading ? 'Carregando...' : `${products.length} produto${products.length !== 1 ? 's' : ''} na sua loja`}
              </p>
            </div>
            <button
              onClick={() => router.push('/seller/create-product')}
              className={styles.btnPrimary}
            >
              + Novo Produto
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="drop-skeleton-card" style={{ animationDelay: `${i * 0.06}s`, animation: 'drop-card-enter 0.5s cubic-bezier(0.4,0,0,1) both' }}>
                  <div className="drop-skeleton-img" />
                  <div style={{ padding: '4px 0' }}>
                    <div className="drop-skeleton-line" />
                    <div className="drop-skeleton-line" />
                    <div className="drop-skeleton-line" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className={styles.emptyState}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.emptyIcon}
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
              <p className={styles.emptyTitle}>Nenhum produto cadastrado</p>
              <p className={styles.emptySubtitle}>Crie seu primeiro produto para começar a vender</p>
              <button
                onClick={() => router.push('/seller/create-product')}
                className={styles.btnEmptyAction}
              >
                Criar Primeiro Produto
              </button>
            </div>
          ) : (
            <div className={styles.productsList}>
              {products.map((product: any, idx: number) => (
                <div
                  key={product._id}
                  className={styles.productCard}
                  style={{ animationDelay: `${idx * 0.04}s` }}
                >
                  {/* Image */}
                  <div className={styles.productThumb}>
                    {product.image ? (
                      <img
                        src={imageUrl(product.image)}
                        alt={product.name}
                        className={styles.productThumbImg}
                      />
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className={styles.productInfo}>
                    <div className={styles.productName}>{product.name}</div>
                    <div className={styles.productMeta}>
                      <span>R$ <strong className={styles.productPrice}>{typeof product.price === 'number' ? product.price.toFixed(2) : product.price}</strong></span>
                      <span>Estoque: <strong className={product.quantity > 0 ? styles.stockPositive : styles.stockEmpty}>{product.quantity}</strong></span>
                      {product.category && <span>Cat: {product.category}</span>}
                    </div>
                    {product.tags && product.tags.length > 0 && (
                      <div className={styles.tagList}>
                        {product.tags.map((tag: string) => (
                          <span key={tag} className={styles.tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className={styles.productActions}>
                    <button
                      onClick={() => handleEdit(product._id)}
                      className={styles.btnEdit}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(product._id)}
                      className={styles.btnDelete}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
