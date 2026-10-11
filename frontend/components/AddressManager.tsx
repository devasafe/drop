import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Briefcase, Home, MapPin, MoreHorizontal } from 'lucide-react';
import api from '../lib/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Sheet } from './ui/Sheet';
import { EmptyState } from './ui/EmptyState';
import { maskCEP, onlyDigits } from '../lib/masks';
import styles from './AddressManager.module.css';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false });

const EMPTY_FORM = {
  label: '', street: '', number: '', neighborhood: '', city: '', state: '',
  zip: '', complement: '', latitude: '', longitude: '', setAsDefault: false,
};

const LABEL_CHIPS = ['Casa', 'Trabalho', 'Outro'];

function LabelIcon({ label }: { label?: string }) {
  if (label === 'Casa') return <Home size={18} aria-hidden="true" />;
  if (label === 'Trabalho') return <Briefcase size={18} aria-hidden="true" />;
  return <MapPin size={18} aria-hidden="true" />;
}

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
  const [menu, setMenu] = useState<{ addr: any; idx: number } | null>(null);
  const [labelChoice, setLabelChoice] = useState<string>('');
  const [showFix, setShowFix] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'found' | 'notfound'>('idle');

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

  const resetForm = () => {
    setEditing(null); setForm({ ...EMPTY_FORM }); setLabelChoice(''); setShowFix(false); setCepStatus('idle');
  };

  /** CEP primeiro: preenche rua, bairro, cidade e UF; se não achar, abre os campos para digitar. */
  const lookupCep = async (cep: string) => {
    const clean = onlyDigits(cep);
    if (clean.length !== 8) { setCepStatus('idle'); return; }
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data?.erro) throw new Error('cep');
      setForm((prev: any) => ({
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));
      setCepStatus('found');
    } catch {
      setCepStatus('notfound');
      setShowFix(true);
    }
  };

  const openEdit = (addr: any, idx: number) => {
    const l = addr.label || '';
    setEditing({ ...addr, idx });
    setLabelChoice(!l ? '' : LABEL_CHIPS.includes(l) ? l : 'Outro');
    setForm({
      label: LABEL_CHIPS.includes(l) ? '' : l, street: addr.street || '', number: addr.number || '',
      neighborhood: addr.neighborhood || '', city: addr.city || '', state: addr.state || '',
      zip: addr.cep || addr.zip || '', complement: '', latitude: addr.latitude || '', longitude: addr.longitude || '',
      setAsDefault: false,
    });
    setCepStatus('idle');
    setShowFix(false);
    setShowForm(true);
  };

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
      // O servidor não tem campo de complemento: ele segue junto do número.
      payload.number = [form.number, form.complement].filter(Boolean).join(' ');
      delete payload.complement;
      payload.label = labelChoice === 'Outro' ? form.label.trim() : labelChoice;
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
          variant={showForm ? 'tertiary' : 'primary'}
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
            <div className={styles.field}>
              <Input
                label="CEP"
                inputMode="numeric"
                value={form.zip}
                onChange={(v) => { const z = maskCEP(v); setForm({ ...form, zip: z }); lookupCep(z); }}
                hint={cepStatus === 'notfound' ? 'Não achamos esse CEP. Preencha o endereço abaixo.' : undefined}
              />
            </div>
            {cepStatus === 'found' && !showFix && (
              <p className={styles.found}>
                <MapPin size={16} aria-hidden="true" />
                <span>{[form.street, form.neighborhood].filter(Boolean).join(' · ')}</span>
              </p>
            )}
            <div className={styles.grid2}>
              <Input label="Número" value={form.number} onChange={(v) => setForm({ ...form, number: v })} />
              <Input label="Complemento" value={form.complement} onChange={(v) => setForm({ ...form, complement: v })} />
            </div>

            {!showFix && (
              <button type="button" className={styles.fixLink} onClick={() => setShowFix(true)}>Corrigir endereço</button>
            )}
            {showFix && (
              <div className={styles.fixBox}>
                <Input label="Rua" value={form.street} onChange={(v) => setForm({ ...form, street: v })} />
                <div className={styles.grid21}>
                  <Input label="Bairro" value={form.neighborhood} onChange={(v) => setForm({ ...form, neighborhood: v })} />
                  <Input label="UF" value={form.state} onChange={(v) => setForm({ ...form, state: v.toUpperCase() })} />
                </div>
                <Input label="Cidade" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              </div>
            )}

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Rótulo</span>
              <div className={styles.chips}>
                {LABEL_CHIPS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={[styles.chip, labelChoice === l && styles.chipOn].filter(Boolean).join(' ')}
                    aria-pressed={labelChoice === l}
                    onClick={() => setLabelChoice(labelChoice === l ? '' : l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {labelChoice === 'Outro' && (
                <Input label="Nome do endereço" value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
              )}
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

            {error && <div className={styles.formError} role="alert">{error}</div>}

            <div className={styles.formButtons}>
              <Button type="submit" variant="primary">Salvar endereço</Button>
              <Button type="button" variant="tertiary" onClick={() => { resetForm(); setShowForm(false); }}>Cancelar</Button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.list}>
        {addresses.map((addr, idx) => {
          const def = isDefaultAddr(addr, idx);
          return (
            <div key={addr._id || idx} className={styles.row}>
              <span className={styles.ico}><LabelIcon label={addr.label} /></span>
              <span className={styles.tx}>
                <b>{addr.label || 'Endereço'}{def && <span className={styles.default}>Padrão</span>}</b>
                <span>{[`${addr.street}, ${addr.number}`, addr.neighborhood].filter(Boolean).join(' · ')}</span>
              </span>
              <button type="button" className={styles.more} aria-label={`Mais ações para ${addr.label || 'endereço'}`} onClick={() => setMenu({ addr, idx })}>
                <MoreHorizontal size={20} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.addr.label || 'Endereço'} presentation="bottom">
        {menu && (
          <div className={styles.menu}>
            {!isDefaultAddr(menu.addr, menu.idx) && (
              <Button variant="secondary" onClick={() => { const m = menu; setMenu(null); setDefault(m.addr, m.idx); }}>Tornar padrão</Button>
            )}
            <Button variant="secondary" onClick={() => { const m = menu; setMenu(null); openEdit(m.addr, m.idx); }}>Editar</Button>
            <Button variant="danger" onClick={() => { const m = menu; setMenu(null); remove(m.idx); }}>Excluir</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
