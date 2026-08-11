/**
 * Configuração do MOTOR do mapa (camada 1). Isola a FONTE dos tiles do resto do
 * Drop Maps — hoje MapTiler (hospedado), amanhã Protomaps/PMTiles self-host na VPS:
 * troca-se só este arquivo, sem tocar em cartografia, negócio ou UI.
 *
 * A chave do MapTiler é PÚBLICA (vai pro bundle do browser via NEXT_PUBLIC). No
 * painel do MapTiler, restrinja por domínio (dropapp.com.br, localhost).
 */

export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';

export const mapConfig = {
  maptilerKey: MAPTILER_KEY,
  // Tiles vetoriais no esquema OpenMapTiles v3 (o mesmo que a cartografia dropDark espera).
  tilesUrl: (key: string) => `https://api.maptiler.com/tiles/v3/tiles.json?key=${key}`,
  // Glyphs (fontes) dos labels. Por ora Noto Sans; fonte da marca (Space Grotesk) exigiria
  // gerar glyphs próprios — fase futura.
  glyphsUrl: (key: string) => `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${key}`,
  // Centro/zoom default: São Paulo (mesma região da referência). Sobrescrito por contexto.
  defaultCenter: [-46.6388, -23.5489] as [number, number],
  defaultZoom: 12.5,
};

export const hasMapKey = (): boolean => !!MAPTILER_KEY;
