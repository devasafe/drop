import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../map/RouteThumbnail', () => ({ __esModule: true, RouteThumbnail: (p: any) => <div data-testid="mapa" data-height={p.height} />, default: () => null }));
jest.mock('../../../../hooks/useUnreadNotifications', () => ({ useUnreadNotifications: () => 2, default: () => 2 }));
import { readOnlineSince, writeOnlineSince, formatOnlineFor, ONLINE_SINCE_KEY } from '../onlineSince';
import { offerView, offerSummary } from '../offerView';
import { greeting, MotoboyBell, OnlineBadge, PowerButton } from '../CorridasTop';
import { OfferCard } from '../OfferCard';
import { OfferLost } from '../OfferLost';

describe('onlineSince', () => {
  beforeEach(() => localStorage.clear());
  it('grava, lê e apaga; lixo vira null', () => {
    writeOnlineSince(1700000000000);
    expect(localStorage.getItem(ONLINE_SINCE_KEY)).toBe('1700000000000');
    expect(readOnlineSince()).toBe(1700000000000);
    writeOnlineSince(null);
    expect(readOnlineSince()).toBeNull();
    expect(localStorage.getItem(ONLINE_SINCE_KEY)).toBeNull();
    localStorage.setItem(ONLINE_SINCE_KEY, 'abc');
    expect(readOnlineSince()).toBeNull();
  });
  it('localStorage quebrado não derruba', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(readOnlineSince()).toBeNull();
    spy.mockRestore();
  });
  it('escrita com storage quebrado não derruba', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    expect(() => writeOnlineSince(1)).not.toThrow();
    spy.mockRestore();
  });
  it('formato 0h42 / 3h12', () => {
    expect(formatOnlineFor(42 * 60_000)).toBe('0h42');
    expect(formatOnlineFor((3 * 60 + 12) * 60_000)).toBe('3h12');
    expect(formatOnlineFor(-5)).toBe('0h00');
  });
});

const offer = {
  _id: 'd1', orderId: 'ord0000004821', fee: 12, distance: 7,
  storeLatitude: -23.56, storeLongitude: -46.68, customerLatitude: -23.55, customerLongitude: -46.69,
  storeAddress: 'R. dos Pinheiros, 870, Pinheiros, São Paulo', customerAddress: 'R. Harmonia, 412, Vila Madalena, São Paulo',
};

describe('offerView', () => {
  it('valor, trechos e total', () => {
    const v = offerView(offer, { lat: -23.57, lng: -46.68 });
    expect(v.earn).toBeCloseTo(9.6);
    expect(v.code).toBe('004821');
    expect(v.drop.km).toBe(7);
    expect(v.drop.min).toBe(21);
    expect(v.pickup.km).toBeGreaterThan(1);
    expect(v.totalMin).toBeGreaterThan(21);
  });
  it('resumo para a oferta perdida', () => {
    expect(offerSummary(offer)).toBe('R. dos Pinheiros, 870 → Vila Madalena · R$ 9,60');
  });
});

describe('topo', () => {
  it('saudação pela hora do aparelho', () => {
    expect(greeting(new Date('2026-10-14T09:00:00'))).toBe('Bom dia');
    expect(greeting(new Date('2026-10-14T14:00:00'))).toBe('Boa tarde');
    expect(greeting(new Date('2026-10-14T19:00:00'))).toBe('Boa noite');
    expect(greeting(new Date('2026-10-14T03:00:00'))).toBe('Boa noite');
  });
  it('sino com não lidas leva aos avisos do motoboy', () => {
    render(<MotoboyBell />);
    expect(screen.getByRole('link', { name: 'Notificações, 2 não lidas' })).toHaveAttribute('href', '/motoboy/notificacoes');
  });
  it('badge Online · 0h42 e botão de energia', () => {
    const onClick = jest.fn();
    render(<><OnlineBadge since={1_000_000} now={1_000_000 + 42 * 60_000} /><PowerButton onClick={onClick} /></>);
    expect(screen.getByText('Online · 0h42')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ficar offline' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('OfferCard', () => {
  it('disabled de fora também trava o aceite', () => {
    const onAccept = jest.fn();
    render(<OfferCard delivery={offer} self={null} disabled onAccept={onAccept} onSkip={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar por R$ 9,60' }));
    expect(screen.getByRole('button', { name: 'Aceitar por R$ 9,60' })).toBeDisabled();
    expect(onAccept).not.toHaveBeenCalled();
  });
  it('mapa alto, valor para você, dois trechos, Pular e Aceitar por R$ X', () => {
    const onAccept = jest.fn(); const onSkip = jest.fn();
    render(<OfferCard delivery={offer} self={null} showMap onAccept={onAccept} onSkip={onSkip} />);
    expect(screen.getByTestId('mapa')).toHaveAttribute('data-height', '300');
    expect(screen.getByText('Nova corrida')).toBeInTheDocument();
    expect(screen.getByText('R$ 9,60')).toBeInTheDocument();
    expect(screen.getByText('para você')).toBeInTheDocument();
    expect(screen.getByText('Retirada')).toBeInTheDocument();
    expect(screen.getByText('Entrega em Vila Madalena')).toBeInTheDocument();
    expect(screen.queryByText(/expira/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar por R$ 9,60' }));
    expect(onAccept).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(onSkip).toHaveBeenCalled();
  });
  it('em voo: aceitar e pular desabilitados e o clique não dispara', () => {
    const onAccept = jest.fn(); const onSkip = jest.fn();
    render(<OfferCard delivery={offer} self={null} accepting onAccept={onAccept} onSkip={onSkip} />);
    const accept = screen.getByRole('button', { name: 'Aceitar por R$ 9,60' });
    expect(accept).toBeDisabled();
    fireEvent.click(accept);
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(onAccept).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument();
  });
});

describe('OfferLost', () => {
  it.each([
    ['claimed', 'Outro entregador aceitou antes'],
    ['closed', 'Este pedido foi cancelado'],
    ['skipped', 'Você pulou'],
  ])('%s', (variant, title) => {
    render(<OfferLost variant={variant as any} summary="R. X → Centro · R$ 9,60" onContinue={jest.fn()} />);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText('Corrida não está mais disponível')).toBeInTheDocument();
  });
  it('some sozinho em 4 s e no botão', () => {
    jest.useFakeTimers();
    const onContinue = jest.fn();
    render(<OfferLost variant="claimed" summary="x" onContinue={onContinue} />);
    act(() => { jest.advanceTimersByTime(3999); });
    expect(onContinue).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onContinue).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
  it('o botão Continuar procurando chama onContinue na hora', () => {
    const onContinue = jest.fn();
    render(<OfferLost variant="skipped" summary="x" onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar procurando' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'Corridas.module.css'), 'utf8'))).toEqual([]);
});
