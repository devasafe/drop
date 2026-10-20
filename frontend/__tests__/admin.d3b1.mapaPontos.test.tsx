/**
 * D3b-1 · P3.6 — pontos do Mapa ao vivo (OpsMarkersLayer): um marcador DOM do MapLibre por motoboy, com a cor e o
 * texto do estado; pino da loja aguardando; tocar no ponto chama onSelect; posição nova move sem recriar; quem
 * saiu some; o nome entra como texto (nunca HTML); os pontos são enquadrados uma vez só.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DropMapContext } from '../components/map/DropMapContext';
import { OpsMarkersLayer, type OpsMapPoint } from '../components/admin/mapa/OpsMarkersLayer';

type FakeMarker = {
  element: HTMLElement; lngLat: [number, number] | null;
  setLngLat: jest.Mock; addTo: jest.Mock; remove: jest.Mock;
};
const mockMarkers: FakeMarker[] = [];
jest.mock('maplibre-gl', () => ({
  Marker: jest.fn().mockImplementation(({ element }: { element: HTMLElement }) => {
    // O Marker real põe esta classe no elemento (position:absolute); o código da camada não pode apagá-la.
    element.classList.add('maplibregl-marker');
    const m: FakeMarker = {
      element,
      lngLat: null,
      setLngLat: jest.fn((ll: [number, number]) => { m.lngLat = ll; return m; }),
      addTo: jest.fn(() => m),
      remove: jest.fn(),
    };
    mockMarkers.push(m);
    return m;
  }),
}));

const fakeMap = { fitBounds: jest.fn() };
const withMap = (ui: ReactNode) => <DropMapContext.Provider value={fakeMap as never}>{ui}</DropMapContext.Provider>;
const P = (id: string, state: OpsMapPoint['state'], extra: Partial<OpsMapPoint> = {}): OpsMapPoint =>
  ({ id, name: `Moto ${id}`, lat: -23.5, lng: -46.6, state, detail: null, ...extra });

beforeEach(() => {
  mockMarkers.length = 0;
  jest.clearAllMocks();
});

it('um ponto por motoboy, com a cor e o texto do estado', () => {
  render(withMap(
    <OpsMarkersLayer
      motoboys={[P('m1', 'free'), P('m2', 'delivering', { detail: '#d4e5f6 · levando ao cliente' }), P('m3', 'stale')]}
      stores={[]}
      onSelect={jest.fn()}
    />,
  ));
  const els = mockMarkers.map((m) => m.element);
  expect(els.map((e) => e.dataset.state)).toEqual(['free', 'delivering', 'stale']);
  expect(els[0]).toHaveClass('point', 'free');
  expect(els[1]).toHaveClass('point', 'delivering');
  expect(els[2]).toHaveClass('point', 'stale');
  expect(els[0]).toHaveAttribute('aria-label', 'Moto m1 · Livre');
  expect(els[1]).toHaveAttribute('aria-label', 'Moto m2 · Em entrega · #d4e5f6 · levando ao cliente');
  expect(els[2]).toHaveAttribute('aria-label', 'Moto m3 · Sem sinal');
  expect(mockMarkers[0].lngLat).toEqual([-46.6, -23.5]);
});

it('pino da loja com pedido aguardando motoboy', () => {
  render(withMap(<OpsMarkersLayer motoboys={[]} stores={[{ id: 'o1', name: 'Sabor da Vila', lat: -23.54, lng: -46.62 }]} onSelect={jest.fn()} />));
  expect(mockMarkers).toHaveLength(1);
  expect(mockMarkers[0].element).toHaveClass('store');
  expect(mockMarkers[0].element).toHaveAttribute('aria-label', 'Sabor da Vila · aguardando motoboy');
  expect(mockMarkers[0].element).toHaveTextContent('Sabor da Vila');
});

it('tocar no ponto chama onSelect com o id', () => {
  const onSelect = jest.fn();
  render(withMap(<OpsMarkersLayer motoboys={[P('m1', 'free'), P('m2', 'delivering')]} stores={[]} onSelect={onSelect} />));
  mockMarkers[1].element.click();
  expect(onSelect).toHaveBeenCalledWith('m2');
});

it('posição nova move sem recriar; estado novo repinta; quem saiu é removido', () => {
  const { rerender } = render(withMap(
    <OpsMarkersLayer motoboys={[P('m1', 'free'), P('m2', 'free')]} stores={[]} onSelect={jest.fn()} />,
  ));
  expect(mockMarkers).toHaveLength(2);
  rerender(withMap(
    <OpsMarkersLayer motoboys={[P('m1', 'stale', { lat: -23.6, lng: -46.7 })]} stores={[]} onSelect={jest.fn()} />,
  ));
  expect(mockMarkers).toHaveLength(2);
  expect(mockMarkers[0].lngLat).toEqual([-46.7, -23.6]);
  expect(mockMarkers[0].element).toHaveClass('stale');
  expect(mockMarkers[0].element).not.toHaveClass('free');
  expect(mockMarkers[1].remove).toHaveBeenCalled();
});

it('nome entra como texto, nunca como HTML', () => {
  const nome = '<img src=x onerror=1>';
  render(withMap(<OpsMarkersLayer motoboys={[]} stores={[{ id: 'o1', name: nome, lat: -23.5, lng: -46.6 }]} onSelect={jest.fn()} />));
  expect(mockMarkers[0].element.querySelector('img')).toBeNull();
  expect(mockMarkers[0].element).toHaveTextContent(nome);
});

it('enquadra os pontos uma vez só', () => {
  const { rerender } = render(withMap(
    <OpsMarkersLayer
      motoboys={[P('m1', 'free', { lat: -23.5, lng: -46.6 }), P('m2', 'free', { lat: -23.7, lng: -46.4 })]}
      stores={[]}
      onSelect={jest.fn()}
    />,
  ));
  expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
  expect(fakeMap.fitBounds.mock.calls[0][0]).toEqual([[-46.6, -23.7], [-46.4, -23.5]]);
  rerender(withMap(<OpsMarkersLayer motoboys={[P('m1', 'free', { lat: -23.9, lng: -46.9 })]} stores={[]} onSelect={jest.fn()} />));
  expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
});

it('as classes do MapLibre sobrevivem à criação e ao estado novo', () => {
  const { rerender } = render(withMap(
    <OpsMarkersLayer motoboys={[P('m1', 'free')]} stores={[{ id: 'o1', name: 'Loja', lat: -23.5, lng: -46.6 }]} onSelect={jest.fn()} />,
  ));
  expect(mockMarkers[0].element).toHaveClass('maplibregl-marker', 'point', 'free');
  expect(mockMarkers[1].element).toHaveClass('maplibregl-marker', 'store');
  rerender(withMap(
    <OpsMarkersLayer motoboys={[P('m1', 'delivering')]} stores={[{ id: 'o1', name: 'Loja', lat: -23.5, lng: -46.6 }]} onSelect={jest.fn()} />,
  ));
  expect(mockMarkers[0].element).toHaveClass('maplibregl-marker', 'point', 'delivering');
  expect(mockMarkers[0].element).not.toHaveClass('free');
});

it('rerender que tira a loja remove o pino dela', () => {
  const { rerender } = render(withMap(
    <OpsMarkersLayer motoboys={[]} stores={[{ id: 'o1', name: 'Loja', lat: -23.5, lng: -46.6 }]} onSelect={jest.fn()} />,
  ));
  rerender(withMap(<OpsMarkersLayer motoboys={[]} stores={[]} onSelect={jest.fn()} />));
  expect(mockMarkers[0].remove).toHaveBeenCalled();
});

it('desmontar remove todos os marcadores e pinos', () => {
  const { unmount } = render(withMap(
    <OpsMarkersLayer
      motoboys={[P('m1', 'free'), P('m2', 'stale')]}
      stores={[{ id: 'o1', name: 'Loja', lat: -23.5, lng: -46.6 }]}
      onSelect={jest.fn()}
    />,
  ));
  expect(mockMarkers).toHaveLength(3);
  unmount();
  mockMarkers.forEach((m) => expect(m.remove).toHaveBeenCalled());
});
