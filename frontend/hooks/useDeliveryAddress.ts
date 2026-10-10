import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAddresses } from './useSync';
import { parseCoords } from '../lib/geo';
import type { GeoPoint } from '../types/delivery';

export const DELIVERY_ADDRESS_KEY = 'drop:deliveryAddressId';
const CHANGE_EVENT = 'drop:delivery-address';

export interface SavedAddress {
  _id?: string; id?: string; label?: string; street?: string; number?: string; complement?: string;
  neighborhood?: string; city?: string; state?: string; cep?: string;
  latitude?: string | number; longitude?: string | number; isDefault?: boolean;
}

export const addressId = (a: SavedAddress): string => String(a?._id ?? a?.id ?? '');
export const shortAddress = (a: SavedAddress | null | undefined): string => (a ? [a.street, a.number].filter(Boolean).join(', ') : '');

export function readDeliveryAddressId(): string | null {
  try { return localStorage.getItem(DELIVERY_ADDRESS_KEY); } catch { return null; }
}
export function saveDeliveryAddressId(id: string): void {
  try { localStorage.setItem(DELIVERY_ADDRESS_KEY, id); } catch { /* modo privado: vale só nesta tela */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
}

export interface DeliveryAddressState {
  addresses: SavedAddress[]; loading: boolean; selected: SavedAddress | null; selectedId: string | null;
  point: GeoPoint | null; label: string; select: (id: string) => void; addAddress: (a: SavedAddress) => void;
}

/** Endereço de entrega do app inteiro (spec §7.1 "Entregar em"): escolhido > padrão > primeiro. */
export function useDeliveryAddress(): DeliveryAddressState {
  const { addresses, loading, setAddresses } = useAddresses();
  const [chosenId, setChosenId] = useState<string | null>(null);

  useEffect(() => {
    setChosenId(readDeliveryAddressId());
    const onEvent = (e: Event) => setChosenId((e as CustomEvent<string>).detail ?? readDeliveryAddressId());
    const onStorage = (e: StorageEvent) => { if (e.key === DELIVERY_ADDRESS_KEY) setChosenId(e.newValue); };
    window.addEventListener(CHANGE_EVENT, onEvent);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(CHANGE_EVENT, onEvent); window.removeEventListener('storage', onStorage); };
  }, []);

  const list = (addresses || []) as SavedAddress[];
  const selected = useMemo(
    () => list.find((a) => addressId(a) === chosenId) ?? list.find((a) => a.isDefault) ?? list[0] ?? null,
    [list, chosenId],
  );
  const point = useMemo(() => (selected ? parseCoords(selected.latitude, selected.longitude) : null), [selected]);
  const select = useCallback((id: string) => { saveDeliveryAddressId(id); setChosenId(id); }, []);
  const addAddress = useCallback((a: SavedAddress) => {
    setAddresses((prev: SavedAddress[]) => [...prev, a]);
    if (addressId(a)) select(addressId(a));
  }, [setAddresses, select]);

  return { addresses: list, loading, selected, selectedId: selected ? addressId(selected) : null, point, label: shortAddress(selected), select, addAddress };
}
