import { useEffect, useId, useRef } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import type { Address } from '../../../types/checkout';
import styles from './AddressSheet.module.css';

export interface AddressSheetProps {
  open: boolean;
  onClose: () => void;
  fields: Address;
  onField: (key: keyof Address, value: string) => void;
  onCepBlur: () => void;
  onSave: () => void;
}

// Campos que precisam estar preenchidos pra habilitar "Salvar endereço".
// Lat/long ficam de fora de propósito: são preenchidas automaticamente
// (CEP -> geocode em useCheckoutAddress, ou arrastando o marcador) e o
// usuário pode querer salvar o endereço textual antes do pin assentar.
const REQUIRED_KEYS: (keyof Address)[] = ['cep', 'street', 'number', 'neighborhood', 'city', 'state'];

/**
 * Sheet de endereço de entrega: form (CEP + campos) + mapa Google (marcador
 * arrastável). Porta a inicialização de mapa de `pages/checkout.tsx:328-412`,
 * mas defensiva num único `if (g?.maps)` — sem polling: o SDK é carregado
 * global em `_document.tsx` e já deve estar pronto quando o usuário abre o
 * sheet; se não estiver (ou em teste, onde `window.google` não existe), o
 * mapa fica vazio e o form segue 100% utilizável manualmente.
 */
export function AddressSheet({ open, onClose, fields, onField, onCepBlur, onSave }: AddressSheetProps) {
  const cepId = useId();
  const streetId = useId();
  const numberId = useId();
  const complementId = useId();
  const neighborhoodId = useId();
  const cityId = useId();
  const stateId = useId();

  // Tipos do SDK do Google Maps não estão instalados no projeto (carregado via
  // script global, sem @types) — mesmo padrão de `useRef<any>` já usado em
  // `pages/checkout.tsx` para os refs de mapa/marcador.
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const gmapEl = document.getElementById('gmap-address');
    if (!gmapEl || mapRef.current) return;

    const lat = fields.latitude ? parseFloat(fields.latitude) : -23.55052;
    const lng = fields.longitude ? parseFloat(fields.longitude) : -46.633308;

    try {
      mapRef.current = new g.maps.Map(gmapEl, { center: { lat, lng }, zoom: 16 });
      markerRef.current = new g.maps.Marker({
        position: { lat, lng },
        map: mapRef.current,
        draggable: true,
      });
      markerRef.current.addListener('dragend', (e: any) => {
        const newLat = e.latLng.lat();
        const newLng = e.latLng.lng();
        onField('latitude', String(newLat));
        onField('longitude', String(newLng));

        const geocoder = new g.maps.Geocoder();
        geocoder.geocode({ location: { lat: newLat, lng: newLng } }, (results: any, status: string) => {
          if (status !== 'OK' || !results?.[0]) return;
          let street = '', number = '', neighborhood = '', city = '', state = '', cep = '';
          results[0].address_components.forEach((comp: any) => {
            if (comp.types.includes('route')) street = comp.long_name;
            if (comp.types.includes('street_number')) number = comp.long_name;
            if (comp.types.includes('sublocality')) neighborhood = comp.long_name;
            if (comp.types.includes('administrative_area_level_2')) city = comp.long_name;
            if (comp.types.includes('administrative_area_level_1')) state = comp.short_name;
            if (comp.types.includes('postal_code')) cep = comp.long_name;
          });
          onField('street', street);
          onField('number', number);
          onField('neighborhood', neighborhood);
          onField('city', city);
          onField('state', state);
          onField('cep', cep);
        });
      });
    } catch {
      // Erro de inicialização do SDK — mapa fica indisponível, form segue manual.
    }

    return () => {
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Recentraliza mapa/marcador quando lat/long mudam por fonte externa
  // (ex.: geocode automático após lookup de CEP em useCheckoutAddress).
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (!fields.latitude || !fields.longitude) return;
    const lat = parseFloat(fields.latitude);
    const lng = parseFloat(fields.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    mapRef.current.setCenter({ lat, lng });
    markerRef.current.setPosition({ lat, lng });
  }, [fields.latitude, fields.longitude]);

  const missingRequired = REQUIRED_KEYS.some((key) => !String(fields[key] ?? '').trim());

  return (
    <Sheet open={open} onClose={onClose} title="Endereço de entrega">
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor={cepId} className={styles.label}>CEP</label>
          <Input
            id={cepId}
            value={fields.cep}
            onChange={(v) => onField('cep', v)}
            onBlur={onCepBlur}
            placeholder="00000-000"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor={streetId} className={styles.label}>Rua</label>
          <Input id={streetId} value={fields.street} onChange={(v) => onField('street', v)} placeholder="Rua" />
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor={numberId} className={styles.label}>Número</label>
            <Input id={numberId} value={fields.number} onChange={(v) => onField('number', v)} placeholder="Número" />
          </div>
          <div className={styles.field}>
            <label htmlFor={complementId} className={styles.label}>Complemento</label>
            <Input
              id={complementId}
              value={fields.complement || ''}
              onChange={(v) => onField('complement', v)}
              placeholder="Complemento"
            />
          </div>
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor={neighborhoodId} className={styles.label}>Bairro</label>
            <Input
              id={neighborhoodId}
              value={fields.neighborhood}
              onChange={(v) => onField('neighborhood', v)}
              placeholder="Bairro"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={cityId} className={styles.label}>Cidade</label>
            <Input id={cityId} value={fields.city} onChange={(v) => onField('city', v)} placeholder="Cidade" />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor={stateId} className={styles.label}>Estado</label>
          <Input
            id={stateId}
            value={fields.state}
            onChange={(v) => onField('state', v.toUpperCase())}
            placeholder="UF"
            maxLength={2}
          />
        </div>

        <div id="gmap-address" className={styles.map} />
        <p className={styles.mapHint}>Arraste o marcador para ajustar a localização.</p>

        <Button onClick={onSave} disabled={missingRequired} className={styles.save}>
          Salvar endereço
        </Button>
      </div>
    </Sheet>
  );
}
