// Configuración visual de la pista. Coordenadas en metros.
// Pista: 10 m × 20 m. Equipo 1 (usuario) abajo [0..10, 10..20]; equipo 2 arriba [0..10, 0..10].
// Mismos valores numéricos que padelchess para coherencia con el visor mobile.

export const courtConfig = {
  surface: { width: 10, height: 20, color: '#3b82f6' },
  line:    { color: '#ffffff', width: 0.07 },
  net:     { y: 10, color: '#d0d0d0', borderColor: '#1a1a1a' },
  serviceLines: { topY: 3, bottomY: 17 },           // y = f − 17 / y = 17
  centerServiceLine: { x: 5, fromY: 2.6, toY: 17.4 },
  player:  { radius: 0.6 },                          // tamaño visual = 3.5 × radius
  ball:    { radius: 0.4, color: '#daf843' },
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
