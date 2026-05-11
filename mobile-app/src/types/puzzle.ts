// Tipos del puzzle para mobile-app. Mantener en sync con
// web-app/src/types/learningContent.ts (PuzzleContent y derivados).
// Schema canónico: docs/learning/Puzzles/IMPLEMENTATION_PLAN.md §1.

export type PuzzleCourtPosition = 'left' | 'right' | 'both';
export type PuzzleShotType = 'lob' | 'chiquita';
export type PuzzleSpin = 'clockwise' | 'counter-clockwise' | 'random';
export type PuzzlePlayerFacing = 'face' | 'back';

export interface PuzzlePlayer {
  id: number;
  team: 1 | 2;
  x: number;
  y: number;
  facing?: PuzzlePlayerFacing;
  speech_label?: string;
}

export interface PuzzleBall {
  x: number;
  y: number;
  shot_type?: PuzzleShotType;
  spin?: PuzzleSpin;
}

export interface PuzzleFrame {
  players: PuzzlePlayer[];
  ball: PuzzleBall;
  duration_ms?: number;
}

export interface PuzzleOption {
  id: 1 | 2 | 3;
  text: string;
  explanation: string;
  points: 0 | 1 | 2;
  badge_position?: { x: number; y: number };
  reveal_frame?: PuzzleFrame;
}

export interface PuzzleContent {
  schema_version?: 1;
  statement: string;
  court_position?: PuzzleCourtPosition;
  general_explanation?: string;
  initial_frame: PuzzleFrame;
  options: PuzzleOption[];
}
