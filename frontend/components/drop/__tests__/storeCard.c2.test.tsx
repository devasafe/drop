import { render, screen } from '@testing-library/react';
import { StoreCard } from '../StoreCard';

const base = { name: 'Eletro Center', status: 'aberta' as const, category: 'Pinheiros' };

it('linha do protótipo: nota e horário embaixo do nome; prazo sobre o frete à direita; sem pill', () => {
  render(<StoreCard variant="resultado" onClick={() => {}} store={{ ...base, rating: { average: 4.8, count: 214 }, closesAt: '20:00', etaMin: [25, 35], fee: 6.2 }} />);
  expect(screen.getByText('★ 4,8 (214) · fecha às 20:00')).toBeInTheDocument();
  expect(screen.getByText('25–35 min')).toBeInTheDocument();
  expect(screen.getByText('R$ 6,20')).toBeInTheDocument();
  expect(screen.queryByText('Aberta')).toBeNull();
});

it('vitrine (Plano 1): diz que a entrega é combinada', () => {
  render(<StoreCard variant="resultado" onClick={() => {}} store={{ ...base, vitrine: true, distanceKm: 4.1 }} />);
  expect(screen.getByText('Vitrine · você combina a entrega')).toBeInTheDocument();
  expect(screen.getByText('4,1 km')).toBeInTheDocument();
});

it('fechada: diz quando abre, sem prazo', () => {
  render(<StoreCard variant="resultado" onClick={() => {}} store={{ ...base, status: 'fechada', opensAt: '09:00', etaMin: [25, 35] }} />);
  expect(screen.getByText('Loja fechada · abre às 09:00')).toBeInTheDocument();
  expect(screen.queryByText(/min/)).toBeNull();
});
