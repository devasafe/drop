import type { StyleSpecification } from 'maplibre-gl';
import { buildDropStyle, buildDropDarkStyle, type DropPalette } from './dropDark';

/**
 * Estilo claro do Drop Maps (DS v2). Mesma estrutura de camadas do escuro
 * (reusa `buildDropStyle`), só muda a paleta.
 *
 * ATENÇÃO: hex é permitido SÓ nos arquivos de estilo de mapa (este e dropDark.ts),
 * porque o MapLibre não consegue ler CSS vars. Nos demais arquivos, use tokens.
 */
export const LIGHT_PALETTE: DropPalette = {
  bg: '#F6F5F9', // terra (gelo)
  water: '#DCE8F2',
  wood: '#E3F1E6',
  grass: '#E3F1E6',
  park: '#E3F1E6',
  building: '#ECEAF1',
  roadMotorway: '#FFFFFF',
  roadPrimary: '#FFFFFF',
  roadSecondary: '#FFFFFF',
  roadTertiary: '#FFFFFF',
  roadMinor: '#FFFFFF',
  roadCasing: '#E4E2EA', // contorno das ruas
  rail: '#D5D2DE',
  boundary: '#C9C5D6',
  textCity: '#2A2640',
  textHood: '#55516A',
  textRoad: '#55516A',
  textPoi: '#55516A',
  textWater: '#6F8AA6',
  halo: '#FFFFFF',
};

export function buildDropLightStyle(key: string): StyleSpecification {
  return buildDropStyle(key, LIGHT_PALETTE, 'Drop Light');
}

export function mapStyleFor(theme: 'light' | 'dark', key: string): StyleSpecification {
  return theme === 'light' ? buildDropLightStyle(key) : buildDropDarkStyle(key);
}
