import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { maskCNPJ, maskCEP } from '../../lib/masks';
import styles from './CreateStore.module.css';

export default function CreateStore() {
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cep, setCep] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapError, setMapError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const router = useRouter();

  // Inicializa mapa quando Google Maps está carregado
  useEffect(() => {
    const checkAndInitialize = () => {
      if ((window as any).google?.maps) {
        handleScriptLoad();
      } else {
        setTimeout(checkAndInitialize, 100);
      }
    };
    checkAndInitialize();
  }, []);

  // Busca endereço pelo CEP usando ViaCEP
  const fetchAddressByCep = async (cepValue: string) => {
    const cleanCep = cepValue.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setError('CEP deve ter 8 dígitos.');
      return;
    }
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      if (!res.ok) {
        setError('Erro de conexão com ViaCEP. Status: ' + res.status);
        return;
      }
      const data = await res.json();
      if (data.erro) {
        setError('CEP não encontrado.');
        return;
      }
      setError('');
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
            updateMapMarker(loc.lat(), loc.lng());
          }
        });
      }
    } catch (e: any) {
      setError('Erro ao buscar endereço pelo CEP: ' + (e?.message || e));
    }
  };

  // Forward Geocoding: Busca coordenadas quando digita rua/número/bairro
  const updateMapFromAddress = () => {
    if (!street || !number || !city || !state) {
      return;
    }

    if ((window as any).google && (window as any).google.maps) {
      const geocoder = new (window as any).google.maps.Geocoder();
      const address = `${street}, ${number}, ${neighborhood || ''}, ${city}, ${state}`;
      geocoder.geocode({ address }, (results: any, status: any) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          const lat = loc.lat().toString();
          const lng = loc.lng().toString();
          setLatitude(lat);
          setLongitude(lng);
          updateMapMarker(parseFloat(lat), parseFloat(lng));
        }
      });
    }
  };

  // Atualizar marker no mapa
  const updateMapMarker = (lat: number, lng: number) => {
    if (mapRef.current && markerRef.current) {
      const newPos = { lat, lng };
      mapRef.current.setCenter(newPos);
      markerRef.current.setPosition(newPos);
    }
  };

  const handleScriptLoad = () => {
    if (!(window as any).google || (window as any).google.maps === undefined) return;

    const gmapEl = document.getElementById('gmap');
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
      markerRef.current.addListener('dragend', (e: any) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setLatitude(lat.toString());
        setLongitude(lng.toString());
        // Geocoding reverso para atualizar campos de endereço
        if ((window as any).google && (window as any).google.maps) {
          const geocoder = new (window as any).google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
            if (status === 'OK' && results[0]) {
              const addressComponents = results[0].address_components;
              let street = '', number = '', neighborhood = '', city = '', state = '', cep = '';
              addressComponents.forEach((comp: any) => {
                if (comp.types.includes('route')) street = comp.long_name;
                if (comp.types.includes('street_number')) number = comp.long_name;
                if (comp.types.includes('sublocality') || (comp.types.includes('political') && comp.types.includes('sublocality_level_1'))) neighborhood = comp.long_name;
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
      setMapError('Erro ao carregar o mapa. Verifique sua chave e permissões.');
    }
  };

  const submit = async (e: any) => {
    e.preventDefault();
    setError('');

    if (!name || !cnpj || !street || !number || !neighborhood || !city || !state || !cep) {
      setError('Preencha todos os campos obrigatórios');
      return;
    }

    if (!latitude || !longitude) {
      setError('Selecione a localização exata da loja no mapa antes de cadastrar.');
      return;
    }

    setLoading(true);
    try {
      const address = `${street}, ${number} - ${neighborhood}, ${city} - ${state}, ${cep}`;
      await api.post('/stores', {
        name,
        cnpj,
        address,
        // Campos estruturados: viram o endereço oficial da loja (reusado no Asaas,
        // evita pedir endereço de novo em Dados de Recebimento).
        street,
        number,
        neighborhood,
        city,
        state,
        zip: cep,
        latitude,
        longitude,
      });
      router.push('/verificacao?onboarding=1');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao cadastrar loja');
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.header}>
            <h1 className={styles.pageTitle}>Cadastro de Loja</h1>
            <p className={styles.pageSubtitle}>
              Configure as informações e localização da sua loja
            </p>
          </div>

          {/* Main grid */}
          <div className={styles.mainGrid}>

            {/* LEFT - Formulário */}
            <div className={styles.formCard}>
              <h2 className={styles.cardTitle}>Informações da Loja</h2>

              <form onSubmit={submit} className={styles.form}>

                {error && (
                  <div className={styles.errorBox}>{error}</div>
                )}

                {/* Nome */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Nome da Loja</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Sua Loja Delivery"
                    className={styles.input}
                  />
                </div>

                {/* CNPJ */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>CNPJ</label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
                    required
                    placeholder="00.000.000/0000-00"
                    className={styles.input}
                  />
                </div>

                {/* CEP */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>CEP</label>
                  <div className={styles.cepRow}>
                    <input
                      type="text"
                      placeholder="00000-000"
                      value={cep}
                      onChange={(e) => setCep(maskCEP(e.target.value))}
                      onBlur={(e) => {
                        if (e.target.value.length === 8 || e.target.value.replace(/\D/g, '').length === 8) {
                          fetchAddressByCep(e.target.value);
                        }
                      }}
                      className={`${styles.input} ${styles.cepInput}`}
                    />
                    <button
                      type="button"
                      onClick={() => fetchAddressByCep(cep)}
                      className={styles.btnCep}
                    >
                      Buscar
                    </button>
                  </div>
                </div>

                {/* Rua */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Rua</label>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    onBlur={updateMapFromAddress}
                    required
                    placeholder="Rua das Flores"
                    className={styles.input}
                  />
                </div>

                {/* Número + Bairro */}
                <div className={styles.grid2}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Número</label>
                    <input
                      type="text"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      onBlur={updateMapFromAddress}
                      required
                      placeholder="123"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Bairro</label>
                    <input
                      type="text"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      onBlur={updateMapFromAddress}
                      required
                      placeholder="Centro"
                      className={styles.input}
                    />
                  </div>
                </div>

                {/* Cidade + Estado */}
                <div className={styles.gridCidadeEstado}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Cidade</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      onBlur={updateMapFromAddress}
                      required
                      placeholder="São Paulo"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Estado</label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase())}
                      onBlur={updateMapFromAddress}
                      required
                      placeholder="SP"
                      maxLength={2}
                      className={styles.input}
                    />
                  </div>
                </div>

                {/* Coordenadas (readonly) */}
                <div className={styles.grid2}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Latitude</label>
                    <input
                      type="text"
                      value={latitude}
                      readOnly
                      className={styles.inputReadonly}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Longitude</label>
                    <input
                      type="text"
                      value={longitude}
                      readOnly
                      className={styles.inputReadonly}
                    />
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className={styles.btnSubmit}
                >
                  {loading ? 'Cadastrando...' : 'Cadastrar Loja'}
                </button>
              </form>
            </div>

            {/* RIGHT - Mapa */}
            <div className={styles.mapColumn}>
              <h2 className={styles.cardTitle}>Localização no Mapa</h2>

              <div className={styles.mapWrapper}>
                <div id="gmap" className={styles.mapEl}></div>
              </div>

              <div className={styles.tipBox}>
                <p className={styles.tipTitle}>Dica</p>
                <p className={styles.tipText}>
                  Clique ou arraste o marcador para ajustar a localização exata da sua loja. As coordenadas serão atualizadas automaticamente.
                </p>
              </div>

              {mapError && (
                <div className={styles.mapErrorBox}>{mapError}</div>
              )}

              {(!latitude || !longitude) && (
                <div className={styles.warningBox}>
                  Localização não confirmada — selecione no mapa para confirmar
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
