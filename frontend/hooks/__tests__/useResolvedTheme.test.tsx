import { act, renderHook, waitFor } from '@testing-library/react';
import { useResolvedTheme, readResolvedTheme } from '../useResolvedTheme';

afterEach(() => document.documentElement.removeAttribute('data-theme'));

test('lê o tema que está valendo no <html>; sem atributo vale escuro (como o mapa sempre leu)', () => {
  document.documentElement.setAttribute('data-theme', 'light');
  expect(readResolvedTheme()).toBe('light');
  document.documentElement.removeAttribute('data-theme');
  expect(readResolvedTheme()).toBe('dark');
});

test('reage quando o tema vira (ex.: 18:00 no painel do motoboy)', async () => {
  document.documentElement.setAttribute('data-theme', 'light');
  const { result } = renderHook(() => useResolvedTheme());
  expect(result.current).toBe('light');
  act(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await waitFor(() => expect(result.current).toBe('dark'));
  act(() => { document.documentElement.setAttribute('data-theme', 'light'); });
  await waitFor(() => expect(result.current).toBe('light'));
});
