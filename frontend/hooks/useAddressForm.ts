import { useState } from 'react';
import { Address } from '../types/checkout';

export const EMPTY_ADDRESS: Address = { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', complement: '', latitude: '', longitude: '' };

interface ViaCepResponse {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

// Estrutura mínima do retorno do Geocoder do Google Maps que de fato usamos
// (SDK carregado via script global, sem tipos — ver `(window as any).google` abaixo).
interface GeocoderResult {
  geometry: { location: { lat: () => number; lng: () => number } };
}

/** Campos do formulário de endereço + busca de CEP (ViaCEP e geocoding opcional). */
export function useAddressForm() {
  const [fields, setFields] = useState<Address>(EMPTY_ADDRESS);

  const setField = (key: keyof Address, value: string) =>
    setFields(prev => ({ ...prev, [key]: value }));

  const lookupCep = async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json() as ViaCepResponse;
      if (data.erro) return;
      setFields(prev => ({
        ...prev,
        cep,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));
      // geocoding opcional (preenche lat/long) — defensivo:
      const g = (window as any).google;
      if (g?.maps) {
        const geocoder = new g.maps.Geocoder();
        const address = `${data.logradouro}, ${fields.number || '1'}, ${data.bairro}, ${data.localidade}, ${data.uf}, ${cep}`;
        geocoder.geocode({ address }, (results: GeocoderResult[] | null, status: string) => {
          if (status === 'OK' && results?.[0]) {
            const loc = results[0].geometry.location;
            setFields(prev => ({ ...prev, latitude: String(loc.lat()), longitude: String(loc.lng()) }));
          }
        });
      }
    } catch { /* silencioso — usuário ajusta manual */ }
  };

  const reset = () => setFields(EMPTY_ADDRESS);

  return { fields, setField, setFields, lookupCep, reset };
}
