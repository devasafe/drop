import { buildDropDarkStyle } from '../style/dropDark';
import { buildDropLightStyle, mapStyleFor } from '../style/dropLight';
import { buildRouteThumbnailUrl } from '../../../lib/staticMap';

const ids = (s: any) => s.layers.map((l: any) => l.id).sort();
const pts = { store: { lat: -22.8, lng: -42 }, customer: { lat: -22.81, lng: -42.01 } };

it('estilo claro tem as mesmas camadas do escuro', () => {
  expect(ids(buildDropLightStyle('k'))).toEqual(ids(buildDropDarkStyle('k')));
});
it('mapStyleFor escolhe pelo tema', () => {
  expect(JSON.stringify(mapStyleFor('light', 'k'))).toContain('#F6F5F9');
  expect(mapStyleFor('dark', 'k')).toEqual(buildDropDarkStyle('k'));
});
it('escuro mantém as cores conhecidas', () => {
  const s = JSON.stringify(buildDropDarkStyle('k'));
  for (const c of ['#0a0a0e', '#0c1226', '#15271b', '#565663', '#d3d3db']) expect(s).toContain(c);
  expect(buildDropDarkStyle('k').name).toBe('Drop Dark');
});
it('claro usa água e parques da paleta clara', () => {
  const s = JSON.stringify(buildDropLightStyle('k'));
  for (const c of ['#DCE8F2', '#E3F1E6', '#E4E2EA', '#55516A']) expect(s).toContain(c);
});
describe('staticMap por tema', () => {
  it('claro usa streets-v2', () => {
    const u = buildRouteThumbnailUrl({ ...pts, key: 'k', theme: 'light' })!;
    expect(u).toContain('/maps/streets-v2/static');
    expect(u).not.toContain('-dark');
  });
  it('escuro usa streets-v2-dark', () => {
    expect(buildRouteThumbnailUrl({ ...pts, key: 'k', theme: 'dark' })!).toContain('streets-v2-dark');
  });
  it('padrão vem do data-theme', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(buildRouteThumbnailUrl({ ...pts, key: 'k' })!).toContain('/maps/streets-v2/static');
    document.documentElement.removeAttribute('data-theme');
    expect(buildRouteThumbnailUrl({ ...pts, key: 'k' })!).toContain('streets-v2-dark');
  });
});
