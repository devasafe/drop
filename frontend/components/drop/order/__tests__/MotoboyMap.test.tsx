import { render, screen } from '@testing-library/react';

const receivedProps: { pointA?: unknown; pointB?: unknown; pointC?: unknown }[] = [];

jest.mock('../../../MotoboyRouteMap', () => ({
  __esModule: true,
  default: (p: { pointA?: unknown; pointB?: unknown; pointC?: unknown }) => {
    receivedProps.push(p);
    return (
      <div
        data-testid="map"
        data-hasa={String(!!p.pointA)}
        data-hasb={String(!!p.pointB)}
        data-hasc={String(!!p.pointC)}
      />
    );
  },
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

test('mantém a identidade de pointA/B/C entre renders quando as coordenadas não mudam', () => {
  receivedProps.length = 0;
  const props = {
    motoboy: { lat: -22.9, lng: -43.2 },
    store: { lat: -22.91, lng: -43.21 },
    customer: { lat: -22.92, lng: -43.22 },
  };
  const { rerender } = render(<MotoboyMap {...props} />);
  // Novos objetos literais a cada render (como o `useOrderTracking` faz a
  // cada poll de 5s) — só as coordenadas numéricas se repetem.
  rerender(
    <MotoboyMap
      motoboy={{ lat: -22.9, lng: -43.2 }}
      store={{ lat: -22.91, lng: -43.21 }}
      customer={{ lat: -22.92, lng: -43.22 }}
    />
  );

  expect(receivedProps).toHaveLength(2);
  expect(receivedProps[1].pointA).toBe(receivedProps[0].pointA);
  expect(receivedProps[1].pointB).toBe(receivedProps[0].pointB);
  expect(receivedProps[1].pointC).toBe(receivedProps[0].pointC);
});
