// Etapa "Criar a loja" do cadastro (protótipo 9), embutida em /seller/abrir e reaproveitada por
// /seller/create-store. Com a loja já criada, a mesma tela abre em modo edição (PUT /stores/:id).
// Regras portadas da tela antiga, sem mudança: POST /stores com CNPJ obrigatório na custódia e opcional
// no modo direto; endereço estruturado + ponto no mapa (latitude/longitude) obrigatórios.
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Check } from 'lucide-react';
import api from '../../../lib/api';
import { maskCEP, maskCNPJ, onlyDigits } from '../../../lib/masks';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import blocks from '../ui/SellerBlocks.module.css';
import styles from './Etapas.module.css';

const MapPicker = dynamic(() => import('../../MapPicker'), { ssr: false });

export interface StoreLike {
  _id?: string;
  name?: string;
  cnpj?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

interface Props {
  /** Loja já criada → modo edição. */
  store?: StoreLike | null;
  /** Modo direto: CNPJ opcional. */
  cnpjRequired: boolean;
  onDone: () => void;
}

const str = (v: unknown) => (v == null ? '' : String(v));

export function DadosLojaStep({ store, cnpjRequired, onDone }: Props) {
  const editing = !!store?._id;
  const [name, setName] = useState(str(store?.name));
  const [cnpj, setCnpj] = useState(maskCNPJ(str(store?.cnpj)));
  const [cep, setCep] = useState(maskCEP(str(store?.zip)));
  const [number, setNumber] = useState(str(store?.number));
  const [street, setStreet] = useState(str(store?.street));
  const [neighborhood, setNeighborhood] = useState(str(store?.neighborhood));
  const [city, setCity] = useState(str(store?.city));
  const [uf, setUf] = useState(str(store?.state));
  const [lat, setLat] = useState(str(store?.latitude));
  const [lng, setLng] = useState(str(store?.longitude));
  const [manual, setManual] = useState(false);
  const [cepMsg, setCepMsg] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const lastCep = useRef(onlyDigits(str(store?.zip)));

  // CEP com 8 dígitos → ViaCEP completa rua, bairro, cidade e UF.
  useEffect(() => {
    const clean = onlyDigits(cep);
    if (clean.length !== 8 || clean === lastCep.current) return;
    lastCep.current = clean;
    let alive = true;
    setCepMsg('');
    fetch(`https://viacep.com.br/ws/${clean}/json/`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        if (d?.erro) { setCepMsg('Não achamos esse CEP. Digite o endereço.'); setManual(true); return; }
        setStreet(d.logradouro || '');
        setNeighborhood(d.bairro || '');
        setCity(d.localidade || '');
        setUf(d.uf || '');
        if (!d.logradouro) setManual(true);
      })
      .catch(() => { if (alive) { setCepMsg('Não conseguimos buscar o CEP agora. Digite o endereço.'); setManual(true); } });
    return () => { alive = false; };
  }, [cep]);

  const onMap = (la: string, ln: string, addr?: any) => {
    setLat(la);
    setLng(ln);
    if (addr && Object.keys(addr).length) {
      if (addr.street) setStreet(addr.street);
      if (addr.number) setNumber(addr.number);
      if (addr.neighborhood) setNeighborhood(addr.neighborhood);
      if (addr.city) setCity(addr.city);
      if (addr.state) setUf(addr.state);
      if (addr.zip) { lastCep.current = onlyDigits(addr.zip); setCep(maskCEP(addr.zip)); }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved('');
    if (!name.trim() || (cnpjRequired && !cnpj) || !street || !number || !neighborhood || !city || !uf || !cep) {
      setError('Preencha todos os campos obrigatórios.');
      if (!street || !neighborhood || !city || !uf) setManual(true);
      return;
    }
    if (cnpj && onlyDigits(cnpj).length !== 14) { setError('CNPJ deve ter 14 dígitos.'); return; }
    if (!lat || !lng) {
      setError('Não achamos o ponto da loja no mapa. Confira o endereço ou arraste o pino.');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/stores/${store!._id}`, {
          name: name.trim(), cnpj: onlyDigits(cnpj), street, number, neighborhood, city, state: uf, zip: cep, latitude: lat, longitude: lng,
        });
        setSaved('Dados da loja salvos.');
        onDone();
      } else {
        const address = `${street}, ${number} - ${neighborhood}, ${city} - ${uf}, ${cep}`;
        await api.post('/stores', {
          name: name.trim(),
          ...(cnpj ? { cnpj } : {}),
          address,
          // Campos estruturados: viram o endereço oficial da loja (reusado no recebimento).
          street, number, neighborhood, city, state: uf, zip: cep,
          latitude: lat, longitude: lng,
        });
        onDone();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || (editing ? 'Não foi possível salvar os dados da loja.' : 'Não foi possível criar a loja.'));
    } finally {
      setBusy(false);
    }
  };

  const foundLine = !manual && street && city ? `${street} · ${neighborhood ? `${neighborhood} · ` : ''}${city}/${uf}` : '';
  const action = editing ? 'Salvar dados da loja' : cnpjRequired ? 'Continuar para documentos' : 'Criar a loja';

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <section className={blocks.blk} aria-label="Sua loja">
        <p className={styles.lead}>
          {editing ? 'Mudar o endereço ou o CNPJ pede nova verificação da loja.' : 'Comece pelo básico. É isso que o cliente vê no topo da sua loja.'}
        </p>
        <Input label="Nome da loja" value={name} onChange={setName} maxLength={80} autoComplete="organization" />
        <Input
          label={cnpjRequired ? 'CNPJ' : 'CNPJ (opcional)'}
          value={cnpj}
          onChange={(v) => setCnpj(maskCNPJ(v))}
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
        />
        <p className={blocks.meta}>Logo, capa e horários você põe depois, na aba Loja.</p>
      </section>

      <section className={blocks.blk} aria-label="Onde a loja fica">
        <h3 className={blocks.headTitle}>Onde a loja fica</h3>
        <div className={styles.pair}>
          <Input label="CEP" value={cep} onChange={(v) => setCep(maskCEP(v))} inputMode="numeric" placeholder="00000-000" maxLength={9} />
          <Input label="Número" value={number} onChange={setNumber} maxLength={10} />
        </div>
        {cepMsg && <Alert tone="warning">{cepMsg}</Alert>}
        {foundLine && (
          <p className={styles.found}>
            <Check size={16} aria-hidden="true" />
            <span>{foundLine}</span>
          </p>
        )}
        {foundLine && (
          <button type="button" className={blocks.link} onClick={() => setManual(true)}>Corrigir o endereço</button>
        )}
        {manual && (
          <>
            <Input label="Rua" value={street} onChange={setStreet} maxLength={120} />
            <Input label="Bairro" value={neighborhood} onChange={setNeighborhood} maxLength={80} />
            <div className={styles.pairWide}>
              <Input label="Cidade" value={city} onChange={setCity} maxLength={80} />
              <Input label="Estado" value={uf} onChange={(v) => setUf(v.toUpperCase().replace(/[^A-Z]/g, ''))} maxLength={2} placeholder="UF" />
            </div>
          </>
        )}
        {street && city && (
          <div className={styles.map}>
            <MapPicker
              lat={lat}
              lng={lng}
              onChange={onMap}
              height={180}
              addressForm={{ street, number, neighborhood, city, state: uf, cep }}
            />
          </div>
        )}
        <p className={blocks.meta}>Os motoboys retiram aqui. A distância até o cliente define o frete. Se o pino não estiver no lugar certo, arraste.</p>
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">{saved}</Alert>}
      <div className={blocks.bar}>
        <Button type="submit" loading={busy}>{action}</Button>
        <small>Salvamos a cada etapa · dá para continuar depois</small>
      </div>
    </form>
  );
}

export default DadosLojaStep;
