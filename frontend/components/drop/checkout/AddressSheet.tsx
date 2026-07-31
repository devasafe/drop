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

// Tipos mínimos do SDK do Google Maps que de fato usamos aqui — o pacote não
// tem @types instalado (carregado via script global, ver _document.tsx), então
// modelamos localmente só a superfície usada, mesmo padrão de `GeocoderResult`
// em `useCheckoutAddress.ts`. `getGoogleMaps` é o ÚNICO ponto que toca
// `window as any` — o resto do arquivo trabalha com esses tipos.
interface LatLngLike {
  lat(): number;
  lng(): number;
}

interface GeocoderAddressComponent {
  types: string[];
  long_name: string;
  short_name: string;
}

interface GeocoderResult {
  address_components: GeocoderAddressComponent[];
}

interface MapsGeocoder {
  geocode(
    request: { location: { lat: number; lng: number } },
    callback: (results: GeocoderResult[] | null, status: string) => void
  ): void;
}

interface MapsMap {
  setCenter(pos: { lat: number; lng: number }): void;
}

interface MapsMarker {
  setMap(map: MapsMap | null): void;
  setPosition(pos: { lat: number; lng: number }): void;
  addListener(event: 'dragend', handler: (e: { latLng: LatLngLike }) => void): void;
}

interface GoogleMapsSdk {
  Map: new (el: HTMLElement, opts: { center: { lat: number; lng: number }; zoom: number }) => MapsMap;
  Marker: new (opts: { position: { lat: number; lng: number }; map: MapsMap; draggable: boolean }) => MapsMarker;
  Geocoder: new () => MapsGeocoder;
  event?: { clearInstanceListeners: (instance: MapsMap | MapsMarker) => void };
}

function getGoogleMaps(): GoogleMapsSdk | undefined {
  return (window as any).google?.maps;
}

/**
 * Sheet de endereço de entrega: form (CEP + campos) + mapa Google (marcador
 * arrastável). Porta a inicialização de mapa de `pages/checkout.tsx:328-412`.
 * O SDK carrega async (`_document.tsx`), então a inicialização faz até 2
 * retentativas leves (~150ms) antes de desistir; se ainda assim indisponível
 * (ou em teste, onde `window.google` não existe), o mapa fica vazio e o form
 * segue 100% utilizável manualmente. No cleanup (fechar o sheet ou desmontar),
 * libera listeners do marker/map via `google.maps.event.clearInstanceListeners`
 * e desassocia o marker do mapa (`setMap(null)`) — evita leak quando o sheet é
 * reaberto várias vezes na mesma sessão.
 */
export function AddressSheet({ open, onClose, fields, onField, onCepBlur, onSave }: AddressSheetProps) {
  const cepId = useId();
  const streetId = useId();
  const numberId = useId();
  const complementId = useId();
  const neighborhoodId = useId();
  const cityId = useId();
  const stateId = useId();

  const mapRef = useRef<MapsMap | null>(null);
  const markerRef = useRef<MapsMarker | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 150;

    const initMap = (g: GoogleMapsSdk) => {
      const gmapEl = document.getElementById('gmap-address');
      if (!gmapEl || mapRef.current) return;

      const lat = fields.latitude ? parseFloat(fields.latitude) : -23.55052;
      const lng = fields.longitude ? parseFloat(fields.longitude) : -46.633308;

      try {
        mapRef.current = new g.Map(gmapEl, { center: { lat, lng }, zoom: 16 });
        markerRef.current = new g.Marker({
          position: { lat, lng },
          map: mapRef.current,
          draggable: true,
        });
        markerRef.current.addListener('dragend', (e) => {
          const newLat = e.latLng.lat();
          const newLng = e.latLng.lng();
          onField('latitude', String(newLat));
          onField('longitude', String(newLng));

          const geocoder = new g.Geocoder();
          geocoder.geocode({ location: { lat: newLat, lng: newLng } }, (results, status) => {
            if (status !== 'OK' || !results?.[0]) return;
            let street = '', number = '', neighborhood = '', city = '', state = '', cep = '';
            results[0].address_components.forEach((comp) => {
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
    };

    // SDK carrega async (ver _document.tsx) — pode ainda não estar pronto no
    // primeiro check. Tenta de novo com um delay curto antes de desistir.
    const attemptInit = (attempt: number) => {
      if (cancelled) return;
      const g = getGoogleMaps();
      if (g) {
        initMap(g);
        return;
      }
      if (attempt < MAX_RETRIES) {
        retryTimer = setTimeout(() => attemptInit(attempt + 1), RETRY_DELAY_MS);
      }
    };

    attemptInit(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);

      // Libera listeners e desassocia o marker do mapa — sem isso, cada
      // reabertura do sheet criaria Map/Marker novos sem soltar os anteriores.
      const g = getGoogleMaps();
      if (markerRef.current) {
        markerRef.current.setMap(null);
        g?.event?.clearInstanceListeners(markerRef.current);
      }
      if (mapRef.current) {
        g?.event?.clearInstanceListeners(mapRef.current);
      }
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
