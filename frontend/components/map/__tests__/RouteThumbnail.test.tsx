import { render } from '@testing-library/react';
import { RouteThumbnail } from '../RouteThumbnail';

// Sem chave → força o caminho do croqui SVG (fallback), determinístico no teste.
jest.mock('../../../lib/mapConfig', () => ({ MAPTILER_KEY: '' }));

const store = { lat: -22.9, lng: -43.2 };
const customer = { lat: -22.88, lng: -43.18 };

test('sem chave, cai no croqui SVG com a linha e os 2 pins', () => {
  const { container } = render(<RouteThumbnail store={store} customer={customer} />);
  expect(container.querySelector('svg')).toBeInTheDocument();
  expect(container.querySelector('path')).toBeInTheDocument();
  expect(container.querySelectorAll('circle')).toHaveLength(2);
});

test('inclui o 3º pin quando há motoboy', () => {
  const { container } = render(
    <RouteThumbnail store={store} customer={customer} motoboy={{ lat: -22.91, lng: -43.21 }} />,
  );
  expect(container.querySelectorAll('circle')).toHaveLength(3);
});

test('sem coordenadas, não renderiza nada', () => {
  const { container } = render(<RouteThumbnail />);
  expect(container.firstChild).toBeNull();
});
