import { act, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockMarkers = jest.fn();
jest.mock('../DropMap', () => ({ __esModule: true, default: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));
jest.mock('../layers/MarkersLayer', () => ({ MarkersLayer: (p: any) => { mockMarkers(p); return null; } }));
jest.mock('../layers/RouteLayer', () => ({ RouteLayer: () => null }));
jest.mock('../ui/MapControls', () => ({ MapControls: () => null }));
jest.mock('../ui/NavCard', () => ({ NavCard: () => null }));
jest.mock('../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: null })) } }));

// eslint-disable-next-line import/first
import { MotoboyNavMap } from '../presets/MotoboyNavMap';
// eslint-disable-next-line import/first
import { DARK_CUSTOMER_PIN } from '../style/dropDark';

const delivery = { _id: 'd1', status: 'assigned', storeLatitude: -22.8, storeLongitude: -42, customerLatitude: -22.81, customerLongitude: -42.01 };
const lastColor = () => mockMarkers.mock.calls[mockMarkers.mock.calls.length - 1][0].customerColor;

afterEach(() => { document.documentElement.removeAttribute('data-theme'); mockMarkers.mockClear(); });

test('pino do cliente: roxo padrão de dia, verde do cockpit noturno à noite', async () => {
  document.documentElement.setAttribute('data-theme', 'light');
  render(<MotoboyNavMap delivery={delivery} onClose={jest.fn()} />);
  await waitFor(() => expect(mockMarkers).toHaveBeenCalled());
  expect(lastColor()).toBeUndefined();

  act(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await waitFor(() => expect(lastColor()).toBe(DARK_CUSTOMER_PIN));
});
