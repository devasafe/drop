import { render, screen } from '@testing-library/react';

jest.mock('../../../MotoboyRouteMap', () => ({
  __esModule: true,
  default: (p: { pointA?: unknown; pointB?: unknown; pointC?: unknown }) => (
    <div
      data-testid="map"
      data-hasa={String(!!p.pointA)}
      data-hasb={String(!!p.pointB)}
      data-hasc={String(!!p.pointC)}
    />
  ),
}));

import { MotoboyMap } from '../MotoboyMap';

test('passa a posição do motoboy como pointA', () => {
  render(
    <MotoboyMap
      motoboy={{ lat: -22.9, lng: -43.2 }}
      store={{ lat: -22.91, lng: -43.21 }}
      customer={{ lat: -22.92, lng: -43.22 }}
    />
  );
  expect(screen.getByTestId('map').getAttribute('data-hasa')).toBe('true');
});

test('passa loja e cliente como pointB e pointC', () => {
  render(
    <MotoboyMap
      motoboy={{ lat: -22.9, lng: -43.2 }}
      store={{ lat: -22.91, lng: -43.21 }}
      customer={{ lat: -22.92, lng: -43.22 }}
    />
  );
  const map = screen.getByTestId('map');
  expect(map.getAttribute('data-hasb')).toBe('true');
  expect(map.getAttribute('data-hasc')).toBe('true');
});

test('mostra placeholder "aguardando localização" quando motoboy ausente', () => {
  render(<MotoboyMap store={{ lat: -22.91, lng: -43.21 }} customer={{ lat: -22.92, lng: -43.22 }} />);
  expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  expect(screen.getByText(/aguardando localização/i)).toBeInTheDocument();
});
