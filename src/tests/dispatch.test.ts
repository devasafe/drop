import {
  radiusForAgeKm,
  isDeliveryWithinRadius,
  DISPATCH_BASE_KM,
  DISPATCH_MAX_KM,
} from '../services/dispatch';

describe('despacho por raio crescente', () => {
  it('raio começa no base e cresce em degraus até virar ilimitado', () => {
    expect(radiusForAgeKm(0)).toBe(DISPATCH_BASE_KM); // recém-criada: raio mínimo
    expect(radiusForAgeKm(20_000)).toBeGreaterThan(DISPATCH_BASE_KM); // após 1 degrau
    expect(radiusForAgeKm(40_000)).toBeGreaterThan(radiusForAgeKm(20_000));
    // muito antiga → passa do teto → visível para todos (Infinity)
    expect(radiusForAgeKm(10 * 60_000)).toBe(Infinity);
  });

  it('entrega perto aparece logo; longe só quando o raio expande', () => {
    const motoboy = { lat: -22.8894, lng: -42.0286 }; // Cabo Frio
    const lojaPerto = { storeLatitude: -22.8900, storeLongitude: -42.0290, createdAt: new Date() }; // ~0,1 km
    const lojaLonge = { storeLatitude: -23.5505, storeLongitude: -46.6333, createdAt: new Date() }; // São Paulo ~250 km

    const now = Date.now();
    expect(isDeliveryWithinRadius(lojaPerto, motoboy, now)).toBe(true);
    expect(isDeliveryWithinRadius(lojaLonge, motoboy, now)).toBe(false); // recém-criada: fora do raio

    // a mesma loja distante fica visível depois que o raio passa do teto
    const velha = { ...lojaLonge, createdAt: new Date(now - 10 * 60_000) };
    expect(isDeliveryWithinRadius(velha, motoboy, now)).toBe(true);
  });

  it('sem coordenadas da loja OU sem GPS do motoboy, não filtra (mostra)', () => {
    const now = Date.now();
    expect(isDeliveryWithinRadius({ createdAt: new Date() }, { lat: 0, lng: 0 }, now)).toBe(true);
    expect(isDeliveryWithinRadius({ storeLatitude: -23.5, storeLongitude: -46.6, createdAt: new Date() }, null, now)).toBe(true);
  });

  it('o teto configurado é positivo', () => {
    expect(DISPATCH_MAX_KM).toBeGreaterThan(0);
  });
});
