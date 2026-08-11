import { useEffect } from 'react';
import { useDropMap } from '../DropMapContext';
import { decodePolyline } from '../../../lib/polyline';

const SRC = 'drop-route';
const BRAND = '#8B5CF6';

/**
 * Camada de negócio: desenha a ROTA do pedido em roxo brilhante (glow + linha).
 * Recebe a polyline codificada (order.routePolyline) OU coordenadas já prontas.
 * Atualiza a fonte GeoJSON imperativamente (setData) — não re-renderiza o mapa.
 */
export function RouteLayer({ polyline, coords }: { polyline?: string | null; coords?: [number, number][] }) {
  const map = useDropMap();

  useEffect(() => {
    if (!map) return;
    const line = coords && coords.length ? coords : polyline ? decodePolyline(polyline) : [];
    if (line.length < 2) return;

    const data = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line },
    } as GeoJSON.Feature;

    const add = () => {
      const existing = map.getSource(SRC) as any;
      if (existing) {
        existing.setData(data);
        return;
      }
      map.addSource(SRC, { type: 'geojson', data });
      map.addLayer({
        id: `${SRC}-glow`,
        type: 'line',
        source: SRC,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': BRAND,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 20],
          'line-opacity': 0.22,
          'line-blur': 8,
        },
      });
      map.addLayer({
        id: `${SRC}-main`,
        type: 'line',
        source: SRC,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': BRAND,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
        },
      });
    };

    if (map.isStyleLoaded()) add();
    else map.once('styledata', add);

    return () => {
      try {
        if (map.getLayer(`${SRC}-main`)) map.removeLayer(`${SRC}-main`);
        if (map.getLayer(`${SRC}-glow`)) map.removeLayer(`${SRC}-glow`);
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {
        /* mapa já pode ter sido destruído */
      }
    };
  }, [map, polyline, coords]);

  return null;
}

export default RouteLayer;
