import {
  rideStage, mergeRide, minutesSince, msSince, absentRemainingMs, mapsUrl, telHref, rideCode, itemsLine,
  storePoint, customerPoint, transferStatusLabel, PICKUP_LATE_MIN,
} from '../rideView';

describe('rideStage', () => {
  it('status do servidor vira a etapa da tela', () => {
    expect(rideStage({ status: 'assigned' })).toBe('retirar');
    expect(rideStage({ status: 'picked' })).toBe('entregar');
    expect(rideStage({ status: 'delivered' })).toBe('concluida');
    expect(rideStage({ status: 'cancelled' })).toBe('cancelada');
    expect(rideStage({ status: 'pending' })).toBe('outra');
    expect(rideStage(null)).toBe('outra');
  });
  it('devolução pendente com código vence o status (picked após reject, cancelled após cliente ausente)', () => {
    expect(rideStage({ status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '631500' })).toBe('devolver');
    expect(rideStage({ status: 'cancelled', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '631500' })).toBe('devolver');
    expect(rideStage({ status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: null })).toBe('entregar');
    expect(rideStage({ status: 'cancelled', statusDevolucao: 'confirmado', pinDevolucao: '1' })).toBe('cancelada');
  });
});

describe('mergeRide', () => {
  it('leitura atrasada não volta de picked para assigned', () => {
    expect(mergeRide({ status: 'picked' }, { status: 'assigned', pinRetirada: '48213' })).toEqual({ status: 'picked', pinRetirada: '48213' });
  });
  it('avanço normal e estados finais passam', () => {
    expect(mergeRide({ status: 'assigned' }, { status: 'picked' })).toEqual({ status: 'picked' });
    expect(mergeRide({ status: 'picked' }, { status: 'cancelled' })).toEqual({ status: 'cancelled' });
    expect(mergeRide(null, { status: 'assigned' })).toEqual({ status: 'assigned' });
  });
});

describe('tempos', () => {
  const now = new Date('2026-10-14T14:30:00Z').getTime();
  it('minutos e ms desde um ISO; null sem data', () => {
    expect(minutesSince('2026-10-14T14:18:00Z', now)).toBe(12);
    expect(msSince('2026-10-14T14:29:00Z', now)).toBe(60_000);
    expect(minutesSince(null, now)).toBeNull();
    expect(minutesSince('lixo', now)).toBeNull();
    expect(PICKUP_LATE_MIN).toBe(10);
  });
  it('espera do cliente ausente: restante nunca negativo; null sem a hora do servidor', () => {
    expect(absentRemainingMs('2026-10-14T14:35:12Z', now)).toBe(312_000);
    expect(absentRemainingMs('2026-10-14T14:00:00Z', now)).toBe(0);
    expect(absentRemainingMs(null, now)).toBeNull();
  });
});

describe('links e textos', () => {
  it('mapa externo e telefone', () => {
    expect(mapsUrl({ lat: -23.5, lng: -46.6 })).toBe('https://www.google.com/maps/dir/?api=1&destination=-23.5,-46.6&travelmode=driving');
    expect(mapsUrl(null)).toBeNull();
    expect(telHref('(11) 98888-7777')).toBe('tel:11988887777');
    expect(telHref('-')).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });
  it('código curto do pedido e resumo dos itens', () => {
    expect(rideCode({ orderId: 'ord0000004821', _id: 'd1' })).toBe('004821');
    expect(itemsLine({ products: [{ productName: 'Fone', quantity: 1 }, { productName: 'Cabo USB-C', quantity: 1 }] })).toBe('2 itens (Fone e Cabo USB-C)');
    expect(itemsLine({ products: [{ productName: 'Fone', quantity: 3 }] })).toBe('3 itens (Fone)');
    expect(itemsLine({ products: [{ productName: 'Fone', quantity: 1 }] })).toBe('1 item (Fone)');
    expect(itemsLine({})).toBe('');
  });
  it('pontos da loja e do cliente vêm do payload do GET /deliveries/:id', () => {
    expect(storePoint({ storeLatitude: -23.5, storeLongitude: -46.6 })).toEqual({ lat: -23.5, lng: -46.6 });
    expect(storePoint({ storeObj: { latitude: '-23.1', longitude: '-46.2' } })).toEqual({ lat: -23.1, lng: -46.2 });
    expect(customerPoint({ deliveryLat: -23.4, deliveryLng: -46.5 })).toEqual({ lat: -23.4, lng: -46.5 });
    expect(customerPoint({})).toBeNull();
  });
  it('status do Pix do modo direto (MotoboyTransfer)', () => {
    expect(transferStatusLabel('done')).toEqual({ label: 'Na conta', tone: 'ok' });
    expect(transferStatusLabel('failed')).toEqual({ label: 'Atrasado · a loja vai tentar de novo', tone: 'warn' });
    expect(transferStatusLabel('uncertain')).toEqual({ label: 'Em conferência pela DROP', tone: 'warn' });
    expect(transferStatusLabel('failed_final')).toEqual({ label: 'Com a DROP', tone: 'err' });
    expect(transferStatusLabel('pending')).toEqual({ label: 'Enviando', tone: 'info' });
    expect(transferStatusLabel('requested')).toEqual({ label: 'Enviando', tone: 'info' });
  });
});
