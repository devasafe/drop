import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import api from '../lib/api';
import { TrackSection } from '../components/admin/operacao/TrackSection';
import { trackCsv } from '../lib/adminOps';
import { cssViolations } from './helpers/dsTokens';

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

const ride = {
  deliveryId: 'd1', kind: 'entrega', motoboy: { id: 'm1', name: 'Carlos' }, signalLostAt: '2026-10-27T15:10:00.000Z', simulatedCount: 1,
  points: [
    { lat: -23.55, lng: -46.63, accuracy: 8, simulated: false, at: '2026-10-27T15:00:00.000Z' },
    { lat: -23.56, lng: -46.64, accuracy: null, simulated: true, at: '2026-10-27T15:05:00.000Z' },
  ],
};

test('o admin pede o caminho e vê posições, sinal perdido, GPS falso e o link da última posição', async () => {
  get.mockResolvedValue({ data: { rides: [ride] } });
  render(<TrackSection orderId="o1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver caminho' }));
  expect(await screen.findByText('Sinal perdido')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/admin/orders/o1/track');
  expect(screen.getByText('GPS falso')).toBeInTheDocument();
  expect(screen.getByText('Carlos')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Última posição no mapa' })).toHaveAttribute('href', 'https://www.google.com/maps?q=-23.56,-46.64');
  expect(screen.getByRole('button', { name: 'Baixar caminho (CSV)' })).toBeInTheDocument();
});

test('CSV com cabeçalho, uma linha por posição e GPS falso marcado', () => {
  const lines = trackCsv(ride as any).split('\n');
  expect(lines[0]).toBe('horario_utc,latitude,longitude,precisao_m,gps_falso');
  expect(lines[2]).toBe('2026-10-27T15:05:00.000Z,-23.56,-46.64,,sim');
});

test('CSS só com tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'components/admin/operacao/TrackSection.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
