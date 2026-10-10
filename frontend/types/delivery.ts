// Espelho do DeliveryQuote do backend (src/services/deliveryQuote/quote.ts).
export type DeliveryQuoteReason = 'OUT_OF_AREA' | 'STORE_NO_LOCATION' | 'NO_ADDRESS' | 'ROUTE_FAILED';

export interface DeliveryQuote {
  storeId: string;
  inArea: boolean | null;
  reason?: DeliveryQuoteReason;
  distanceKm: number | null;
  etaMinutes: [number, number] | null;
  fee: number | null;
  freeDelivery: boolean;
  open: boolean;
  opensAt?: string;
  source: 'estimate' | 'route';
}

export interface GeoPoint {
  lat: number;
  lng: number;
}
