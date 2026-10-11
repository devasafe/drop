import { useRef, useState } from 'react';
import Router from 'next/router';
import { buscarHref } from '../../lib/routes';
import api from '../../lib/api';
import { AddressBar } from './AddressBar';
import { AddressPickerSheet } from './AddressPickerSheet';
import { AddressSheet } from './checkout/AddressSheet';
import { Skeleton } from '../ui/Skeleton';
import styles from './DeliveryAddressControl.module.css';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useAddressForm } from '../../hooks/useAddressForm';
import { addressId, type DeliveryAddressState } from '../../hooks/useDeliveryAddress';
import type { useAddressPicker } from '../../hooks/useAddressPicker';

export interface DeliveryAddressControlProps {
  address: DeliveryAddressState; picker: ReturnType<typeof useAddressPicker>; storeId?: string | null; storeName?: string;
  /** 'link': só um "Trocar" (blocos de entrega da Loja e do Produto); 'bar' (padrão): a barra "Entregar em X". */
  trigger?: 'bar' | 'link';
}

/** "Entregar em X" no topo das telas de compra + seletor de baixo + formulário de endereço novo. */
export function DeliveryAddressControl({ address, picker, storeId, storeName, trigger = 'bar' }: DeliveryAddressControlProps) {
  const { user } = useAuth() || ({} as any);
  const { showToast } = useToast();
  const form = useAddressForm();
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  if (user && address.loading) return <Skeleton width={200} height={20} />;
  const bar = !user
    ? { label: 'Entrar para', address: 'escolher onde entregar' }
    : address.selected ? { label: 'Entregar em', address: address.label } : { label: 'Informe', address: 'onde entregar' };

  return (
    <>
      {trigger === 'link'
        ? <button type="button" className={styles.change} aria-label="Trocar endereço de entrega" onClick={picker.request}>Trocar</button>
        : <AddressBar label={bar.label} address={bar.address} onClick={picker.request} />}
      <AddressPickerSheet
        open={picker.open}
        onClose={() => picker.setOpen(false)}
        addresses={address.addresses}
        selectedId={address.selectedId}
        storeId={storeId}
        storeName={storeName}
        onPick={(a) => { address.select(addressId(a)); picker.setOpen(false); }}
        onAddNew={() => { picker.setOpen(false); form.reset(); setFormOpen(true); }}
        onSeeStores={() => { picker.setOpen(false); Router.push(buscarHref({ tab: 'lojas' })); }}
      />
      <AddressSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        fields={form.fields}
        onField={form.setField}
        onCepBlur={() => form.lookupCep(form.fields.cep)}
        saving={saving}
        onSave={async () => {
          if (savingRef.current) return;
          savingRef.current = true;
          setSaving(true);
          try {
            const res = await api.post('/user/addresses', form.fields);
            address.addAddress(res.data);
            setFormOpen(false);
          } catch {
            showToast('Não conseguimos salvar o endereço. Confira o CEP e o número e tente de novo.', 'error');
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        }}
      />
    </>
  );
}
