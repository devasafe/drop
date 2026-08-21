import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import api from '../lib/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Tag } from './ui/Tag';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import styles from './AddressManager.module.css';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false });

const EMPTY_FORM = {
  label: '', street: '', number: '', neighborhood: '', city: '', state: '',
  zip: '', latitude: '', longitude: '', setAsDefault: false,
};

interface AddressManagerProps {
  /** Notifica o parent quando a contagem de endereços muda (ex.: rótulo de aba). */
  onCountChange?: (count: number) => void;
}

/**
 * Gerenciador de endereços do cliente (listar / adicionar / editar / remover /
 * definir padrão), com MapPicker. Componente autossuficiente — busca os
 * próprios dados — para ser reusado no painel de Pedidos e no Perfil.
 */
export default function AddressManager({ onCountChange }: AddressManagerProps) {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [mainAddress, setMainAddress] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);

  const applyAddresses = useCallback((list: any[]) => {
    const arr = Array.isArray(list) ? list : [];
    setAddresses(arr);
    onCountChange?.(arr.length);
  }, [onCountChange]);

  const load = useCallback(async () => {
    try {
      const [addr, me] = await Promise.all([
        api.get('/user/addresses'),
        api.get('/user/me').catch(() => ({ data: null })),
      ]);
      applyAddresses(addr.data);
      setMainAddress(me.data?.mainAddress ?? null);
    } catch {
      // silencioso — lista fica vazia
    }
  }, [applyAddresses]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setEditing(null); setForm({ ...EMPTY_FORM }); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const required = ['street', 'number', 'city', 'zip', 'neighborhood', 'state', 'latitude', 'longitude'];
    if (required.some((f) => !form[f])) {
      setError('Preencha todos os campos obrigatórios e posicione no mapa.');
      return;
    }
    try {
      const payload: any = { ...form, cep: form.zip };
      delete payload.zip;
      let res;
      if (editing && typeof editing.idx === 'number') {
        res = await api.put(`/user/addresses/${editing.idx}`, payload);
      } else {
        res = await api.post('/user/addresses', payload);
      }
      applyAddresses(Array.isArray(res.data) ? res.data : (res.data?.addresses || []));
      if (res.data?.mainAddress) setMainAddress(res.data.mainAddress);
      resetForm();
      setShowForm(false);
    } catch {
      setError(editing ? 'Erro ao editar endereço' : 'Erro ao adicionar endereço');
    }
  };

  const remove = async (idx: number) => {
    if (!window.confirm('Remover este endereço?')) return;
    try {
      await api.delete(`/user/addresses/${idx}`);
      applyAddresses(addresses.filter((_, i) => i !== idx));
    } catch { alert('Erro ao remover endereço'); }
  };

  const setDefault = async (addr: any, idx: number) => {
    try {
      await api.post('/user/addresses/set-default', { addressId: addr._id || idx });
      setMainAddress(addr);
    } catch { alert('Erro ao definir endereço padrão'); }
  };

  const isDefaultAddr = (addr: any, idx: number) =>
    mainAddress && (mainAddress._id === addr._id || mainAddress === addr._id || mainAddress === idx);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>Seus endereços</h2>
        <Button
          variant={showForm ? 'ghost' : 'primary'}
          size="sm"
          onClick={() => { if (showForm) resetForm(); setShowForm(!showForm); }}
        >
          {showForm ? 'Fechar' : 'Novo endereço'}
        </Button>
      </div>

      {addresses.length === 0 && !showForm && (
        <EmptyState icon={<MapPin />} title="Nenhum endereço cadastrado" description="Adicione um endereço para receber seus pedidos." />
      )}

      {showForm && (
        <div className={styles.form}>
          <h3 className={styles.formTitle}>{editing ? 'Editar endereço' : 'Adicionar novo endereço'}</h3>
          <form onSubmit={submit}>
            <div className={styles.grid2}>
              <Input placeholder="Apelido (ex: Casa)" value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
              <Input placeholder="CEP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
            </div>
            <div className={styles.grid21}>
              <Input placeholder="Rua" value={form.street} onChange={(v) => setForm({ ...form, street: v })} />
              <Input placeholder="Número" value={form.number} onChange={(v) => setForm({ ...form, number: v })} />
            </div>
            <div className={styles.grid3}>
              <Input placeholder="Bairro" value={form.neighborhood} onChange={(v) => setForm({ ...form, neighborhood: v })} />
              <Input placeholder="Cidade" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Input placeholder="UF" value={form.state} onChange={(v) => setForm({ ...form, state: v.toUpperCase() })} />
            </div>

            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                id="am-setDefault"
                checked={form.setAsDefault || false}
                onChange={(e) => setForm({ ...form, setAsDefault: e.target.checked })}
                className={styles.checkbox}
              />
              <label htmlFor="am-setDefault" className={styles.checkboxLabel}>Usar como endereço padrão</label>
            </div>

            <div className={styles.mapWrapper}>
              <MapPicker
                lat={form.latitude || ''}
                lng={form.longitude || ''}
                addressForm={form}
                onChange={(lat: string, lng: string, address?: any) => {
                  setForm((prev: any) => ({
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

            {error && <div className={styles.formError}>{error}</div>}

            <div className={styles.formButtons}>
              <Button type="submit" variant="primary">Salvar endereço</Button>
              <Button type="button" variant="ghost" onClick={() => { resetForm(); setShowForm(false); }}>Cancelar</Button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.list}>
        {addresses.map((addr, idx) => {
          const def = isDefaultAddr(addr, idx);
          return (
            <Card key={addr._id || idx} className={`${styles.card} ${def ? styles.cardDefault : ''}`}>
              <div className={styles.cardTop}>
                <div>
                  <div className={styles.label}>
                    {addr.label || <span className={styles.noLabel}>Sem apelido</span>}
                  </div>
                  <div className={styles.text}>
                    {addr.street}, {addr.number} — {addr.neighborhood}<br />
                    {addr.city} - {addr.state}, {addr.cep || addr.zip}
                  </div>
                </div>
                {def && <Tag>Padrão</Tag>}
              </div>
              <div className={styles.actions}>
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditing({ ...addr, idx });
                  setForm({
                    label: addr.label || '', street: addr.street || '', number: addr.number || '',
                    neighborhood: addr.neighborhood || '', city: addr.city || '', state: addr.state || '',
                    zip: addr.cep || addr.zip || '', latitude: addr.latitude || '', longitude: addr.longitude || '',
                    setAsDefault: false,
                  });
                  setShowForm(true);
                }}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => remove(idx)}>Remover</Button>
                {!def && (
                  <Button variant="ghost" size="sm" onClick={() => setDefault(addr, idx)}>Tornar padrão</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
