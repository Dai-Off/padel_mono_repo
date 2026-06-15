// Datos de los overlays de una historia (texto/stickers/filtro), guardados como
// metadatos y pintados encima de la foto/vídeo al reproducir.

export type StoryFilterId = 'none' | 'warm' | 'cool' | 'vintage' | 'rose' | 'dark';

export interface StoryFilter {
  id: StoryFilterId;
  label: string;
  color: string;   // overlay de color
  opacity: number;
}

// Filtros por superposición de color (sin Skia, peso 0).
export const STORY_FILTERS: StoryFilter[] = [
  { id: 'none', label: 'Normal', color: 'transparent', opacity: 0 },
  { id: 'warm', label: 'Cálido', color: '#FF8A00', opacity: 0.18 },
  { id: 'cool', label: 'Frío', color: '#1E80FF', opacity: 0.18 },
  { id: 'vintage', label: 'Vintage', color: '#C8A165', opacity: 0.22 },
  { id: 'rose', label: 'Rosa', color: '#FF5E8A', opacity: 0.16 },
  { id: 'dark', label: 'Oscuro', color: '#000000', opacity: 0.30 },
];

export const filterById = (id?: string | null): StoryFilter =>
  STORY_FILTERS.find(f => f.id === id) ?? STORY_FILTERS[0];

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
