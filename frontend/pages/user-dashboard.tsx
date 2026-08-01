import React, { useState, useEffect, useContext, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import api from '../lib/api';
import AuthContext from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { useOrders } from '../hooks/useSync';
import { useAutoRefetch } from '../hooks/useAutoRefetch';
import { imageUrl } from '../lib/config';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { Package, FileText, MapPin } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Chip } from '../components/ui/Chip';
import { Tag } from '../components/ui/Tag';
import { OrderCard, OrderCardData } from '../components/drop/OrderCard';
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
  };
}

const MapPicker = dynamic(() => import('../components/MapPicker'), { ssr: false });

export default function UserDashboard() {
  const { user: authUser } = useContext(AuthContext);
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const { orders, loading: ordersLoading, refetch: refetchOrders } = useOrders();
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

  if (loading || ordersLoading) return (
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
                    { value: 'addresses', label: `Endereços (${addresses.length})` },
                    { value: 'history', label: `Histórico (${completedOrders.length})` },
                  ]}
                />
              </div>

              {/* Tabs (Chip do DS) */}
              <div className={styles.tabs}>
                {[
                  { id: 'pending',   label: `Em Andamento (${pendingOrders.length})` },
                  { id: 'addresses', label: `Endereços (${addresses.length})` },
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

              {/* === ENDEREÇOS === */}
              {activeTab === 'addresses' && (
                <div>
                  <div className={styles.addressHeader}>
                    <h2 className={styles.addressTitle}>Seus endereços</h2>
                    <Button
                      variant={showAddAddress ? 'ghost' : 'primary'}
                      size="sm"
                      onClick={() => {
                        if (showAddAddress) {
                          setEditingAddress(null);
                          setAddressForm({ label: '', street: '', number: '', neighborhood: '', city: '', state: '', zip: '', latitude: '', longitude: '' });
                        }
                        setShowAddAddress(!showAddAddress);
                      }}
                    >
                      {showAddAddress ? 'Fechar' : 'Novo endereço'}
                    </Button>
                  </div>

                  {addresses.length === 0 && !showAddAddress && (
                    <EmptyState icon={<MapPin />} title="Nenhum endereço cadastrado" description="Adicione um endereço para receber seus pedidos." />
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
                          <Input placeholder="Apelido (ex: Casa)" value={addressForm.label} onChange={(v) => setAddressForm({ ...addressForm, label: v })} />
                          <Input placeholder="CEP" value={addressForm.zip} onChange={(v) => setAddressForm({ ...addressForm, zip: v })} />
                        </div>

                        <div className={styles.formGrid21}>
                          <Input placeholder="Rua" value={addressForm.street} onChange={(v) => setAddressForm({ ...addressForm, street: v })} />
                          <Input placeholder="Número" value={addressForm.number} onChange={(v) => setAddressForm({ ...addressForm, number: v })} />
                        </div>

                        <div className={styles.formGrid3}>
                          <Input placeholder="Bairro" value={addressForm.neighborhood} onChange={(v) => setAddressForm({ ...addressForm, neighborhood: v })} />
                          <Input placeholder="Cidade" value={addressForm.city} onChange={(v) => setAddressForm({ ...addressForm, city: v })} />
                          <Input placeholder="UF" value={addressForm.state} onChange={(v) => setAddressForm({ ...addressForm, state: v.toUpperCase() })} />
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
                          <Button type="submit" variant="primary">Salvar endereço</Button>
                          <Button type="button" variant="ghost" onClick={() => { setEditingAddress(null); setShowAddAddress(false); }}>Cancelar</Button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Lista de endereços */}
                  <div className={styles.addressList}>
                    {addresses.map((addr, idx) => {
                      const isDefault = user?.mainAddress && (user.mainAddress._id === addr._id || user.mainAddress === addr._id || user.mainAddress === idx);
                      return (
                        <Card key={addr._id || idx} className={`${styles.addressCard} ${isDefault ? styles.addressCardDefault : ''}`}>
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
                            {isDefault && <Tag>Padrão</Tag>}
                          </div>
                          <div className={styles.addressActions}>
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingAddress({ ...addr, idx });
                              setAddressForm({
                                label: addr.label || '', street: addr.street || '', number: addr.number || '',
                                neighborhood: addr.neighborhood || '', city: addr.city || '', state: addr.state || '',
                                zip: addr.cep || addr.zip || '', latitude: addr.latitude || '', longitude: addr.longitude || '',
                              });
                              setShowAddAddress(true);
                            }}>Editar</Button>
                            <Button variant="ghost" size="sm" onClick={async () => {
                              if (!window.confirm('Remover este endereço?')) return;
                              try {
                                await api.delete(`/user/addresses/${idx}`);
                                setAddresses(addresses.filter((_, i) => i !== idx));
                              } catch { alert('Erro ao remover endereço'); }
                            }}>Remover</Button>
                            {!isDefault && (
                              <Button variant="ghost" size="sm" onClick={async () => {
                                try {
                                  await api.post('/user/addresses/set-default', { addressId: addr._id || idx });
                                  setUser((prev: any) => ({ ...prev, mainAddress: addr }));
                                } catch { alert('Erro ao definir endereço padrão'); }
                              }}>Tornar padrão</Button>
                            )}
                          </div>
                        </Card>
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
