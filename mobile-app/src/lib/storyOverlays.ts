// Datos de los overlays de una historia (texto/stickers/filtro), guardados como
// metadatos y pintados encima de la foto/vídeo al reproducir.

export type StoryFilterId = 'none' | 'warm' | 'cool' | 'vintage' | 'rose' | 'dark';

export interface StoryFilter {
  id: StoryFilterId;
  label: string;
  color: string;   // overlay de color
  opacity: number;
}

const STORY_FILTER_DEFS: Omit<StoryFilter, 'label'>[] = [
  { id: 'none', color: 'transparent', opacity: 0 },
  { id: 'warm', color: '#FF8A00', opacity: 0.18 },
  { id: 'cool', color: '#1E80FF', opacity: 0.18 },
  { id: 'vintage', color: '#C8A165', opacity: 0.22 },
  { id: 'rose', color: '#FF5E8A', opacity: 0.16 },
  { id: 'dark', color: '#000000', opacity: 0.30 },
];

const FILTER_LABEL_KEYS: Record<StoryFilterId, string> = {
  none: 'community.storyOverlayNormal',
  warm: 'community.storyOverlayWarm',
  cool: 'community.storyOverlayCool',
  vintage: 'community.storyOverlayVintage',
  rose: 'community.storyOverlayRose',
  dark: 'community.storyOverlayDark',
};

export function getStoryFilters(
  t: (key: string) => string,
): StoryFilter[] {
  return STORY_FILTER_DEFS.map((def) => ({
    ...def,
    label: t(FILTER_LABEL_KEYS[def.id]),
  }));
}

/** @deprecated Use getStoryFilters(t) for locale-aware labels */
export const STORY_FILTERS: StoryFilter[] = STORY_FILTER_DEFS.map((def) => ({
  ...def,
  label: def.id,
}));

export const filterById = (
  id?: string | null,
  filters: StoryFilter[] = STORY_FILTERS,
): StoryFilter =>
  filters.find((f) => f.id === id) ?? filters[0];

export interface StoryLayer {
  id: string;
  type: 'text' | 'sticker';
  value: string;      // texto o emoji
  color: string;      // color del texto (los stickers lo ignoran)
  x: number;          // centro, fracción 0..1 del contenedor
  y: number;
  scale: number;
  rotation: number;   // grados
}

// Encuadre de la media (mover/zoom/rotar dentro del marco), guardado como datos.
export interface MediaTransform {
  x: number;        // desplazamiento, fracción del ancho del contenedor
  y: number;        // desplazamiento, fracción del alto
  scale: number;
  rotation: number; // grados
}

export interface StoryOverlays {
  filter: StoryFilterId;
  layers: StoryLayer[];
  media?: MediaTransform;
}

export const TEXT_COLORS = ['#FFFFFF', '#000000', '#F18F34', '#FF3B30', '#34C759', '#1E80FF', '#FF5E8A'];
