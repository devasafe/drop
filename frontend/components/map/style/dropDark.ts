import type { StyleSpecification } from 'maplibre-gl';
import { mapConfig } from '../../../lib/mapConfig';

/**
 * CARTOGRAFIA DROP (camada 2) — o estilo dark premium da marca, em MapLibre Style Spec.
 *
 * Identidade: fundo quase-preto, vias em cinza com hierarquia (quanto mais importante,
 * mais clara/larga), parques em verde muito escuro, água discreta, labels sóbrios,
 * POIs mínimos. O ROXO da Drop é reservado às camadas de negócio (rota/marcadores),
 * então a base fica neutra pra a informação importante saltar por cima.
 *
 * Fonte de dados: esquema OpenMapTiles v3 (source-layers: water, waterway, landcover,
 * park, building, transportation, transportation_name, boundary, place, poi).
 */

// Paleta Drop (dark)
const C = {
  bg: '#0a0a0e',
  water: '#0b1020',
  wood: '#0f1e17',
  grass: '#101d16',
  park: '#12241a',
  building: '#131319',
  // vias (hierarquia: motorway/trunk mais claro → local mais escuro)
  roadMotorway: '#3c3c46',
  roadPrimary: '#33333c',
  roadSecondary: '#2b2b31',
  roadTertiary: '#232329',
  roadMinor: '#1c1c21',
  roadCasing: '#0e0e12',
  rail: '#1a1a1f',
  boundary: '#2a2a34',
  // labels
  textCity: '#d3d3db',
  textHood: '#8b8b96',
  textRoad: '#6c6c77',
  textPoi: '#7a7a86',
  textWater: '#3a4a6a',
  halo: '#0a0a0e',
};

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

export function buildDropDarkStyle(key: string): StyleSpecification {
  const source = 'openmaptiles';
  return {
    version: 8,
    name: 'Drop Dark',
    glyphs: mapConfig.glyphsUrl(key),
    sources: {
      [source]: { type: 'vector', url: mapConfig.tilesUrl(key) },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.bg } },

      // ── Água / verde ──
      { id: 'water', type: 'fill', source, 'source-layer': 'water',
        paint: { 'fill-color': C.water } },
      { id: 'waterway', type: 'line', source, 'source-layer': 'waterway',
        paint: { 'line-color': C.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 2] } },
      { id: 'wood', type: 'fill', source, 'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-color': C.wood, 'fill-opacity': 0.7 } },
      { id: 'grass', type: 'fill', source, 'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'scrub']]],
        paint: { 'fill-color': C.grass, 'fill-opacity': 0.6 } },
      { id: 'park', type: 'fill', source, 'source-layer': 'park',
        paint: { 'fill-color': C.park, 'fill-opacity': 0.8 } },

      // ── Prédios (sutis, só em zoom alto) ──
      { id: 'building', type: 'fill', source, 'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-color': C.building,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, 0.7],
        } },

      // ── Vias: casing (contorno) só nas maiores, depois o preenchimento por classe ──
      { id: 'road-casing', type: 'line', source, 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': C.roadCasing,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 8, 18, 24],
        } },
      { id: 'road-minor', type: 'line', source, 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
        minzoom: 13,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': C.roadMinor,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 18, 8],
        } },
      { id: 'road-tertiary', type: 'line', source, 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'tertiary'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': C.roadTertiary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 5, 18, 12],
        } },
      { id: 'road-secondary', type: 'line', source, 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'secondary'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': C.roadSecondary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 16, 7, 18, 16],
        } },
      { id: 'road-primary', type: 'line', source, 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'primary'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': C.roadPrimary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 6, 18, 20],
        } },
      { id: 'road-motorway', type: 'line', source, 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': C.roadMotorway,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 7, 18, 22],
        } },
      { id: 'rail', type: 'line', source, 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'rail'], minzoom: 12,
        paint: { 'line-color': C.rail, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, 3] } },

      // ── Limites administrativos (bem discretos) ──
      { id: 'boundary', type: 'line', source, 'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 6],
        paint: { 'line-color': C.boundary, 'line-width': 0.6, 'line-dasharray': [2, 2], 'line-opacity': 0.5 } },

      // ── Labels de via (discretos, seguem a linha) ──
      { id: 'label-road', type: 'symbol', source, 'source-layer': 'transportation_name',
        minzoom: 13,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 18, 12],
          'text-letter-spacing': 0.02,
        },
        paint: { 'text-color': C.textRoad, 'text-halo-color': C.halo, 'text-halo-width': 1.1 } },

      // ── POIs mínimos (só texto, poucas classes, sóbrio) ──
      { id: 'label-poi', type: 'symbol', source, 'source-layer': 'poi',
        minzoom: 15,
        filter: ['in', ['get', 'class'], ['literal', ['hospital', 'grocery', 'park', 'college']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT,
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.6],
          'text-max-width': 8,
        },
        paint: { 'text-color': C.textPoi, 'text-halo-color': C.halo, 'text-halo-width': 1, 'text-opacity': 0.85 } },

      // ── Bairros/vilas: MAIÚSCULO, espaçado, discreto (como na referência) ──
      { id: 'label-hood', type: 'symbol', source, 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]],
        minzoom: 11,
        layout: {
          'text-field': ['upcase', ['get', 'name']],
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 14],
          'text-letter-spacing': 0.18,
          'text-max-width': 9,
        },
        paint: { 'text-color': C.textHood, 'text-halo-color': C.halo, 'text-halo-width': 1.2 } },

      // ── Cidades/distritos: mais claro e destacado ──
      { id: 'label-city', type: 'symbol', source, 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 18],
          'text-max-width': 8,
        },
        paint: { 'text-color': C.textCity, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },

      // ── Nomes de água (rios/represas), bem apagados ──
      { id: 'label-water', type: 'symbol', source, 'source-layer': 'water_name',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Italic'],
          'text-size': 11,
          'symbol-placement': 'line',
        },
        paint: { 'text-color': C.textWater, 'text-halo-color': C.halo, 'text-halo-width': 1 } },
    ],
  };
}
