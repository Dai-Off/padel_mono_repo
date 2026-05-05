// Configuración visual de la pista. Coordenadas en metros.
// Pista: 10 m × 20 m. Equipo 1 (usuario) abajo [0..10, 10..20]; equipo 2 arriba [0..10, 0..10].
// Mismos valores numéricos que padelchess para coherencia con el visor mobile.

export const courtConfig = {
  surface: { width: 10, height: 20, color: '#3b82f6' },
  // Margen exterior incluido en court.svg (paredes/postes). El SVG tiene
  // viewBox 1080×2080 con la pista 1000×2000 dentro y 40 unidades = 0.4m
  // de margen alrededor. Renderizamos todo el SVG, las posiciones de
  // jugadores/pelota se desplazan internamente por outerMargin.
  outerMargin: 0.4,
  line:    { color: '#ffffff', width: 0.07 },
  net:     { y: 10, color: '#d0d0d0', borderColor: '#1a1a1a' },
  serviceLines: { topY: 3, bottomY: 17 },
  centerServiceLine: { x: 5, fromY: 2.6, toY: 17.4 },
  player:  { radius: 0.6 },
  ball:    { radius: 0.4 },
  optionBadge: { radius: 0.9 },
} as const;

// Posiciones por defecto al crear un puzzle nuevo.
export const DEFAULT_PLAYERS = [
  { id: 1, team: 1 as const, x: 3, y: 15 },
  { id: 2, team: 1 as const, x: 7, y: 15 },
  { id: 3, team: 2 as const, x: 3, y: 5 },
  { id: 4, team: 2 as const, x: 7, y: 5 },
];
export const DEFAULT_BALL = { x: 5, y: 12 };
