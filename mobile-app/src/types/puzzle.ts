// Tipos del puzzle para mobile-app. Mantener en sync con
// web-app/src/types/learningContent.ts (PuzzleContent y derivados).
// Schema v2: formato del catálogo importado (kit starter).

export type PuzzleCourtPosition = 'left' | 'right' | 'both';
export type PuzzleShotType = 'lob' | 'chiquita';
export type PuzzleSpin = 'clockwise' | 'counter-clockwise' | 'random';
export type PuzzlePlayerFacing = 'face' | 'back';

export interface PuzzlePlayer {
  id: number;
  team: 1 | 2;
  x: number;
  y: number;
  is_user?: boolean;
  facing?: PuzzlePlayerFacing;
  speech_label?: string;
}

export interface PuzzleBall {
  x: number;
  y: number;
  shot_type?: PuzzleShotType;
  spin?: PuzzleSpin;
}

// Preset visual de la shape. Define color/animación/borde/etc., sustituye al uso libre
// de color/dashed/fillColor cuando está presente.
export type ShapePreset =
  | 'trajectory'
  | 'movement'
  | 'highlight'
  | 'good_zone'
  | 'bad_zone'
  | 'neutral_zone'
  | 'measure'
  | 'tactical';

interface PuzzleShapeBase {
  id: string;
  style?: ShapePreset;
  color?: string;
  visible_only_after_confirmation?: boolean;
}

export type PuzzleShape =
  | (PuzzleShapeBase & { type: 'circle'; x: number; y: number; radius: number; dashed?: boolean })
  | (PuzzleShapeBase & { type: 'arrow'; startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; controlPoint?: { x: number; y: number }; dashed?: boolean; pointerAtBeginning?: boolean; tagText?: string; tagPosition?: number })
  | (PuzzleShapeBase & { type: 'rect'; x: number; y: number; width: number; height: number; fillColor?: string; fillOpacity?: number })
  | (PuzzleShapeBase & { type: 'line'; points: number[]; strokeWidth?: number })
  | (PuzzleShapeBase & { type: 'text'; x: number; y: number; text: string; fontSize?: number })
  | (PuzzleShapeBase & { type: 'triangle'; points: number[]; fillColor?: string; fillOpacity?: number });

export interface PuzzleFrame {
  players: PuzzlePlayer[];
  ball: PuzzleBall;
  shapes?: PuzzleShape[];
  duration_ms?: number;
}

export interface PuzzleOption {
  id: 1 | 2 | 3;
  text: string;
  explanation: string;
  is_correct: boolean;
  badge_position?: { x: number; y: number };
  select_frame?: PuzzleFrame;
  confirmation_frame?: PuzzleFrame;
}

export interface PuzzleContent {
  schema_version?: 2;
  statement: string;
  court_position?: PuzzleCourtPosition;
  initial_frame: PuzzleFrame;
  options: PuzzleOption[];
}
