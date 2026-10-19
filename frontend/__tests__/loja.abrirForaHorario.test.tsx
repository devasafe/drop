import { render, screen } from '@testing-library/react';
import { StoreCard } from '../components/drop/StoreCard';
import { mapStore } from '../lib/mapStore';

// Quarta 21/10/2026, 07:00 em São Paulo; a loja abre 10:00–18:00 e o lojista abriu até a abertura.
const hours = { wednesday: { open: '10:00', close: '18:00', closed: false } };

describe('vitrine: aberta fora do horário até a abertura de hoje', () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-21T07:00:00-03:00')); });
  afterEach(() => { jest.useRealTimers(); });

  it('StoreCard: "fecha às 18:00" (fica aberta direto), nunca às 10:00', () => {
    const card = mapStore({ name: 'Loja', isOpen: true, operatingHours: hours, openOverrideUntil: '2026-10-21T10:00:00-03:00' });
    expect(card.status).toBe('aberta');
    render(<StoreCard variant="resultado" store={card} onClick={jest.fn()} />);
    expect(screen.getByText(/fecha às 18:00/)).toBeInTheDocument();
    expect(screen.queryByText(/fecha às 10:00/)).toBeNull();
  });

  it('StoreCard: override até 23:59 depois de fechar mostra "fecha às 23:59"', () => {
    jest.setSystemTime(new Date('2026-10-21T20:00:00-03:00'));
    const card = mapStore({ name: 'Loja', isOpen: true, operatingHours: hours, openOverrideUntil: '2026-10-21T23:59:59-03:00' });
    render(<StoreCard variant="resultado" store={card} onClick={jest.fn()} />);
    expect(screen.getByText(/fecha às 23:59/)).toBeInTheDocument();
  });
});
