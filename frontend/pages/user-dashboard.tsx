import React, { useState, useEffect, useContext, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import api from '../lib/api';
import AuthContext from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { useOrders, useNotifications } from '../hooks/useSync';
import { useAutoRefetch } from '../hooks/useAutoRefetch';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { Package, FileText } from 'lucide-react';
import { orderStatusPill } from '../lib/orderStatus';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusPill } from '../components/ui/StatusPill';
import { EmptyState } from '../components/ui/EmptyState';
import { PriceTag, formatBRL } from '../components/ui/PriceTag';
import styles from './UserDashboard.module.css';

const MapPicker = dynamic(() => import('../components/MapPicker'), { ssr: false });

export default function UserDashboard() {
  const { user: authUser } = useContext(AuthContext);
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const { orders, loading: ordersLoading, refetch: refetchOrders } = useOrders();
  const { notifications, loading: notificationsLoading } = useNotifications();
  const [activeTab, setActiveTab] = useState('pending'); // pending, history, addresses
  const [_editingAddress, setEditingAddress] = useState<any | null>(null);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressForm, setAddressForm] = useState<any>({ label: '', street: '', number: '', neighborhood: '', city: '', state: '', zip: '', latitude: '', longitude: '' });
  const [addressError, setAddressError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 🔄 Auto-refetch quando socket events chegam (pedidos + endereços)
  const handleSocketUpdate = useCallback(async () => {
    console.log('📡 [UserDashboard] Socket event received - refetching...');
    refetchOrders();
    try {
      const addr = await api.get('/user/addresses');
      const addressesData = Array.isArray(addr.data) ? addr.data : [];
      setAddresses(addressesData);
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
        console.log('[Dashboard] addressesData after processing:', addressesData);
        console.log('[Dashboard] addressesData.length:', addressesData.length);
        setAddresses(addressesData);
        console.log('[Dashboard] ✅ Final addresses count:', addressesData.length);
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
        const addressesData = Array.isArray(addr.data) ? addr.data : [];
        setAddresses(addressesData);
        localStorage.removeItem('newAddressSaved');
      } catch {
        // silently ignore reload errors
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  if (loading || ordersLoading || notificationsLoading) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="dashboard" />
    </div>
  );

  // Helper function to get status badge info
  const pendingOrders = orders.filter(order => !['entregue', 'delivered', 'cancelado', 'rejeitado'].includes(order.status));
  const completedOrders = orders.filter(order => ['entregue', 'delivered', 'cancelado', 'rejeitado'].includes(order.status));

  return (
    <ProtectedRoute required_role="cliente">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Page header */}
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Meu Painel</h1>
            <p className={styles.pageSubtitle}>
              Gerencie sua conta, pedidos e endereços de entrega
            </p>
          </div>

          {/* Notificações */}
          {notifications.length > 0 && (
            <Card className={styles.notificationsBox}>
              <h3 className={styles.notificationsTitle}>
                {notifications.length} notificação{notifications.length > 1 ? 'ões' : ''}
              </h3>
              <div className={styles.notificationsList}>
                {notifications.map((n: any, idx: number) => (
                  <div key={n._id || idx} className={styles.notificationItem}>
                    <div>{n.message}</div>
                    {n.createdAt && (
                      <div className={styles.notificationDate}>
                        {new Date(n.createdAt).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Grid principal */}
          <div className={styles.mainGrid}>

            {/* Sidebar */}
            {user && (
              <div className={styles.sidebar}>
                {/* Avatar */}
                <div className={styles.avatarSection}>
                  {user.photo ? (
                    <img
                      src={user.photo}
                      alt="Foto de perfil"
                      className={styles.avatarImg}
                    />
                  ) : (
                    <div className={styles.avatarInitial}>
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className={styles.sidebarName}>{user.name}</div>
                  <div className={styles.sidebarEmail}>{user.email}</div>
                </div>

                {/* Info rows */}
                <div className={styles.sidebarInfo}>
                  {user.telefone && (
                    <div className={styles.sidebarInfoRow}>
                      <div className={styles.sidebarInfoLabel}>Telefone</div>
                      <div className={styles.sidebarInfoValue}>{user.telefone}</div>
                    </div>
                  )}
                  {user.cpf && (
                    <div className={styles.sidebarInfoRow}>
                      <div className={styles.sidebarInfoLabel}>CPF</div>
                      <div className={styles.sidebarInfoValue}>{user.cpf}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className={styles.sidebarActions}>
                  <button className={styles.btnEditProfile}>Editar Perfil</button>
                  <button className={styles.btnChangePassword}>Alterar Senha</button>
                </div>
              </div>
            )}

            {/* Main content */}
            <div className={styles.mainContent}>

              {/* Select de seção — visível apenas em tablet/mobile via CSS */}
              <select
                className={styles.tabsMobile}
                value={activeTab}
                onChange={e => setActiveTab(e.target.value)}
              >
                <option value="pending">Em Andamento ({pendingOrders.length})</option>
                <option value="addresses">Endereços ({addresses.length})</option>
                <option value="history">Histórico ({completedOrders.length})</option>
              </select>

              {/* Tabs */}
              <div className={styles.tabs}>
                {[
                  { id: 'pending',   label: 'Em Andamento', count: pendingOrders.length },
                  { id: 'addresses', label: 'Endereços',    count: addresses.length },
                  { id: 'history',   label: 'Histórico',    count: completedOrders.length },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                  >
                    {tab.label}
                    <span className={`${styles.tabCount} ${activeTab === tab.id ? styles.tabCountActive : ''}`}>
                      {tab.count}
                    </span>
                  </button>
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
                      const id = order._id || order.id || order.orderId || '';
                      return (
                        <Card key={id || idx} interactive onClick={() => router.push(`/store-order/${id}`)} className={styles.orderCard}>
                          <div className={styles.orderTop}>
                            <div className={styles.orderStoreBlock}>
                              <div className={styles.orderStore}>{order.storeName || order.storeObj?.name || 'Loja'}</div>
                              <div className={styles.orderId}>#{String(id).slice(-8)}</div>
                            </div>
                            <StatusPill status={orderStatusPill(order.status)} />
                          </div>
                          {Array.isArray(order.products) && order.products.length > 0 && (
                            <div className={styles.orderProducts}>
                              {order.products.map((p: any, i: number) => (
                                <div key={p.productId || i} className={styles.orderProductLine}>
                                  <span>{p.name || p.product?.name || p.productName || 'Produto'}</span>
                                  <span className={styles.orderProductQty}>×{p.quantity}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={styles.orderFoot}>
                            <span className={styles.orderFootLabel}>Total</span>
                            <PriceTag price={order.totalValue || 0} size="sm" />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )
              )}

              {/* === ENDEREÇOS === */}
              {activeTab === 'addresses' && (
                <div>
                  <div className={styles.addressHeader}>
                    <h2 className={styles.addressTitle}>Seus Endereços</h2>
                    <button
                      onClick={() => {
                        if (showAddAddress) {
                          setEditingAddress(null);
                          setAddressForm({ label: '', street: '', number: '', neighborhood: '', city: '', state: '', zip: '', latitude: '', longitude: '' });
                        }
                        setShowAddAddress(!showAddAddress);
                      }}
                      className={showAddAddress ? styles.btnAddAddressCancel : styles.btnAddAddress}
                    >
                      {showAddAddress ? '✕ Fechar' : '+ Novo Endereço'}
                    </button>
                  </div>

                  {addresses.length === 0 && !showAddAddress && (
                    <div className={styles.emptyState}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyIcon}>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      <p className={styles.emptyTitle}>Nenhum endereço cadastrado</p>
                    </div>
                  )}

                  {/* Formulário adicionar/editar */}
                  {showAddAddress && (
                    <div className={styles.addressForm}>
                      <h3 className={styles.addressFormTitle}>
                        {_editingAddress ? 'Editar Endereço' : 'Adicionar Novo Endereço'}
                      </h3>
                      <form onSubmit={async e => {
                        e.preventDefault();
                        setAddressError(null);
                        const requiredFields = ['street', 'number', 'city', 'zip', 'neighborhood', 'state', 'latitude', 'longitude'];
                        for (const field of requiredFields) {
                          if (!addressForm[field]) {
                            setAddressError('Preencha todos os campos obrigatórios e posicione no mapa.');
                            return;
                          }
                        }
                        try {
                          const payload = { ...addressForm, cep: addressForm.zip };
                          delete payload.zip;
                          let res;
                          if (_editingAddress && typeof _editingAddress.idx === 'number') {
                            res = await api.put(`/user/addresses/${_editingAddress.idx}`, payload);
                          } else {
                            res = await api.post('/user/addresses', payload);
                          }
                          setAddresses(Array.isArray(res.data) ? res.data : (res.data?.addresses || []));
                          if (res.data?.mainAddress && setUser) {
                            setUser((prev: any) => ({ ...prev, mainAddress: res.data.mainAddress }));
                          }
                          setAddressForm({ label: '', street: '', number: '', neighborhood: '', city: '', state: '', zip: '', latitude: '', longitude: '', setAsDefault: false });
                          setEditingAddress(null);
                          setShowAddAddress(false);
                        } catch (err) {
                          setAddressError(_editingAddress ? 'Erro ao editar endereço' : 'Erro ao adicionar endereço');
                        }
                      }}>
                        <div className={styles.formGrid2}>
                          <input
                            placeholder="Apelido (ex: Casa)"
                            value={addressForm.label}
                            onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
                            className={styles.formInput}
                          />
                          <input
                            required
                            placeholder="CEP"
                            value={addressForm.zip}
                            onChange={(e) => setAddressForm({ ...addressForm, zip: e.target.value })}
                            className={styles.formInput}
                          />
                        </div>

                        <div className={styles.formGrid21}>
                          <input
                            required
                            placeholder="Rua"
                            value={addressForm.street}
                            onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                            className={styles.formInput}
                          />
                          <input
                            required
                            placeholder="Número"
                            value={addressForm.number}
                            onChange={(e) => setAddressForm({ ...addressForm, number: e.target.value })}
                            className={styles.formInput}
                          />
                        </div>

                        <div className={styles.formGrid3}>
                          <input
                            placeholder="Bairro"
                            value={addressForm.neighborhood}
                            onChange={(e) => setAddressForm({ ...addressForm, neighborhood: e.target.value })}
                            className={styles.formInput}
                          />
                          <input
                            required
                            placeholder="Cidade"
                            value={addressForm.city}
                            onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                            className={styles.formInput}
                          />
                          <input
                            placeholder="UF"
                            value={addressForm.state}
                            onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value.toUpperCase() })}
                            maxLength={2}
                            className={styles.formInput}
                          />
                        </div>

                        {/* Checkbox padrão */}
                        <div className={styles.checkboxRow}>
                          <input
                            type="checkbox"
                            id="setAsDefault"
                            checked={addressForm.setAsDefault || false}
                            onChange={(e) => setAddressForm({ ...addressForm, setAsDefault: e.target.checked })}
                            className={styles.checkbox}
                          />
                          <label htmlFor="setAsDefault" className={styles.checkboxLabel}>
                            Usar como endereço padrão
                          </label>
                        </div>

                        {/* MapPicker — sincroniza pin <-> campos via geocoding */}
                        <div className={styles.mapWrapper}>
                          <MapPicker
                            lat={addressForm.latitude || ''}
                            lng={addressForm.longitude || ''}
                            addressForm={addressForm}
                            onChange={(lat: string, lng: string, address?: any) => {
                              // Quando o pin é arrastado, address vem preenchido (geocoding reverso).
                              // Quando o usuário digita nos campos, address é undefined — só atualiza coords.
                              setAddressForm((prev: any) => ({
                                ...prev,
                                latitude: lat,
                                longitude: lng,
                                ...(address ? {
                                  street: address.street || prev.street,
                                  number: address.number || prev.number,
                                  neighborhood: address.neighborhood || prev.neighborhood,
                                  city: address.city || prev.city,
                                  state: address.state || prev.state,
                                  zip: address.zip || address.cep || prev.zip,
                                } : {}),
                              }));
                            }}
                          />
                        </div>

                        {addressError && (
                          <div className={styles.formError}>{addressError}</div>
                        )}

                        <div className={styles.formButtons}>
                          <button type="submit" className={styles.btnSaveAddress}>Salvar Endereço</button>
                          <button type="button" onClick={() => { setEditingAddress(null); setShowAddAddress(false); }} className={styles.btnCancelForm}>Cancelar</button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Lista de endereços */}
                  <div className={styles.addressList}>
                    {addresses.map((addr, idx) => {
                      const isDefault = user?.mainAddress && (user.mainAddress._id === addr._id || user.mainAddress === addr._id || user.mainAddress === idx);
                      return (
                        <div key={addr._id || idx} className={`${styles.addressCard} ${isDefault ? styles.addressCardDefault : ''}`}>
                          <div className={styles.addressCardTop}>
                            <div>
                              <div className={styles.addressLabel}>
                                {addr.label || <span className={styles.addressNoLabel}>Sem apelido</span>}
                              </div>
                              <div className={styles.addressText}>
                                {addr.street}, {addr.number} — {addr.neighborhood}<br />
                                {addr.city} - {addr.state}, {addr.cep || addr.zip}
                              </div>
                            </div>
                            {isDefault && (
                              <div className={styles.defaultBadge}>Padrão</div>
                            )}
                          </div>
                          <div className={styles.addressActions}>
                            <button
                              onClick={() => {
                                setEditingAddress({ ...addr, idx });
                                setAddressForm({
                                  label: addr.label || '',
                                  street: addr.street || '',
                                  number: addr.number || '',
                                  neighborhood: addr.neighborhood || '',
                                  city: addr.city || '',
                                  state: addr.state || '',
                                  zip: addr.cep || addr.zip || '',
                                  latitude: addr.latitude || '',
                                  longitude: addr.longitude || '',
                                });
                                setShowAddAddress(true);
                              }}
                              className={styles.btnAddrEdit}
                            >
                              Editar
                            </button>
                            <button
                              onClick={async () => {
                                if (!window.confirm('Remover este endereço?')) return;
                                try {
                                  await api.delete(`/user/addresses/${idx}`);
                                  setAddresses(addresses.filter((_, i) => i !== idx));
                                } catch (err) {
                                  alert('Erro ao remover endereço');
                                }
                              }}
                              className={styles.btnAddrDelete}
                            >
                              Remover
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await api.post('/user/addresses/set-default', { addressId: addr._id || idx });
                                  setUser((prev: any) => ({ ...prev, mainAddress: addr }));
                                } catch (err) {
                                  alert('Erro ao definir endereço padrão');
                                }
                              }}
                              className={styles.btnAddrDefault}
                            >
                              Padrão
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* === HISTÓRICO === */}
              {activeTab === 'history' && (
                completedOrders.length === 0 ? (
                  <EmptyState icon={<FileText />} title="Nenhum pedido no histórico" description="Seus pedidos concluídos aparecem aqui." />
                ) : (
                  <div className={styles.orderList}>
                    {completedOrders.map((order, idx) => {
                      const id = order._id || order.id || order.orderId || '';
                      return (
                        <Card key={id || idx} className={styles.orderCard}>
                          <div className={styles.orderTop}>
                            <div className={styles.orderStoreBlock}>
                              <div className={styles.orderStore}>{order.storeName || order.storeObj?.name || 'Loja'}</div>
                              <div className={styles.orderId}>#{String(id).slice(-8)}</div>
                              {order.createdAt && (
                                <div className={styles.orderDate}>
                                  {new Date(order.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </div>
                              )}
                            </div>
                            <div className={styles.orderRightCol}>
                              <StatusPill status={orderStatusPill(order.status)} />
                              <span className={styles.orderTotalStrong}>{formatBRL(order.totalValue || 0)}</span>
                            </div>
                          </div>

                          {Array.isArray(order.products) && order.products.length > 0 && (
                            <div className={styles.orderProducts}>
                              {order.products.map((p: any, i: number) => (
                                <div key={p.productId || i} className={styles.orderProductLine}>
                                  <span>{p.quantity}× {p.name || p.product?.name || p.productName || 'Produto'}</span>
                                  <span className={styles.orderProductPrice}>{formatBRL(p.price || 0)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className={styles.financialGrid}>
                            {[
                              { label: 'Subtotal', value: (order.totalValue || 0) - (order.deliveryFee || 0) },
                              { label: 'Frete', value: order.deliveryFee || 0 },
                              { label: 'Total pago', value: order.totalValue || 0 },
                            ].map((item) => (
                              <div key={item.label} className={styles.financialCell}>
                                <div className={styles.financialLabel}>{item.label}</div>
                                <div className={styles.financialValue}>{formatBRL(item.value)}</div>
                              </div>
                            ))}
                          </div>

                          <Button variant="ghost" size="sm" onClick={() => router.push(`/store-order/${id}`)}>Ver detalhes</Button>
                        </Card>
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
