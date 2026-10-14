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
  it('leitura atrasada preserva status, horas, compensação e motivo já conhecidos (sem sobrescrever com null)', () => {
    const prev = {
      status: 'picked', assignedAt: '2026-10-14T14:00:00Z', pickedAt: '2026-10-14T14:10:00Z', deliveredAt: null,
      cancelledAt: null, customerAbsentAvailableAt: '2026-10-14T14:40:00Z', cancellationCompensation: null, reason: 'x',
    };
    const late = {
      status: 'assigned', assignedAt: '2026-10-14T14:00:00Z', pickedAt: null, deliveredAt: null, cancelledAt: null,
      customerAbsentAvailableAt: null, cancellationCompensation: null, reason: null, pinRetirada: '48213',
    };
    expect(mergeRide(prev, late)).toEqual({ ...late, status: 'picked', pickedAt: '2026-10-14T14:10:00Z', customerAbsentAvailableAt: '2026-10-14T14:40:00Z', reason: 'x' });
    const cancelled = { status: 'cancelled', cancelledAt: '2026-10-14T14:20:00Z', cancellationCompensation: 2.84, pickedAt: '2026-10-14T14:10:00Z' };
    expect(mergeRide(cancelled, { status: 'picked', cancelledAt: null, cancellationCompensation: null, pickedAt: null }))
      .toEqual(cancelled);
  });
  it('status desconhecido não sobrescreve um conhecido', () => {
    expect(mergeRide({ status: 'picked', pickedAt: 't' }, { status: 'pending', pickedAt: null })).toEqual({ status: 'picked', pickedAt: 't' });
    expect(mergeRide({ status: 'picked' }, { foo: 1 })).toEqual({ foo: 1, status: 'picked' });
    // conhecido depois de desconhecido passa
    expect(mergeRide({ status: 'pending' }, { status: 'assigned' })).toEqual({ status: 'assigned' });
  });
  it('um terminal não é trocado por outro terminal', () => {
    expect(mergeRide({ status: 'delivered', deliveredAt: 't' }, { status: 'cancelled', deliveredAt: null })).toEqual({ status: 'delivered', deliveredAt: 't' });
    expect(mergeRide({ status: 'cancelled', cancellationCompensation: 2 }, { status: 'delivered', cancellationCompensation: null }))
      .toEqual({ status: 'cancelled', cancellationCompensation: 2 });
  });
  it('mesma etapa ou avanço: os campos vêm da leitura nova', () => {
    expect(mergeRide({ status: 'picked', customerAbsentAvailableAt: 'a' }, { status: 'picked', customerAbsentAvailableAt: 'b' }))
      .toEqual({ status: 'picked', customerAbsentAvailableAt: 'b' });
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
    expect(transferStatusLabel('failed')).toEqual({ label: 'Atrasado', tone: 'warn' });
    expect(transferStatusLabel('uncertain')).toEqual({ label: 'Atrasado', tone: 'warn' });
    expect(transferStatusLabel('failed_final')).toEqual({ label: 'Atrasado', tone: 'warn' });
    expect(transferStatusLabel('pending')).toEqual({ label: 'A caminho', tone: 'info' });
    expect(transferStatusLabel('requested')).toEqual({ label: 'A caminho', tone: 'info' });
  });
});
