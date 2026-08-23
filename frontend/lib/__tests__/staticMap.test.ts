import { buildRouteThumbnailUrl } from '../staticMap';

const store = { lat: -22.9, lng: -43.2 };
const customer = { lat: -22.88, lng: -43.18 };
const motoboy = { lat: -22.91, lng: -43.21 };

test('retorna null sem chave', () => {
  expect(buildRouteThumbnailUrl({ store, customer, key: '' })).toBeNull();
  expect(buildRouteThumbnailUrl({ store, customer })).toBeNull();
});

test('retorna null com menos de 2 pontos e sem polyline', () => {
  expect(buildRouteThumbnailUrl({ store, key: 'K' })).toBeNull();
});

test('usa a polyline codificada quando existe', () => {
  const url = buildRouteThumbnailUrl({ store, customer, polyline: 'abc\\d~e', key: 'K' })!;
  expect(url).toContain('streets-v2-dark');
  expect(url).toContain('key=K');
  expect(url).toContain(`enc:${encodeURIComponent('abc\\d~e')}`);
  expect(url).toContain('static/auto/');
  expect(url).toContain('fill:none'); // não preenche a área da rota
});

test('marcadores levam label L/C/M na ordem loja/cliente/motoboy', () => {
  const url = buildRouteThumbnailUrl({ store, customer, motoboy, key: 'K' })!;
  expect(url).toContain('-43.200000,-22.900000,L'); // Loja
  expect(url).toContain('-43.180000,-22.880000,C'); // Cliente
  expect(url).toContain('-43.210000,-22.910000,M'); // Motoboy
});

test('polyline gigante estoura o limite → cai pra linha loja→cliente', () => {
  const huge = 'x'.repeat(9000);
  const url = buildRouteThumbnailUrl({ store, customer, polyline: huge, key: 'K' })!;
  expect(url.length).toBeLessThanOrEqual(8192);
  expect(url).not.toContain('enc:');
  expect(url).toContain('-43.200000,-22.900000'); // linha loja→cliente no path
});

test('sem polyline liga loja→cliente em linha (lng,lat)', () => {
  const url = buildRouteThumbnailUrl({ store, customer, key: 'K' })!;
  expect(url).toContain('path=stroke:');
  expect(url).toContain('-43.200000,-22.900000'); // store lng,lat
  expect(url).toContain('-43.180000,-22.880000'); // customer lng,lat
  expect(url).not.toContain('enc:');
});

test('inclui o marcador do motoboy quando fornecido', () => {
  const withMoto = buildRouteThumbnailUrl({ store, customer, motoboy, key: 'K' })!;
  expect(withMoto).toContain('-43.210000,-22.910000'); // motoboy lng,lat
  const without = buildRouteThumbnailUrl({ store, customer, key: 'K' })!;
  expect(without).not.toContain('-43.210000,-22.910000');
});

test('ignora pontos com coordenadas inválidas', () => {
  const url = buildRouteThumbnailUrl({
    store,
    customer,
    motoboy: { lat: NaN, lng: -43.2 },
    key: 'K',
  })!;
  // motoboy inválido não vira marcador; loja+cliente seguem
  expect(url).toContain('markers=');
  expect(url).not.toContain('NaN');
});
