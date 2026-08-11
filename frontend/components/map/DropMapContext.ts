import { createContext, useContext } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';

/**
 * Dá às camadas de negócio (RouteLayer, MarkerLayer, ...) acesso IMPERATIVO à
 * instância do MapLibre criada pelo DropMap. Elas leem o mapa e fazem
 * `getSource().setData()` / `addLayer()` sem re-renderizar o motor.
 */
export const DropMapContext = createContext<MaplibreMap | null>(null);

export const useDropMap = (): MaplibreMap | null => useContext(DropMapContext);
