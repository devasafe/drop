import { useState } from 'react';
import api from '../lib/api';
import { useAddresses } from './useSync';
import { useAddressForm } from './useAddressForm';
import { Address } from '../types/checkout';

export function useCheckoutAddress() {
  const { addresses, loading, setAddresses } = useAddresses();
  const [selected, setSelected] = useState<Address | null>(null);
  const form = useAddressForm();

  const selectAddress = (idx: number) => {
    const a = addresses[idx];
    if (!a) return;
    setSelected(a as Address);
  };

  const saveAddress = async (addr: Address) => {
    const res = await api.post<Address>('/user/addresses', addr);
    setAddresses((prev: any[]) => [...prev, res.data]);
    setSelected(res.data);
    return res.data;
  };

  return {
    addresses, loading, selected, selectAddress, saveAddress,
    lookupCep: form.lookupCep, fields: form.fields, setField: form.setField, setFields: form.setFields,
  };
}
