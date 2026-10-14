import { act, render, waitFor } from '@testing-library/react';

const mockMap = {
  addControl: jest.fn(), on: jest.fn(), once: jest.fn(), off: jest.fn(),
  setStyle: jest.fn(), resize: jest.fn(), remove: jest.fn(),
};
jest.mock('maplibre-gl', () => ({ Map: jest.fn(() => mockMap), AttributionControl: jest.fn() }));
jest.mock('../../../lib/mapConfig', () => ({ ...jest.requireActual('../../../lib/mapConfig'), hasMapKey: () => true }));

// eslint-disable-next-line import/first
import { Map as MapCtor } from 'maplibre-gl';
// eslint-disable-next-line import/first
import DropMap from '../DropMap';

beforeAll(() => {
  (global as any).ResizeObserver = class { observe() {} disconnect() {} };
});
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => document.documentElement.removeAttribute('data-theme'));

test('cria o mapa com o estilo do tema que está valendo e troca quando o tema vira', async () => {
  document.documentElement.setAttribute('data-theme', 'light');
  render(<DropMap />);
  expect((MapCtor as unknown as jest.Mock).mock.calls[0][0].style.name).toBe('Drop Light');
  expect(mockMap.setStyle).not.toHaveBeenCalled();

  act(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await waitFor(() => expect(mockMap.setStyle).toHaveBeenCalledWith(expect.objectContaining({ name: 'Drop Dark' }), { diff: false }));
  expect(mockMap.setStyle).toHaveBeenCalledTimes(1);
});

test('atributo reescrito com o mesmo tema não recarrega o estilo', async () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  render(<DropMap />);
  expect((MapCtor as unknown as jest.Mock).mock.calls[0][0].style.name).toBe('Drop Dark');
  act(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await new Promise((r) => setTimeout(r, 0));
  expect(mockMap.setStyle).not.toHaveBeenCalled();
});
