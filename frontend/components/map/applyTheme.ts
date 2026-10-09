import type { Map as MaplibreMap } from 'maplibre-gl';
import { mapStyleFor } from './style/dropLight';

const pending = new WeakMap<object, () => void>();

/**
 * Troca o estilo do mapa para o tema dado. `diff: false` força o recarregamento
 * completo (o caminho de diff do MapLibre não dispara `style.load` com ids iguais).
 * Só um handler de `style.load` fica pendente por mapa: chamadas rápidas
 * descartam o anterior. `onReloaded` roda quando o novo estilo carrega.
 */
export function applyTheme(
  map: Pick<MaplibreMap, 'setStyle' | 'once' | 'off'>,
  theme: 'light' | 'dark',
  key: string,
  onReloaded: () => void,
) {
  const prev = pending.get(map);
  if (prev) (map as any).off('style.load', prev);
  const handler = () => {
    pending.delete(map);
    onReloaded();
  };
  pending.set(map, handler);
  (map as any).once('style.load', handler);
  map.setStyle(mapStyleFor(theme, key), { diff: false });
}
