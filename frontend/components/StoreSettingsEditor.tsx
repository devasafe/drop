import { useState } from 'react';
import dynamic from 'next/dynamic';
import api from '../lib/api';
import { maskCEP, maskCNPJ, onlyDigits } from '../lib/masks';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false });

interface StoreLike {
  _id: string;
  name?: string;
  cnpj?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: string;
  longitude?: string;
}

interface Props {
  store: StoreLike;
  onSaved?: (updated: Partial<StoreLike>) => void;
}

type Form = {
  name: string;
  cnpj: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
};

export default function StoreSettingsEditor({ store, onSaved }: Props) {
  const [form, setForm] = useState<Form>({
    name: store.name || '',
    cnpj: maskCNPJ(store.cnpj || ''),
    street: store.street || '',
    number: store.number || '',
    neighborhood: store.neighborhood || '',
    city: store.city || '',
    state: store.state || '',
    zip: store.zip || '',
    latitude: store.latitude || '',
    longitude: store.longitude || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<Form>) => setForm(prev => ({ ...prev, ...patch }));

  const geocode = (address: string) => {
    const g = (window as any).google;
    if (!g?.maps) { setError('Mapa não carregado. Atualize a página.'); return; }
    const geocoder = new g.maps.Geocoder();
    geocoder.geocode({ address }, (results: any, status: any) => {
      if (status === 'OK' && results[0]) {
        set({
          latitude: String(results[0].geometry.location.lat()),
          longitude: String(results[0].geometry.location.lng()),
        });
        setError(null);
      } else {
        setError('Não foi possível localizar no mapa. Reposicione manualmente.');
      }
    });
  };

  const buscarCep = async () => {
    const clean = (form.zip || '').replace(/\D/g, '');
    if (clean.length !== 8) { setError('CEP deve ter 8 dígitos'); return; }
    try {
      setError(null);
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) { setError('CEP não encontrado.'); return; }
      set({
        street: data.logradouro || '',
        neighborhood: data.bairro || '',
        city: data.localidade || '',
        state: data.uf || '',
        zip: clean,
      });
      geocode(`${data.logradouro}, ${data.localidade}, ${data.uf}`);
    } catch {
      setError('Erro ao buscar CEP. Tente novamente.');
    }
  };

  const buscarPorRua = () => {
    if (!form.street || !form.city) { setError('Digite a rua e a cidade para buscar'); return; }
    setError(null);
    const address = `${form.street}${form.number ? ', ' + form.number : ''}, ${form.city}, ${form.state || 'Brasil'}`;
    geocode(address);
  };

  const onMapChange = (lat: string, lng: string, address?: any) => {
    const patch: Partial<Form> = { latitude: lat, longitude: lng };
    if (address && Object.keys(address).length > 0) {
      if (address.street) patch.street = address.street;
      if (address.number) patch.number = address.number;
      if (address.neighborhood) patch.neighborhood = address.neighborhood;
      if (address.city) patch.city = address.city;
      if (address.state) patch.state = address.state;
      if (address.zip) patch.zip = address.zip;
    }
    set(patch);
  };

  const salvar = async () => {
    setError(null); setMsg(null);
    if (!form.name.trim()) { setError('Informe o nome da loja.'); return; }
    const cnpjDigits = onlyDigits(form.cnpj);
    if (cnpjDigits && cnpjDigits.length !== 14) { setError('CNPJ deve ter 14 dígitos.'); return; }
    const required: (keyof Form)[] = ['street', 'number', 'city', 'state', 'zip', 'latitude', 'longitude'];
    for (const f of required) {
      if (!form[f]) { setError('Preencha todos os campos do endereço e posicione no mapa.'); return; }
    }
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        cnpj: cnpjDigits,
        street: form.street,
        number: form.number,
        neighborhood: form.neighborhood,
        city: form.city,
        state: form.state,
        zip: form.zip,
        latitude: form.latitude,
        longitude: form.longitude,
      };
      await api.put(`/stores/${store._id}`, payload);
      setMsg('Dados da loja salvos. Alterar o endereço ou o CNPJ exige reaprovação na verificação da loja.');
      onSaved?.(payload);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao salvar os dados da loja.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={card}>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, marginTop: 0 }}>Dados da loja</h2>
      <p style={hint}>Alterar o <strong>endereço</strong> ou o <strong>CNPJ</strong> exige passar pela verificação da loja novamente.</p>
      {msg && <div style={banner}>{msg}</div>}
      {error && <div style={{ ...banner, borderColor: '#EF4444', background: 'rgba(239,68,68,0.12)' }}>{error}</div>}

      <label style={hint}>Nome da loja</label>
      <input style={input} value={form.name} onChange={e => set({ name: e.target.value })} />

      <label style={hint}>CNPJ</label>
      <input style={input} value={form.cnpj} onChange={e => set({ cnpj: maskCNPJ(e.target.value) })} placeholder="00.000.000/0000-00" inputMode="numeric" />

      <label style={hint}>CEP</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={input} value={form.zip} onChange={e => set({ zip: maskCEP(e.target.value) })} placeholder="00000-000" inputMode="numeric" />
        <button type="button" style={{ ...btn, background: '#3A3A3A', whiteSpace: 'nowrap' }} onClick={buscarCep}>Buscar CEP</button>
      </div>

      <label style={hint}>Rua</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={input} value={form.street} onChange={e => set({ street: e.target.value })} />
        <button type="button" style={{ ...btn, background: '#3A3A3A', whiteSpace: 'nowrap' }} onClick={buscarPorRua}>Localizar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={hint}>Número</label>
          <input style={input} value={form.number} onChange={e => set({ number: e.target.value })} />
        </div>
        <div>
          <label style={hint}>Bairro</label>
          <input style={input} value={form.neighborhood} onChange={e => set({ neighborhood: e.target.value })} />
        </div>
        <div>
          <label style={hint}>Cidade</label>
          <input style={input} value={form.city} onChange={e => set({ city: e.target.value })} />
        </div>
        <div>
          <label style={hint}>UF</label>
          <input style={input} maxLength={2} value={form.state} onChange={e => set({ state: e.target.value.toUpperCase() })} />
        </div>
      </div>

      {form.latitude && form.longitude ? (
        <div style={{ marginTop: 12 }}>
          <label style={hint}>Posicione no mapa</label>
          <MapPicker lat={form.latitude} lng={form.longitude} onChange={onMapChange} />
          <div style={{ ...hint, fontSize: 12 }}>Lat: {form.latitude} · Lng: {form.longitude}</div>
        </div>
      ) : (
        <p style={hint}>Busque pelo CEP ou pela rua para posicionar a loja no mapa.</p>
      )}

      <button style={{ ...btn, marginTop: 14 }} onClick={salvar} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar dados da loja'}
      </button>
    </section>
  );
}

const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, marginTop: 16 };
const banner: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', border: '1px solid #6C2BD9', borderRadius: 10, padding: '10px 14px', margin: '10px 0', fontSize: 14 };
const hint: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'block', margin: '8px 0 4px' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0A0A0A', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', marginBottom: 6 };
const btn: React.CSSProperties = { background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' };
