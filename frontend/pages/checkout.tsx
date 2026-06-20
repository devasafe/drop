import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { AddressSelector } from '../components/AddressSelector';
import ProtectedRoute from '../components/ProtectedRoute';
import Icon from '../components/Icon';
import PixPaymentModal from '../components/PixPaymentModal';
import { useAddresses, useStores } from '../hooks/useSync';
import styles from './Checkout.module.css';

type UserAddress = {
  label?: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  latitude: string;
  longitude: string;
};

type CartItem = { productId: string; quantity: number; name?: string; price?: number; storeId?: string };

export default function CheckoutPage() {

  const { cart, clear } = useCart();
  const auth = useAuth();
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  const [blockedRole, setBlockedRole] = useState('');
  const { addresses, loading: loadingAddresses, setAddresses } = useAddresses();
  const { stores } = useStores();

  // SEGURANÇA: Verificar se está em modo cliente
  useEffect(() => {
    const activeRole = auth?.user?.activeRole || auth?.user?.role;
    // Apenas 'cliente' pode comprar
    // Bloquear motoboy, lojista e outros roles
    if (auth?.user && activeRole !== 'cliente') {
      console.warn(`[BLOCKED] Compra bloqueada: role = ${activeRole}`);
      setBlockedRole(activeRole || 'desconhecido');
      setBlocked(true);
      // Redirecionar após 2s
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } else {
      setBlocked(false);
      setBlockedRole('');
    }
  }, [auth?.user, router]);

  // NOVO: Busca dados atualizados do user (incluindo mainAddress) do backend
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        if (!auth?.user) {
          if (process.env.NODE_ENV === 'development') console.log('[Checkout] Usuário não logado ainda, aguardando...');
          return;
        }

        console.log('[Checkout] Buscando dados atualizados do user com mainAddress...');
        const res = await api.get('/user/me');
        if (process.env.NODE_ENV === 'development') console.log('[Checkout] User data recebido do backend:', res.data);

        if (res.data?.mainAddress) {
          console.log('[Checkout] [OK] mainAddress encontrado:', res.data.mainAddress);
          // Atualizar state local de mainAddress
          setMainAddress(res.data.mainAddress);
          // Também atualizar localStorage para persistência
          const updatedUser = {
            ...auth.user,
            mainAddress: res.data.mainAddress,
            addresses: res.data.addresses || []
          };
          localStorage.setItem('user', JSON.stringify(updatedUser));
        } else {
          console.warn('[Checkout] [WARN] mainAddress não encontrado na resposta');
        }
      } catch (err: any) {
        console.error('[Checkout] Erro ao buscar dados do user:', err);
      }
    };
//
    fetchUserData();
  }, [auth?.user]);

  // Pega o storeId do primeiro item do carrinho
  const storeId = cart.length > 0 ? cart[0].storeId : '';

  // Detectar plano da loja — Plano 1 usa checkout-vitrine separado
  const currentStore = stores.find((s: any) => s._id === storeId);
  const isStorePlan1 = currentStore?.plan === 1;

  // Redirecionar Plano 1 para o checkout dedicado sem motoboy
  useEffect(() => {
    if (currentStore && isStorePlan1) {
      router.replace('/checkout-vitrine');
    }
  }, [currentStore, isStorePlan1, router]);

  // Campos do formulário de endereço
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [distanceKm, setDistanceKm] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [cupomCode, setCupomCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [loadingFee, setLoadingFee] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [storeCoords, setStoreCoords] = useState<{lat: number, lng: number} | null>(null);

  const [selectedAddressIdx, setSelectedAddressIdx] = useState<number | null>(null);
  const [addressLabel, setAddressLabel] = useState('');
  const [mainAddress, setMainAddress] = useState<any>(null);

  // Rastrear endereço selecionado para sincronizar com AddressSelector
  const [selectedAddress, setSelectedAddress] = useState<any>(null);

  // ✅ NOVO: Modal de confirmação e bloqueio de cliques duplos
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [pixData, setPixData] = useState<any>(null); // cobrança PIX (gateway Asaas)
  const [showManualForm, setShowManualForm] = useState(false); // ✅ NOVO: Controlar visibilidade do formulário manual

  // ✅ NOVO: Carregar saldo da carteira
  const [walletBalance, setWalletBalance] = useState(0);
  const [pendingDebt, setPendingDebt] = useState<{ amount: number } | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  // ✅ NOVO: Configuração dinâmica da plataforma
  const [platformConfig, setPlatformConfig] = useState<{
    motoboyCutPerDelivery: number;
    motoboyCutPerKm: number;
  } | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        setLoadingWallet(true);
        setWalletError(null);

        if (!auth?.user?.id) {
          if (process.env.NODE_ENV === 'development') console.warn('User not authenticated yet');
          return;
        }

        if (process.env.NODE_ENV === 'development') console.log('Fetching wallet for user:', auth.user.id);
        const res = await api.get('/wallets/my-wallet');
        if (process.env.NODE_ENV === 'development') console.log('Wallet response:', res.data);

        const balance = res.data.balance || 0;
        setWalletBalance(balance);
        console.log('Wallet balance set to:', balance);

        try {
          const debtRes = await api.get('/debts/my-pending');
          if (debtRes.data.debt) {
            setPendingDebt(debtRes.data.debt);
          }
        } catch {
          // ignora erro de dívida — não bloqueia o checkout
        }
      } catch (err: any) {
        console.error('Erro ao buscar saldo:', err);
        setWalletError(err.response?.data?.error || 'Erro ao carregar saldo');
        setWalletBalance(0);
      } finally {
        setLoadingWallet(false);
      }
    };

    fetchWallet();
  }, [auth?.user, auth?.user?.id]);

  // ✅ Busca a configuração da plataforma para taxa de entrega dinâmica
  useEffect(() => {
    const fetchPlatformConfig = async () => {
      try {
        setLoadingConfig(true);
        const res = await api.get('/settings/platform-config');
        console.log('PlatformConfig carregado:', res.data);
        setPlatformConfig({
          motoboyCutPerDelivery: res.data.motoboyCutPerDelivery || 7,
          motoboyCutPerKm: res.data.motoboyCutPerKm || 1,
        });
      } catch (err: any) {
        console.error('Erro ao carregar PlatformConfig:', err);
        // Usar valores padrão se falhar
        setPlatformConfig({
          motoboyCutPerDelivery: 7,
          motoboyCutPerKm: 1,
        });
      } finally {
        setLoadingConfig(false);
      }
    };

    fetchPlatformConfig();
  }, []);

  // Selecionar endereço da lista
  const handleSelectAddress = (idx: number) => {
    setSelectedAddressIdx(idx);
    const addr = addresses[idx];
    setCep(addr.cep);
    setStreet(addr.street);
    setNumber(addr.number);
    setNeighborhood(addr.neighborhood);
    setCity(addr.city);
    setState(addr.state);
    setLatitude(addr.latitude);
    setLongitude(addr.longitude);
    setAddressLabel(addr.label || '');
  };

  // Salvar novo endereço
  const handleSaveAddress = async () => {
    if (!street || !number || !neighborhood || !city || !state || !cep || !latitude || !longitude) {
      alert('Preencha todos os campos para salvar o endereço');
      return;
    }
    try {
      const res = await api.post('/user/addresses', {
        label: addressLabel,
        street, number, neighborhood, city, state, cep, latitude, longitude
      });
      setAddresses(res.data || []);
      // ✅ NOVO: Notificar dashboard que há novo endereço
      localStorage.setItem('newAddressSaved', Date.now().toString());
      alert('Endereço salvo!');
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro ao salvar endereço');
    }
  };

  // Auto-carrega endereço padrão ao montar
  useEffect(() => {
    if (mainAddress && mainAddress.latitude && mainAddress.longitude) {
      setCep(mainAddress.cep);
      setStreet(mainAddress.street);
      setNumber(mainAddress.number);
      setNeighborhood(mainAddress.neighborhood);
      setCity(mainAddress.city);
      setState(mainAddress.state);
      setLatitude(mainAddress.latitude);
      setLongitude(mainAddress.longitude);
      setAddressLabel(mainAddress.label || '');
    }
  }, [mainAddress]);

  // ✅ NOVO: Restaura rascunho de checkout ao montar (se houver)
  useEffect(() => {
    if (cart.length === 0) {
      try {
        const draft = localStorage.getItem('checkout_draft');
        if (draft) {
          const parsed = JSON.parse(draft);
          setStreet(parsed.street || '');
          setNumber(parsed.number || '');
          setNeighborhood(parsed.neighborhood || '');
          setCity(parsed.city || '');
          setState(parsed.state || '');
          setCep(parsed.cep || '');
          setLatitude(parsed.latitude || '');
          setLongitude(parsed.longitude || '');
          setPaymentMethod(parsed.paymentMethod || 'pix');
          console.log('✅ Checkout recuperado de rascunho');
        }
      } catch (err) {
        console.error('Erro ao restaurar rascunho:', err);
      }
    }
  }, []); // Apenas ao montar

  // ✅ NOVO: Auto-salva rascunho de checkout em localStorage
  useEffect(() => {
    if (cart.length > 0) {
      const draft = {
        street,
        number,
        neighborhood,
        city,
        state,
        cep,
        latitude,
        longitude,
        paymentMethod,
      };
      try {
        localStorage.setItem('checkout_draft', JSON.stringify(draft));
      } catch (err) {
        console.error('Erro ao salvar rascunho:', err);
      }
    }
  }, [storeId, cart, street, number, neighborhood, city, state, cep, latitude, longitude, paymentMethod]);

  // Busca coordenadas da loja ao carregar
  const storeData = useMemo(() => {
    if (!storeId || !stores) return null;
    return stores.find((s: any) => s._id === storeId);
  }, [storeId, stores]);

  useEffect(() => {
    if (!storeData || !storeData.latitude || !storeData.longitude) return;
    setStoreCoords({ lat: parseFloat(storeData.latitude), lng: parseFloat(storeData.longitude) });
  }, [storeData]);

  // Inicializa mapa
  const initializeMap = () => {
    if (!(window as any).google || (window as any).google.maps === undefined) {
      return;
    }

    const gmapEl = document.getElementById('gmap-checkout');
    if (!gmapEl || mapRef.current) return;

    const lat = latitude ? parseFloat(latitude) : -23.55052;
    const lng = longitude ? parseFloat(longitude) : -46.633308;

    try {
      mapRef.current = new (window as any).google.maps.Map(gmapEl, {
        center: { lat, lng },
        zoom: 16,
      });
      markerRef.current = new (window as any).google.maps.Marker({
        position: { lat, lng },
        map: mapRef.current,
        draggable: true,
      });
      markerRef.current.addListener('dragend', async (e: any) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setLatitude(lat.toString());
        setLongitude(lng.toString());
        updateMap(lat, lng);
        // Reverse geocoding para atualizar campos de endereço
        if ((window as any).google && (window as any).google.maps) {
          const geocoder = new (window as any).google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
            if (status === 'OK' && results[0]) {
              const addressComponents = results[0].address_components;
              let street = '', number = '', neighborhood = '', city = '', state = '', cep = '';
              addressComponents.forEach((comp: any) => {
                if (comp.types.includes('route')) street = comp.long_name;
                if (comp.types.includes('street_number')) number = comp.long_name;
                if (comp.types.includes('sublocality') || comp.types.includes('political') && comp.types.includes('sublocality_level_1')) neighborhood = comp.long_name;
                if (comp.types.includes('administrative_area_level_2')) city = comp.long_name;
                if (comp.types.includes('administrative_area_level_1')) state = comp.short_name;
                if (comp.types.includes('postal_code')) cep = comp.long_name;
              });
              setStreet(street);
              setNumber(number);
              setNeighborhood(neighborhood);
              setCity(city);
              setState(state);
              setCep(cep);
            }
          });
        }
      });
      setMapsLoaded(true);
    } catch (err) {
      console.error('Erro ao inicializar mapa:', err);
    }
  };

  // Atualiza mapa e marcador
  const updateMap = (lat: number, lng: number) => {
    if (mapRef.current && markerRef.current) {
      mapRef.current.setCenter({ lat, lng });
      markerRef.current.setPosition({ lat, lng });
    }
  };

  // Inicializa mapa quando o Google Maps estiver carregado
  useEffect(() => {
    const checkAndInitialize = () => {
      if ((window as any).google && (window as any).google.maps) {
        initializeMap();
      } else {
        // Tenta novamente em 100ms
        setTimeout(checkAndInitialize, 100);
      }
    };

    checkAndInitialize();
  }, []);

  // Atualiza mapa quando latitude/longitude mudam
  useEffect(() => {
    if (!mapsLoaded || !latitude || !longitude) return;
    updateMap(parseFloat(latitude), parseFloat(longitude));
  }, [latitude, longitude, mapsLoaded]);

  // Busca endereço pelo CEP usando ViaCEP
  const fetchAddressByCep = async (cepValue: string) => {
    const cleanCep = cepValue.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      alert('CEP deve ter 8 dígitos.');
      return;
    }
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      if (!res.ok) {
        alert('Erro de conexão com ViaCEP. Status: ' + res.status);
        return;
      }
      const data = await res.json();
      if (data.erro) {
        alert('CEP não encontrado.');
        return;
      }
      setStreet(data.logradouro || '');
      setNeighborhood(data.bairro || '');
      setCity(data.localidade || '');
      setState(data.uf || '');
      // Buscar latitude/longitude pelo endereço completo se possível
      if ((window as any).google && (window as any).google.maps && (data.logradouro || street) && (number || '1') && (data.bairro || neighborhood) && (data.localidade || city) && (data.uf || state)) {
        const geocoder = new (window as any).google.maps.Geocoder();
        const address = `${data.logradouro || street}, ${number || '1'}, ${data.bairro || neighborhood}, ${data.localidade || city}, ${data.uf || state}, ${cepValue}`;
        geocoder.geocode({ address }, (results: any, status: any) => {
          if (status === 'OK' && results[0]) {
            const loc = results[0].geometry.location;
            setLatitude(loc.lat().toString());
            setLongitude(loc.lng().toString());
          } else {
            alert('Não foi possível localizar o endereço no mapa.');
          }
        });
      }
    } catch (e: any) {
      alert('Erro ao buscar endereço pelo CEP: ' + (e?.message || e));
    }
  };

  // Calcula distância real de rota entre loja e cliente usando Google Directions API
  useEffect(() => {
    if (!storeCoords || !latitude || !longitude || !(window as any).google) return;
    const directionsService = new (window as any).google.maps.DirectionsService();
    const origin = { lat: storeCoords.lat, lng: storeCoords.lng };
    const destination = { lat: parseFloat(latitude), lng: parseFloat(longitude) };
    console.log('Calculando rota:', { origin, destination });
    directionsService.route(
      {
        origin,
        destination,
        travelMode: 'DRIVING',
      },
      (result: any, status: string) => {
        if (status === 'OK' && result.routes && result.routes[0] && result.routes[0].legs && result.routes[0].legs[0]) {
          const meters = result.routes[0].legs[0].distance.value;
          const km = meters / 1000;
          setDistanceKm(Number(km.toFixed(2)));
        } else {
          console.warn('DirectionsService falhou:', status, result);
          setDistanceKm(0);
          alert('Não foi possível calcular a distância da rota. Verifique se o endereço está correto.');
        }
      }
    );
  }, [storeCoords, latitude, longitude, mapsLoaded]);

  // Calcula taxa de entrega sempre que a distância mudar (usando config dinâmica)
  useEffect(() => {
    if (!platformConfig) return; // Espera carregar config

    // [Plan1] Loja Plano 1 não tem entrega integrada — sem taxa
    if (isStorePlan1) {
      setDeliveryFee(0);
      setLoadingFee(false);
      return;
    }

    setLoadingFee(true);
    setTimeout(() => {
      const base = platformConfig.motoboyCutPerDelivery || 7;
      const perKm = platformConfig.motoboyCutPerKm || 1;
      const fee = base + Math.max(0, Number(distanceKm)) * perKm;
      setDeliveryFee(fee);
      console.log(`✅ Taxa calculada: R$ ${base} (base) + ${distanceKm}km × R$ ${perKm} = R$ ${fee.toFixed(2)}`);
      setLoadingFee(false);
    }, 300);
  }, [distanceKm, platformConfig, isStorePlan1]);

  const subtotal = cart.reduce((sum, c) => sum + (c.price || 0) * c.quantity, 0);
  const total = subtotal + deliveryFee - couponDiscount;

  const applyCoupon = async () => {
    if (!cupomCode.trim()) return;
    setValidatingCoupon(true);
    setCouponMsg(null);
    try {
      const res = await api.post('/coupons/validate', { code: cupomCode.trim(), storeId, orderValue: subtotal });
      setCouponDiscount(res.data.discount);
      setCouponMsg({ type: 'ok', text: `Cupom aplicado! Desconto de R$ ${res.data.discount.toFixed(2)}` });
    } catch (err: any) {
      setCouponDiscount(0);
      setCouponMsg({ type: 'error', text: err?.response?.data?.error || 'Cupom inválido' });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCupomCode('');
    setCouponDiscount(0);
    setCouponMsg(null);
  };

  const placeOrder = async () => {
    // ✅ Validar distância ANTES de tentar criar pedido (apenas Plano 2/3)
    if (!isStorePlan1 && (!distanceKm || distanceKm < 0.1)) {
      alert('Distância de entrega não foi calculada corretamente. Verifique o endereço.');
      return;
    }

    // ✅ NOVO: Bloquear cliques múltiplos
    if (isPlacing) return;
    setIsPlacing(true);

    // ✅ NOVO: Gerar UUID para idempotência
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    const idempotentKey = generateUUID();

    try {
      const address = `${street}, ${number} - ${neighborhood}, ${city} - ${state}, ${cep}`;
      // ✅ Agora envia price do carrinho para garantir consistência
      const products = cart.map((c) => ({
        productId: c.productId,
        quantity: c.quantity,
        price: c.price  // IMPORTANTE: Enviar preço do carrinho
      }));

      // ✅ Debug: Mostrar dados antes de enviar
      const payload: any = {
        storeId,
        products,
        deliveryDistanceKm: isStorePlan1 ? 0 : Number(distanceKm),
        paymentMethod,
        address,
        latitude: Number(latitude),
        longitude: Number(longitude),
        idempotentKey,
      };
      if (cupomCode.trim()) payload.cupomCode = cupomCode.trim().toUpperCase();
      if (process.env.NODE_ENV === 'development') console.log('Carregando pedido:', payload);

      // ✅ NOVO: Enviar idempotentKey
      // IMPORTANTE: Converter latitude/longitude para number
      const res = await api.post('/orders', payload);

      // Resposta pode ser o pedido (fluxo legado) ou { order, pix } (gateway Asaas).
      const order = res.data?.order || res.data;
      const pix = res.data?.pix;

      // ✅ NOVO: Apenas limpar após sucesso confirmado
      localStorage.removeItem('cart');
      localStorage.removeItem('checkout_draft');  // ← Limpar draft
      clear();

      // ✅ NOVO: Fechar modal
      setShowConfirmation(false);

      if (pix) {
        // Gateway Asaas: abrir tela de pagamento PIX (confirmação automática via webhook).
        setPixData({ ...pix, orderId: order._id });
      } else {
        // Fluxo legado: pedido já criado/pago pela carteira.
        alert('Pedido criado com sucesso!');
        window.location.href = `/store-order/${order._id}`;
      }
    } catch (err: any) {
      const data = err?.response?.data;
      console.error('Erro ao criar pedido:', err);
      console.error('Response data:', JSON.stringify(data));
      console.error('Detalhe Asaas:', data?.detail);
      console.error('Status:', err?.response?.status);
      const errorMsg = data?.detail ? `${data.error || 'Erro'} — ${data.detail}` : (data?.error || err?.message || 'Falha ao criar pedido. Tente novamente.');
      alert(errorMsg);
    } finally {
      setIsPlacing(false);
    }
  };

  // Derived values for wallet check
  // PIX é cobrança externa (gateway) — não depende de saldo na carteira.
  const isWalletInsufficient = paymentMethod !== 'cash_on_delivery' && paymentMethod !== 'pix' && walletBalance < total;

  return (
    <ProtectedRoute required_role="cliente">
      {/* Bloquear acesso se não estiver em modo cliente */}
      {blocked && (
        <div className={styles.blockedScreen}>
          <h2 className={styles.blockedTitle}><Icon name="x-circle" size={20} /> Compras Bloqueadas</h2>
          <p className={styles.blockedText}>
            Sua conta está no modo{' '}
            <strong>
              {blockedRole === 'motoboy' ? 'Motoboy' : blockedRole === 'lojista' ? 'Lojista' : blockedRole}
            </strong>.
          </p>
          <p className={styles.blockedText}>
            Apenas contas no modo <strong>Cliente</strong> podem fazer compras. Alterne na navbar se preferir comprar.
          </p>
        </div>
      )}

      {!blocked && (
        <div className={styles.page}>
          <div className={styles.container}>

            {/* Page header */}
            <div className={styles.pageHeader}>
              <h1 className={styles.pageTitle}>Checkout</h1>
              <p className={styles.pageSubtitle}>Revise seu pedido e finalize a compra</p>
            </div>

            {/* Main grid */}
            <div className={styles.mainGrid}>

              {/* ── LEFT COLUMN ── */}
              <div className={styles.leftColumn}>

                {/* Address section */}
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}><Icon name="map-pin" size={16} /> Endereço de Entrega</h2>
                  </div>
                  <div className={styles.sectionBody}>
                    <AddressSelector
                      mainAddress={mainAddress}
                      selectedAddress={selectedAddress}
                      addresses={addresses}
                      onRequestNewAddress={() => {
                        // Abre o formulário manual existente do checkout (forma única)
                        setShowManualForm(true);
                        // Scroll suave até o form
                        setTimeout(() => {
                          const el = document.querySelector(`.${styles.manualForm}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }}
                      onSelect={addr => {
                        // ✅ NOVO: Sincronizar selectedAddress para re-render do card
                        setSelectedAddress(addr);
                        setCep(addr.cep);
                        setStreet(addr.street);
                        setNumber(addr.number);
                        setNeighborhood(addr.neighborhood);
                        setCity(addr.city);
                        setState(addr.state);
                        setLatitude(addr.latitude);
                        setLongitude(addr.longitude);
                        setAddressLabel(addr.label || '');
                      }}
                    />

                    {/* Toggle manual form */}
                    <button
                      type="button"
                      onClick={() => setShowManualForm(!showManualForm)}
                      className={`${styles.btnToggle} ${showManualForm ? styles.btnToggleActive : ''}`}
                    >
                      {showManualForm ? 'Esconder' : 'Preencher manualmente'}
                    </button>

                    {/* Manual address form */}
                    {showManualForm && (
                      <div className={styles.manualForm}>
                        <p className={styles.manualFormTitle}>Preencha o endereço manualmente</p>

                        {/* CEP + Buscar */}
                        <div className={styles.fieldRow}>
                          <input
                            type="text"
                            placeholder="CEP"
                            value={cep}
                            onChange={e => setCep(e.target.value)}
                            className={styles.input}
                          />
                          <button
                            onClick={() => fetchAddressByCep(cep)}
                            className={styles.btnLookup}
                          >
                            Buscar
                          </button>
                        </div>

                        {/* Rua */}
                        <div className={styles.field}>
                          <label className={styles.label}>Rua</label>
                          <input
                            type="text"
                            placeholder="Rua"
                            value={street}
                            onChange={e => setStreet(e.target.value)}
                            className={styles.input}
                          />
                        </div>

                        {/* Número + Complemento */}
                        <div className={styles.fieldGrid2}>
                          <div className={styles.field}>
                            <label className={styles.label}>Número</label>
                            <input
                              type="text"
                              placeholder="Número"
                              value={number}
                              onChange={e => setNumber(e.target.value)}
                              className={styles.input}
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Complemento</label>
                            <input
                              type="text"
                              placeholder="Complemento"
                              value={addressLabel}
                              onChange={e => setAddressLabel(e.target.value)}
                              className={styles.input}
                            />
                          </div>
                        </div>

                        {/* Bairro + Cidade */}
                        <div className={styles.fieldGrid2}>
                          <div className={styles.field}>
                            <label className={styles.label}>Bairro</label>
                            <input
                              type="text"
                              placeholder="Bairro"
                              value={neighborhood}
                              onChange={e => setNeighborhood(e.target.value)}
                              className={styles.input}
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Cidade</label>
                            <input
                              type="text"
                              placeholder="Cidade"
                              value={city}
                              onChange={e => setCity(e.target.value)}
                              className={styles.input}
                            />
                          </div>
                        </div>

                        {/* Estado */}
                        <div className={styles.field}>
                          <label className={styles.label}>Estado</label>
                          <input
                            type="text"
                            placeholder="Estado (ex: SP)"
                            value={state}
                            onChange={e => setState(e.target.value.toUpperCase())}
                            maxLength={2}
                            className={styles.input}
                          />
                        </div>

                        {/* Coordenadas (readonly) */}
                        <div className={styles.fieldGrid2}>
                          <div className={styles.field}>
                            <label className={styles.label}>Latitude</label>
                            <input
                              type="text"
                              placeholder="Latitude"
                              value={latitude}
                              readOnly
                              className={`${styles.input} ${styles.inputReadonly}`}
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.label}>Longitude</label>
                            <input
                              type="text"
                              placeholder="Longitude"
                              value={longitude}
                              readOnly
                              className={`${styles.input} ${styles.inputReadonly}`}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveAddress}
                          className={styles.btnSave}
                        >
                          Salvar Endereço
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Map section */}
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}><Icon name="map-pin" size={16} /> Localização</h2>
                  </div>
                  <div className={styles.sectionBody}>
                    <div className={styles.mapWrapper}>
                      <div id="gmap-checkout" style={{ width: '100%', height: '100%' }} />
                    </div>
                    <p className={styles.mapHint}>
                      Clique ou arraste o marcador para ajustar a localização
                    </p>
                  </div>
                </div>

                {/* Cart items section */}
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}><Icon name="shopping-cart" size={16} /> Itens do Pedido</h2>
                  </div>
                  <div className={styles.sectionBody}>
                    {cart.length === 0 ? (
                      <p className={styles.cartEmpty}>Seu carrinho está vazio</p>
                    ) : (
                      cart.map((c) => (
                        <div key={c.productId} className={styles.cartItem}>
                          <div className={styles.cartItemImage}>
                            <div className={styles.cartItemPlaceholder}><Icon name="package" size={20} /></div>
                          </div>
                          <div className={styles.cartItemInfo}>
                            <div className={styles.cartItemName}>{c.name}</div>
                            <div className={styles.cartItemQty}>× {c.quantity}</div>
                          </div>
                          <div className={styles.cartItemPrice}>
                            R$ {((c.price || 0) * c.quantity).toFixed(2)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Payment method section */}
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}><Icon name="credit-card" size={16} /> Forma de Pagamento</h2>
                  </div>
                  <div className={styles.sectionBody}>
                    <div className={styles.field}>
                      <label className={styles.label}>Selecione o método</label>
                      <select
                        value={paymentMethod}
                        onChange={e => setPaymentMethod(e.target.value)}
                        className={styles.select}
                      >
                        <option value="pix">Pix</option>
                        <option value="card">Cartão</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>{/* end leftColumn */}

              {/* ── RIGHT COLUMN — Summary ── */}
              <div className={styles.rightColumn}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeader}>
                    <h2 className={styles.summaryTitle}>Resumo do Pedido</h2>
                  </div>
                  <div className={styles.summaryBody}>

                    {/* Distance + Fee chips (Plano 2/3) ou aviso Plano 1 */}
                    {isStorePlan1 ? (
                      <div className={styles.plan1Notice}>
                        <Icon name="truck" size={14} /> Esta loja gerencia a própria entrega. Combine o horário diretamente com a loja após o pedido.
                      </div>
                    ) : (
                      <div className={styles.statsGrid}>
                        <div className={styles.statChip}>
                          <div className={styles.statChipLabel}>Distância</div>
                          <div className={styles.statChipValue}>{distanceKm.toFixed(2)} km</div>
                        </div>
                        <div className={styles.statChip}>
                          <div className={styles.statChipLabel}>Taxa de entrega</div>
                          <div className={styles.statChipValue}>
                            {loadingFee ? '...' : `R$ ${deliveryFee.toFixed(2)}`}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cupom de desconto */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Código do cupom"
                          value={cupomCode}
                          onChange={e => { setCupomCode(e.target.value.toUpperCase()); setCouponMsg(null); if (!e.target.value) setCouponDiscount(0); }}
                          style={{
                            flex: 1, background: 'var(--drop-bg-3)', border: '1px solid var(--drop-border-md)',
                            borderRadius: 8, color: 'var(--drop-text)', padding: '8px 12px', fontSize: 13,
                            fontFamily: 'monospace', letterSpacing: 1,
                          }}
                          disabled={couponDiscount > 0}
                        />
                        {couponDiscount > 0 ? (
                          <button onClick={removeCoupon} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                            Remover
                          </button>
                        ) : (
                          <button onClick={applyCoupon} disabled={!cupomCode.trim() || validatingCoupon} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--drop-purple)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, opacity: (!cupomCode.trim() || validatingCoupon) ? 0.5 : 1 }}>
                            {validatingCoupon ? '...' : 'Aplicar'}
                          </button>
                        )}
                      </div>
                      {couponMsg && (
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: couponMsg.type === 'ok' ? 'var(--drop-success)' : 'var(--drop-danger)', fontWeight: 600 }}>
                          {couponMsg.text}
                        </p>
                      )}
                    </div>

                    {/* Totals */}
                    <div className={styles.summaryRow}>
                      <span>Subtotal</span>
                      <span className={styles.summaryRowValue}>R$ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Entrega</span>
                      <span className={styles.summaryRowValue}>
                        {isStorePlan1 ? '—' : `R$ ${deliveryFee.toFixed(2)}`}
                      </span>
                    </div>
                    {couponDiscount > 0 && (
                      <div className={styles.summaryRow} style={{ color: 'var(--drop-success)' }}>
                        <span>Desconto (cupom)</span>
                        <span>−R$ {couponDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className={styles.summaryDivider} />
                    <div className={styles.summaryTotal}>
                      <span className={styles.summaryTotalLabel}>Total</span>
                      <span className={styles.summaryTotalValue}>R$ {total.toFixed(2)}</span>
                    </div>

                    <div className={styles.summaryDivider} />

                    {/* Wallet balance */}
                    {!loadingWallet && (
                      <>
                      {pendingDebt && (
                        <div style={{ color: '#F59E0B', marginBottom: 8, fontSize: 13 }}>
                          <Icon name="alert-triangle" size={14} /> Você tem uma multa pendente de R$ {pendingDebt.amount.toFixed(2)} que será cobrada neste pedido.
                        </div>
                      )}
                      <div className={styles.walletInfo}>
                        <span className={styles.walletLabel}><Icon name="wallet" size={14} /> Saldo</span>
                        <div style={{ textAlign: 'right' }}>
                          <div
                            className={styles.walletBalance}
                            style={{ color: isWalletInsufficient ? 'var(--drop-danger)' : 'var(--drop-success)' }}
                          >
                            R$ {walletBalance.toFixed(2)}
                          </div>
                          <div className={`${styles.walletNote} ${isWalletInsufficient ? styles.walletNoteInsufficient : ''}`}>
                            {isWalletInsufficient
                              ? `Faltam R$ ${(total - walletBalance).toFixed(2)}`
                              : 'Saldo suficiente'}
                          </div>
                        </div>
                      </div>
                      </>
                    )}

                    {/* Finalise button */}
                    <button
                      className={styles.btnSubmit}
                      disabled={cart.length === 0 || loadingFee || isPlacing || loadingWallet}
                      onClick={() => {
                        // ✅ NOVO: Validar campos antes de abrir modal
                        if (!storeId) return alert('Carrinho vazio');
                        if (!street || !number || !neighborhood || !city || !state || !cep || !latitude || !longitude) {
                          return alert('Preencha todos os campos de endereço');
                        }
                        if (paymentMethod !== 'cash_on_delivery' && paymentMethod !== 'pix' && walletBalance < total) {
                          return alert(`Saldo insuficiente! Você precisa de R$ ${(total - walletBalance).toFixed(2)} a mais.`);
                        }
                        setShowConfirmation(true);
                      }}
                    >
                      {isPlacing ? 'Processando...' : 'Finalizar Pedido'}
                    </button>

                    {/* Clear cart button */}
                    <button
                      className={styles.btnDanger}
                      onClick={clear}
                      disabled={cart.length === 0}
                    >
                      <Icon name="trash" size={14} /> Limpar carrinho
                    </button>

                  </div>
                </div>
              </div>{/* end rightColumn */}

            </div>{/* end mainGrid */}
          </div>{/* end container */}
        </div>
      )}{/* end !blocked */}

      {/* ✅ NOVO: MODAL DE CONFIRMAÇÃO */}
      {showConfirmation && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmModal}>
            <h2 className={styles.confirmTitle}>Confirmar Pedido</h2>
            <p className={styles.confirmSubtitle}>Revise os detalhes antes de confirmar</p>

            {/* Produtos */}
            <div className={styles.confirmSection}>
              <p className={styles.confirmSectionLabel}><Icon name="package" size={14} /> Produtos ({cart.length})</p>
              {cart.map((item, idx) => (
                <div key={idx} className={styles.confirmItem}>
                  <span className={styles.confirmItemName}>{item.name} ×{item.quantity}</span>
                  <strong className={styles.confirmItemPrice}>R${((item.price || 0) * item.quantity).toFixed(2)}</strong>
                </div>
              ))}
            </div>

            {/* Endereço */}
            <div className={styles.confirmSection}>
              <p className={styles.confirmSectionLabel}><Icon name="map-pin" size={14} /> Endereço de Entrega</p>
              <p className={styles.confirmAddress}>
                <strong>{street}, {number}</strong><br />
                {neighborhood}, {city} - {state}<br />
                CEP: {cep}
              </p>
              <p className={styles.confirmDistance}>Distância: {distanceKm.toFixed(1)} km</p>
            </div>

            {/* Valores */}
            <div className={styles.confirmTotalsBox}>
              <div className={styles.confirmTotalRow}>
                <span>Subtotal</span>
                <span>R${subtotal.toFixed(2)}</span>
              </div>
              <div className={styles.confirmTotalRow}>
                <span>Taxa de Entrega</span>
                <span>R${deliveryFee.toFixed(2)}</span>
              </div>
              <div className={styles.confirmGrandTotal}>
                <span>Total</span>
                <span>R${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Pagamento */}
            <div className={styles.confirmSection}>
              <p className={styles.confirmSectionLabel}><Icon name="credit-card" size={14} /> Forma de Pagamento</p>
              <div className={styles.confirmPaymentBadge}>
                {paymentMethod === 'pix' && 'PIX'}
                {paymentMethod === 'credit_card' && 'Cartão de Crédito'}
                {paymentMethod === 'cash_on_delivery' && 'Dinheiro na Entrega'}
                {paymentMethod === 'card' && 'Cartão'}
              </div>
            </div>

            {/* Aviso de distância não calculada */}
            {(!distanceKm || distanceKm < 0.1) && (
              <div className={styles.warningBox}>
                <Icon name="alert-triangle" size={14} /> <strong>Distância não calculada!</strong> Verifique se seu endereço está correto no mapa.
              </div>
            )}

            {/* Botões */}
            <div className={styles.confirmActions}>
              <button
                className={styles.btnConfirmCancel}
                onClick={() => setShowConfirmation(false)}
                disabled={isPlacing}
              >
                ← Voltar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={placeOrder}
                disabled={isPlacing || !distanceKm || distanceKm < 0.1}
              >
                {isPlacing ? 'Processando...' : (!distanceKm || distanceKm < 0.1) ? 'Calcule a distância' : 'Confirmar Pedido'}
              </button>
            </div>

            {/* Hint */}
            <p className={styles.confirmHint}>
              Você poderá cancelar este pedido nos próximos 10 minutos pelo app.
            </p>
          </div>
        </div>
      )}

      {/* Pagamento PIX (gateway Asaas) — confirmação automática via webhook */}
      {pixData && <PixPaymentModal pix={pixData} />}
    </ProtectedRoute>
  );
}
