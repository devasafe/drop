import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import Icon from '../components/Icon';
import { useStores } from '../hooks/useSync';
import styles from './CheckoutVitrine.module.css';

type CartItem = { productId: string; quantity: number; name?: string; price?: number; storeId?: string };

export default function CheckoutVitrinePage() {
  const { cart, clear } = useCart();
  const auth = useAuth();
  const router = useRouter();
  const { stores } = useStores();

  const storeId = cart.length > 0 ? cart[0].storeId : '';
  const currentStore = stores.find((s: any) => s._id === storeId);

  // Redirecionar se for Plano 2/3
  useEffect(() => {
    if (currentStore && currentStore.plan !== 1) {
      router.replace('/checkout');
    }
  }, [currentStore, router]);

  // Campos do endereço
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cep, setCep] = useState('');
  const [complement, setComplement] = useState('');

  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saldo da carteira
  const [walletBalance, setWalletBalance] = useState(0);
  const [loadingWallet, setLoadingWallet] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!auth?.user?.id) return;
    api.get('/wallets/my-wallet')
      .then(res => { if (!cancelled) setWalletBalance(res.data?.balance ?? 0); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingWallet(false); });
    return () => { cancelled = true; };
  }, [auth?.user?.id]);

  // Pré-preencher endereço principal
  useEffect(() => {
    let cancelled = false;
    if (!auth?.token) return;
    api.get('/user/me').then(res => {
      if (cancelled) return;
      const addr = res.data?.mainAddress;
      if (addr) {
        setStreet(addr.street || '');
        setNumber(addr.number || '');
        setNeighborhood(addr.neighborhood || '');
        setCity(addr.city || '');
        setState(addr.state || '');
        setCep(addr.cep || '');
        setComplement(addr.complement || '');
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [auth?.token]);

  const subtotal = cart.reduce((sum, c) => sum + (c.price || 0) * c.quantity, 0);
  const total = subtotal; // Sem taxa de entrega para Plano 1
  const isWalletInsufficient = walletBalance < total;

  const generateUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

  const placeOrder = async () => {
    setError(null);
    if (!storeId) { setError('Carrinho vazio'); return; }
    if (!street || !number || !neighborhood || !city || !state || !cep) {
      setError('Preencha todos os campos de endereço obrigatórios');
      return;
    }
    if (isWalletInsufficient) {
      setError(`Saldo insuficiente! Você precisa de R$ ${(total - walletBalance).toFixed(2)} a mais.`);
      return;
    }
    if (isPlacing) return;
    setIsPlacing(true);

    try {
      const address = [street, number, complement, neighborhood, city, state, cep].filter(Boolean).join(', ');
      const products = cart.map(c => ({ productId: c.productId, quantity: c.quantity, price: c.price }));
      const payload = {
        storeId,
        products,
        deliveryDistanceKm: 0,
        paymentMethod,
        address,
        latitude: 0,
        longitude: 0,
        idempotentKey: generateUUID(),
      };

      const res = await api.post('/orders', payload);
      localStorage.removeItem('cart');
      clear();
      router.push(`/store-order/${res.data._id}`);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Falha ao criar pedido. Tente novamente.';
      setError(msg);
    } finally {
      setIsPlacing(false);
    }
  };

  if (cart.length === 0) {
    return (
      <ProtectedRoute required_role="cliente">
        <div className={styles.emptyCart}>
          <p>Seu carrinho está vazio.</p>
          <button onClick={() => router.push('/')} className={styles.btnBack}>← Voltar às compras</button>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_role="cliente">
      <div className={styles.page}>
        <div className={styles.header}>
          <button onClick={() => router.back()} className={styles.btnBack}>←</button>
          <h1 className={styles.title}>Finalizar Pedido</h1>
          {currentStore && <span className={styles.storeName}>{currentStore.name}</span>}
        </div>

        <div className={styles.container}>
          {/* ── Produtos ── */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}><Icon name="shopping-cart" size={16} /> Itens do Pedido</h2>
            <div className={styles.productList}>
              {cart.map((item: CartItem) => (
                <div key={item.productId} className={styles.productRow}>
                  <span className={styles.productName}>{item.name || 'Produto'}</span>
                  <span className={styles.productQty}>× {item.quantity}</span>
                  <span className={styles.productPrice}>R$ {((item.price || 0) * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Endereço ── */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}><Icon name="map-pin" size={16} /> Endereço de Entrega</h2>
            <div className={styles.plan1Notice}>
              <Icon name="truck" size={14} /> Esta loja gerencia a própria entrega. Informe seu endereço para que a loja possa organizar a entrega. Combine os detalhes via chat após o pedido.
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>CEP *</label>
                <input className={styles.input} value={cep} onChange={e => setCep(e.target.value)} placeholder="00000-000" />
              </div>
              <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                <label className={styles.label}>Rua *</label>
                <input className={styles.input} value={street} onChange={e => setStreet(e.target.value)} placeholder="Nome da rua" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Número *</label>
                <input className={styles.input} value={number} onChange={e => setNumber(e.target.value)} placeholder="123" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Complemento</label>
                <input className={styles.input} value={complement} onChange={e => setComplement(e.target.value)} placeholder="Apto, bloco..." />
              </div>
              <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                <label className={styles.label}>Bairro *</label>
                <input className={styles.input} value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Bairro" />
              </div>
              <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                <label className={styles.label}>Cidade *</label>
                <input className={styles.input} value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Estado *</label>
                <input className={styles.input} value={state} onChange={e => setState(e.target.value)} placeholder="RJ" maxLength={2} />
              </div>
            </div>
          </div>

          {/* ── Pagamento ── */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}><Icon name="credit-card" size={16} /> Forma de Pagamento</h2>
            <div className={styles.paymentOptions}>
              {['pix', 'credit_card', 'money'].map(method => (
                <button
                  key={method}
                  className={`${styles.paymentBtn} ${paymentMethod === method ? styles.paymentBtnActive : ''}`}
                  onClick={() => setPaymentMethod(method)}
                >
                  {method === 'pix' ? <><Icon name="zap" size={14} /> PIX</> : method === 'credit_card' ? <><Icon name="credit-card" size={14} /> Cartão</> : <><Icon name="money" size={14} /> Dinheiro</>}
                </button>
              ))}
            </div>
          </div>

          {/* ── Resumo ── */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}><Icon name="clipboard" size={16} /> Resumo</h2>
            <div className={styles.summaryRow}>
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Taxa de entrega</span>
              <span className={styles.freeLabel}>— (gerenciado pela loja)</span>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.summaryTotal}>
              <span>Total</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>

            {!loadingWallet && (
              <div className={styles.walletRow}>
                <span><Icon name="wallet" size={14} /> Seu saldo</span>
                <span style={{ color: isWalletInsufficient ? '#ef4444' : '#34d399' }}>
                  R$ {walletBalance.toFixed(2)}
                  {isWalletInsufficient && ` (faltam R$ ${(total - walletBalance).toFixed(2)})`}
                </span>
              </div>
            )}

            {error && <div className={styles.errorMsg}>{error}</div>}

            <button
              className={styles.btnSubmit}
              onClick={placeOrder}
              disabled={isPlacing || isWalletInsufficient || loadingWallet}
            >
              {isPlacing ? 'Enviando pedido...' : 'Confirmar Pedido'}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
