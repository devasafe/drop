import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import AuthContext from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { useOrders } from '../hooks/useSync';
import { useAutoRefetch } from '../hooks/useAutoRefetch';
import { imageUrl } from '../lib/config';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { Package, FileText } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Select } from '../components/ui/Select';
import { Chip } from '../components/ui/Chip';
import { OrderCard, OrderCardData } from '../components/drop/OrderCard';
import AddressManager from '../components/AddressManager';
import styles from './UserDashboard.module.css';

/** Resumo de itens do pedido: "3 itens · Pizza, Refri…". */
function itemsSummary(products: any[]): string {
  if (!Array.isArray(products) || products.length === 0) return '';
  const totalQty = products.reduce((s, p) => s + (Number(p.quantity) || 1), 0);
  const names = products
    .slice(0, 2)
    .map((p: any) => p.name || p.product?.name || p.productName || 'Produto');
  const unit = totalQty === 1 ? 'item' : 'itens';
  const more = products.length > 2 ? '…' : '';
  return `${totalQty} ${unit} · ${names.join(', ')}${more}`;
}

/** Normaliza um pedido para o OrderCard. `withDate` inclui a data (histórico). */
function toOrderCard(order: any, withDate: boolean): OrderCardData {
  const id = order._id || order.id || order.orderId || '';
  return {
    id: String(id),
    code: String(id).slice(-8).toUpperCase(),
    storeName: order.storeName || order.storeObj?.name || 'Loja',
    status: order.status,
    total: order.totalValue || 0,
    itemsLabel: itemsSummary(order.products),
    imageUrl: imageUrl(order.products?.[0]?.image) || undefined,
    date:
      withDate && order.createdAt
        ? new Date(order.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
        : undefined,
    paymentMethod: order.paymentMethod,
    installmentCount: order.installmentCount,
  };
}

export default function UserDashboard() {
  const { user: authUser } = useContext(AuthContext);
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [addressCount, setAddressCount] = useState(0);
  const { orders, loading: ordersLoading, refetch: refetchOrders } = useOrders();
  const [activeTab, setActiveTab] = useState('pending'); // pending, history, addresses
  // Deep-link: /user-dashboard?tab=addresses (ex.: atalho "Endereços" do perfil).
  useEffect(() => {
    const t = router.query.tab;
    if (typeof t === 'string' && ['pending', 'history', 'addresses'].includes(t)) setActiveTab(t);
  }, [router.query.tab]);
  const [loading, setLoading] = useState(true);

  // 🔄 Auto-refetch quando socket events chegam (pedidos + endereços)
  const handleSocketUpdate = useCallback(async () => {
    console.log('📡 [UserDashboard] Socket event received - refetching...');
    refetchOrders();
    try {
      const addr = await api.get('/user/addresses');
      setAddressCount(Array.isArray(addr.data) ? addr.data.length : 0);
    } catch (e) {
      console.error('[Dashboard] Erro ao recarregar endereços:', e);
    }
  }, [refetchOrders]);

  useAutoRefetch(
    [
      'order:created', 'order:updated', 'order:status_changed',
      'order:cancelled', 'order:accepted_by_store', 'order:rejected_by_store',
      'delivery:assigned', 'delivery:picked', 'delivery:completed', 'delivery:cancelled',
    ],
    handleSocketUpdate
  );

  useEffect(() => {
    if (!authUser) return;
    async function fetchAll() {
      setLoading(true);
      try {
        console.log('[Dashboard] 🔄 Carregando dados do usuário e endereços...');
        const [me, addr] = await Promise.all([
          api.get('/user/me'),
          api.get('/user/addresses'),
        ]);
        console.log('[Dashboard] /me response:', me.data?.name, 'ID:', me.data?.id);
        console.log('[Dashboard] /addresses RAW response:', addr.data);
        console.log('[Dashboard] /addresses response type:', typeof addr.data, 'isArray:', Array.isArray(addr.data));
        setUser(me.data);
        // ✅ FIX: Endpoint agora retorna array direto
        const addressesData = Array.isArray(addr.data) ? addr.data : [];
        setAddressCount(addressesData.length);
      } catch (e) {
        console.error('[Dashboard] ❌ Error loading data:', e);
      }
      setLoading(false);
    }
    fetchAll();
  }, [authUser]);

  // Escutar mudanças em localStorage para recarregar endereços quando novo é salvo no checkout
  useEffect(() => {
    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key !== 'newAddressSaved' || !e.newValue) return;
      try {
        const addr = await api.get('/user/addresses');
        setAddressCount(Array.isArray(addr.data) ? addr.data.length : 0);
        localStorage.removeItem('newAddressSaved');
      } catch {
        // silently ignore reload errors
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Envolve o loading no ProtectedRoute também: deslogado, o ProtectedRoute
  // redireciona pro /login em vez de ficar preso no skeleton pra sempre (o
  // fetch de dados falha/pende e `loading` nunca zeraria).
  if (loading || ordersLoading) return (
    <ProtectedRoute required_role="cliente">
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="dashboard" />
      </div>
    </ProtectedRoute>
  );

  // Helper function to get status badge info
  const pendingOrders = orders.filter(order => !['entregue', 'delivered', 'cancelado', 'rejeitado'].includes(order.status));
  const completedOrders = orders.filter(order => ['entregue', 'delivered', 'cancelado', 'rejeitado'].includes(order.status));

  return (
    <ProtectedRoute required_role="cliente">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Cabeçalho da tela de Pedidos */}
          <header className={styles.header}>
            <h1 className={styles.title}>Pedidos</h1>
          </header>

          <div className={styles.content}>
            {/* Conteúdo */}
            <div className={styles.mainContent}>

              {/* Select de seção — visível apenas em tablet/mobile via CSS */}
              <div className={styles.tabsMobile}>
                <Select
                  value={activeTab}
                  onChange={setActiveTab}
                  options={[
                    { value: 'pending', label: `Em Andamento (${pendingOrders.length})` },
                    { value: 'addresses', label: `Endereços (${addressCount})` },
                    { value: 'history', label: `Histórico (${completedOrders.length})` },
                  ]}
                />
              </div>

              {/* Tabs (Chip do DS) */}
              <div className={styles.tabs}>
                {[
                  { id: 'pending',   label: `Em Andamento (${pendingOrders.length})` },
                  { id: 'addresses', label: `Endereços (${addressCount})` },
                  { id: 'history',   label: `Histórico (${completedOrders.length})` },
                ].map(tab => (
                  <Chip key={tab.id} label={tab.label} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
                ))}
              </div>

              {/* === PEDIDOS EM ANDAMENTO === */}
              {activeTab === 'pending' && (
                pendingOrders.length === 0 ? (
                  <EmptyState
                    icon={<Package />}
                    title="Nenhum pedido em andamento"
                    description="Quando você fizer um pedido, ele aparecerá aqui."
                    action={<Button variant="primary" onClick={() => router.push('/inicio')}>Explorar lojas</Button>}
                  />
                ) : (
                  <div className={styles.orderList}>
                    {pendingOrders.map((order, idx) => {
                      const card = toOrderCard(order, false);
                      return (
                        <OrderCard
                          key={card.id || idx}
                          order={card}
                          onClick={() => router.push(`/store-order/${card.id}`)}
                        />
                      );
                    })}
                  </div>
                )
              )}

              {/* === ENDEREÇOS === (gerenciador reutilizável) */}
              {activeTab === 'addresses' && (
                <AddressManager onCountChange={setAddressCount} />
              )}

              {/* === HISTÓRICO === */}
              {activeTab === 'history' && (
                completedOrders.length === 0 ? (
                  <EmptyState icon={<FileText />} title="Nenhum pedido no histórico" description="Seus pedidos concluídos aparecem aqui." />
                ) : (
                  <div className={styles.orderList}>
                    {completedOrders.map((order, idx) => {
                      const card = toOrderCard(order, true);
                      return (
                        <OrderCard
                          key={card.id || idx}
                          order={card}
                          onClick={() => router.push(`/store-order/${card.id}`)}
                        />
                      );
                    })}
                  </div>
                )
              )}

            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
