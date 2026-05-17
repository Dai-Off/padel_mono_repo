// DUPLICADO: mantener sincronizado con backend/src/lib/puzzleValidator.ts.
// El monorepo no tiene carpeta shared/, así que la validación cliente-side se
// copia tal cual. Si tocas uno, toca el otro.
//
// Validación del árbol jsonb de un puzzle táctico (type='puzzle').
// Schema v2: formato del catálogo importado (kit starter).
//
// Exporta dos APIs:
//   - validatePuzzleContent(content) → string | null  (primer error, legacy)
//   - validatePuzzleContentAll(content) → PuzzleValidationError[]

const COURT_W = 10;
const COURT_H = 20;

const VALID_COURT_POSITIONS = ['left', 'right', 'both'] as const;
const VALID_SHOT_TYPES = ['lob', 'chiquita'] as const;
const VALID_SPINS = ['clockwise', 'counter-clockwise', 'random'] as const;
const VALID_FACINGS = ['face', 'back'] as const;
const VALID_SHAPE_TYPES = ['arrow', 'circle', 'rect', 'line', 'text', 'triangle', 'speechbubble'] as const;
const VALID_SHAPE_PRESETS = [
  'trajectory',
  'movement',
  'highlight',
  'good_zone',
  'bad_zone',
  'neutral_zone',
  'measure',
  'tactical',
] as const;

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type PuzzleErrorScope =
  | { kind: 'meta' }
  | { kind: 'intro' }
  | { kind: 'initial' }
  | { kind: 'option'; optionId: 1 | 2 | 3; phase?: 'select' | 'confirm' };

export interface PuzzleValidationError {
  path: string;
  message: string;
  scope: PuzzleErrorScope;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isCoord(v: unknown, w: number, h: number): boolean {
  if (!isObject(v)) return false;
  const x = v.x;
  const y = v.y;
  return typeof x === 'number' && typeof y === 'number' && x >= 0 && x <= w && y >= 0 && y <= h;
}

function isInRange(n: unknown, min: number, max: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function inCourtTolerant(n: unknown, max: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= -0.5 && n <= max + 0.5;
}

function push(errors: PuzzleValidationError[], scope: PuzzleErrorScope, path: string, message: string) {
  errors.push({ path, message: `${path}: ${message}`, scope });
}

// ---------------------------------------------------------------------------
// Validadores por entidad
// ---------------------------------------------------------------------------

function validatePlayer(
  p: unknown,
  idx: number,
  prefix: string,
  scope: PuzzleErrorScope,
  errors: PuzzleValidationError[],
): void {
  const path = `${prefix}.players[${idx}]`;
  if (!isObject(p)) { push(errors, scope, path, 'debe ser un objeto'); return; }
  if (!Number.isInteger(p.id) || (p.id as number) < 1) push(errors, scope, `${path}.id`, 'debe ser entero >= 1');
  if (p.team !== 1 && p.team !== 2) push(errors, scope, `${path}.team`, 'debe ser 1 o 2');
  if (!isInRange(p.x, 0, COURT_W)) push(errors, scope, `${path}.x`, `fuera de rango [0..${COURT_W}]`);
  if (!isInRange(p.y, 0, COURT_H)) push(errors, scope, `${path}.y`, `fuera de rango [0..${COURT_H}]`);
  if (p.is_user !== undefined && typeof p.is_user !== 'boolean') {
    push(errors, scope, `${path}.is_user`, 'debe ser boolean');
  }
  if (p.facing !== undefined && !VALID_FACINGS.includes(p.facing as typeof VALID_FACINGS[number])) {
    push(errors, scope, `${path}.facing`, `debe ser ${VALID_FACINGS.join('|')}`);
  }
  if (p.speech_label !== undefined && typeof p.speech_label !== 'string') {
    push(errors, scope, `${path}.speech_label`, 'debe ser string');
  }
}

function validateBall(b: unknown, prefix: string, scope: PuzzleErrorScope, errors: PuzzleValidationError[]): void {
  const path = `${prefix}.ball`;
  if (!isObject(b)) { push(errors, scope, path, 'debe ser un objeto'); return; }
  if (!isInRange(b.x, 0, COURT_W)) push(errors, scope, `${path}.x`, `fuera de rango [0..${COURT_W}]`);
  if (!isInRange(b.y, 0, COURT_H)) push(errors, scope, `${path}.y`, `fuera de rango [0..${COURT_H}]`);
  if (b.shot_type !== undefined && !VALID_SHOT_TYPES.includes(b.shot_type as typeof VALID_SHOT_TYPES[number])) {
    push(errors, scope, `${path}.shot_type`, `debe ser ${VALID_SHOT_TYPES.join('|')} o undefined`);
  }
  if (b.spin !== undefined && !VALID_SPINS.includes(b.spin as typeof VALID_SPINS[number])) {
    push(errors, scope, `${path}.spin`, `debe ser ${VALID_SPINS.join('|')}`);
  }
}

function validateShape(
  s: unknown,
  idx: number,
  prefix: string,
  scope: PuzzleErrorScope,
  errors: PuzzleValidationError[],
): void {
  const path = `${prefix}.shapes[${idx}]`;
  if (!isObject(s)) { push(errors, scope, path, 'debe ser un objeto'); return; }
  if (!isNonEmptyString(s.id)) push(errors, scope, `${path}.id`, 'debe ser string no vacío');
  if (!VALID_SHAPE_TYPES.includes(s.type as typeof VALID_SHAPE_TYPES[number])) {
    push(errors, scope, `${path}.type`, `debe ser ${VALID_SHAPE_TYPES.join('|')}`);
    return;
  }
  if (s.color !== undefined && typeof s.color !== 'string') {
    push(errors, scope, `${path}.color`, 'debe ser string');
  }
  if (s.style !== undefined && !VALID_SHAPE_PRESETS.includes(s.style as typeof VALID_SHAPE_PRESETS[number])) {
    push(errors, scope, `${path}.style`, `debe ser ${VALID_SHAPE_PRESETS.join('|')}`);
  }

  switch (s.type) {
    case 'circle': {
      if (!inCourtTolerant(s.x, COURT_W)) push(errors, scope, `${path}.x`, 'fuera de rango');
      if (!inCourtTolerant(s.y, COURT_H)) push(errors, scope, `${path}.y`, 'fuera de rango');
      if (!isInRange(s.radius, 0.05, COURT_W)) push(errors, scope, `${path}.radius`, 'fuera de rango');
      if (s.dashed !== undefined && typeof s.dashed !== 'boolean') push(errors, scope, `${path}.dashed`, 'debe ser boolean');
      break;
    }
    case 'arrow': {
      if (!isCoord(s.startPoint, COURT_W + 0.5, COURT_H + 0.5)) push(errors, scope, `${path}.startPoint`, 'coord inválida');
      if (!isCoord(s.endPoint, COURT_W + 0.5, COURT_H + 0.5)) push(errors, scope, `${path}.endPoint`, 'coord inválida');
      if (s.controlPoint !== undefined && !isCoord(s.controlPoint, COURT_W + 0.5, COURT_H + 0.5)) {
        push(errors, scope, `${path}.controlPoint`, 'coord inválida');
      }
      if (s.dashed !== undefined && typeof s.dashed !== 'boolean') push(errors, scope, `${path}.dashed`, 'debe ser boolean');
      if (s.pointerAtBeginning !== undefined && typeof s.pointerAtBeginning !== 'boolean') {
        push(errors, scope, `${path}.pointerAtBeginning`, 'debe ser boolean');
      }
      if (s.tagText !== undefined && typeof s.tagText !== 'string') push(errors, scope, `${path}.tagText`, 'debe ser string');
      if (s.tagPosition !== undefined && !isInRange(s.tagPosition, 0, 1)) {
        push(errors, scope, `${path}.tagPosition`, 'debe estar en [0..1]');
      }
      break;
    }
    case 'rect': {
      if (!inCourtTolerant(s.x, COURT_W)) push(errors, scope, `${path}.x`, 'fuera de rango');
      if (!inCourtTolerant(s.y, COURT_H)) push(errors, scope, `${path}.y`, 'fuera de rango');
      if (!isInRange(s.width, 0.05, COURT_W)) push(errors, scope, `${path}.width`, 'fuera de rango');
      if (!isInRange(s.height, 0.05, COURT_H)) push(errors, scope, `${path}.height`, 'fuera de rango');
      if (s.fillColor !== undefined && typeof s.fillColor !== 'string') push(errors, scope, `${path}.fillColor`, 'debe ser string');
      if (s.fillOpacity !== undefined && !isInRange(s.fillOpacity, 0, 1)) {
        push(errors, scope, `${path}.fillOpacity`, 'debe estar en [0..1]');
      }
      break;
    }
    case 'line': {
      if (!Array.isArray(s.points) || s.points.length < 4 || s.points.length % 2 !== 0) {
        push(errors, scope, `${path}.points`, 'debe ser array par de coordenadas (>=4)');
      } else {
        for (let i = 0; i < s.points.length; i++) {
          const max = i % 2 === 0 ? COURT_W : COURT_H;
          if (!inCourtTolerant(s.points[i], max)) {
            push(errors, scope, `${path}.points[${i}]`, 'fuera de rango');
          }
        }
      }
      if (s.strokeWidth !== undefined && !isInRange(s.strokeWidth, 0.01, 1)) {
        push(errors, scope, `${path}.strokeWidth`, 'fuera de rango');
      }
      break;
    }
    case 'text':
    case 'speechbubble': {
      if (!isNonEmptyString(s.text)) push(errors, scope, `${path}.text`, 'vacío');
      if (!inCourtTolerant(s.x, COURT_W)) push(errors, scope, `${path}.x`, 'fuera de rango');
      if (!inCourtTolerant(s.y, COURT_H)) push(errors, scope, `${path}.y`, 'fuera de rango');
      if (s.fontSize !== undefined && !isInRange(s.fontSize, 4, 200)) {
        push(errors, scope, `${path}.fontSize`, 'fuera de rango');
      }
      break;
    }
    case 'triangle': {
      if (!Array.isArray(s.points) || s.points.length !== 6) {
        push(errors, scope, `${path}.points`, 'debe tener 6 números');
      } else {
        for (let i = 0; i < 6; i++) {
          const max = i % 2 === 0 ? COURT_W : COURT_H;
          if (!inCourtTolerant(s.points[i], max)) {
            push(errors, scope, `${path}.points[${i}]`, 'fuera de rango');
          }
        }
      }
      if (s.fillColor !== undefined && typeof s.fillColor !== 'string') push(errors, scope, `${path}.fillColor`, 'debe ser string');
      if (s.fillOpacity !== undefined && !isInRange(s.fillOpacity, 0, 1)) {
        push(errors, scope, `${path}.fillOpacity`, 'debe estar en [0..1]');
      }
      break;
    }
  }
}

function validateFrame(
  frame: unknown,
  prefix: string,
  scope: PuzzleErrorScope,
  opts: { requirePlayers: boolean },
  errors: PuzzleValidationError[],
): void {
  if (!isObject(frame)) { push(errors, scope, prefix, 'debe ser un objeto'); return; }

  const players = frame.players;
  if (!Array.isArray(players)) {
    push(errors, scope, `${prefix}.players`, 'debe ser un array');
  } else {
    if (opts.requirePlayers && (players.length < 1 || players.length > 4)) {
      push(errors, scope, `${prefix}.players`, 'debe contener entre 1 y 4 jugadores');
    }
    if (opts.requirePlayers) {
      const ids = new Set<number>();
      for (const p of players) {
        if (isObject(p) && typeof p.id === 'number') {
          if (ids.has(p.id)) {
            push(errors, scope, `${prefix}.players`, 'tiene ids duplicados');
            break;
          }
          ids.add(p.id);
        }
      }
    }
    for (let i = 0; i < players.length; i++) {
      validatePlayer(players[i], i, prefix, scope, errors);
    }
  }

  validateBall(frame.ball, prefix, scope, errors);

  if (frame.shapes !== undefined) {
    if (!Array.isArray(frame.shapes)) {
      push(errors, scope, `${prefix}.shapes`, 'debe ser array');
    } else {
      const shapeIds = new Set<string>();
      for (let i = 0; i < frame.shapes.length; i++) {
        validateShape(frame.shapes[i], i, prefix, scope, errors);
        const sid = (frame.shapes[i] as { id?: string })?.id;
        if (typeof sid === 'string' && sid) {
          if (shapeIds.has(sid)) push(errors, scope, `${prefix}.shapes`, `tiene ids duplicados (${sid})`);
          shapeIds.add(sid);
        }
      }
    }
  }

  if (frame.duration_ms !== undefined && !isInRange(frame.duration_ms, 100, 5000)) {
    push(errors, scope, `${prefix}.duration_ms`, 'debe estar entre 100 y 5000 ms');
  }
  if (frame.auto_trajectory !== undefined && typeof frame.auto_trajectory !== 'boolean') {
    push(errors, scope, `${prefix}.auto_trajectory`, 'debe ser boolean');
  }
}

function validateOption(o: unknown, idx: number, errors: PuzzleValidationError[]): void {
  const metaScope: PuzzleErrorScope = { kind: 'meta' };
  const path = `puzzle.options[${idx}]`;
  if (!isObject(o)) { push(errors, metaScope, path, 'debe ser un objeto'); return; }

  const optId = (o.id === 1 || o.id === 2 || o.id === 3) ? (o.id as 1 | 2 | 3) : null;
  const optScope: PuzzleErrorScope = optId ? { kind: 'option', optionId: optId } : metaScope;

  if (optId == null) push(errors, metaScope, `${path}.id`, 'debe ser 1, 2 o 3');
  if (!isNonEmptyString(o.text)) push(errors, optScope, `${path}.text`, 'vacío');
  if (typeof o.explanation !== 'string') push(errors, optScope, `${path}.explanation`, 'debe ser string');
  if (typeof o.is_correct !== 'boolean') push(errors, optScope, `${path}.is_correct`, 'debe ser boolean');
  if (o.badge_position !== undefined && !isCoord(o.badge_position, COURT_W, COURT_H)) {
    push(errors, optScope, `${path}.badge_position`, 'coord inválida');
  }
  if (o.select_frame !== undefined) {
    const selScope: PuzzleErrorScope = optId ? { kind: 'option', optionId: optId, phase: 'select' } : metaScope;
    validateFrame(o.select_frame, `${path}.select_frame`, selScope, { requirePlayers: false }, errors);
  }
  if (o.confirmation_frame !== undefined) {
    const cnfScope: PuzzleErrorScope = optId ? { kind: 'option', optionId: optId, phase: 'confirm' } : metaScope;
    validateFrame(o.confirmation_frame, `${path}.confirmation_frame`, cnfScope, { requirePlayers: false }, errors);
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function validatePuzzleContentAll(content: unknown): PuzzleValidationError[] {
  const errors: PuzzleValidationError[] = [];
  const meta: PuzzleErrorScope = { kind: 'meta' };

  if (!isObject(content)) {
    errors.push({ path: 'puzzle', message: 'puzzle.content debe ser un objeto', scope: meta });
    return errors;
  }

  if (content.schema_version !== undefined && content.schema_version !== 2) {
    push(errors, meta, 'puzzle.schema_version', 'no soportada (esperado: 2)');
  }

  if (typeof content.statement !== 'string') {
    push(errors, meta, 'puzzle.statement', 'debe ser string');
  } else if (content.statement.trim().length < 8 || content.statement.length > 280) {
    push(errors, meta, 'puzzle.statement', 'debe tener entre 8 y 280 caracteres');
  }

  if (content.court_position !== undefined) {
    if (!VALID_COURT_POSITIONS.includes(content.court_position as typeof VALID_COURT_POSITIONS[number])) {
      push(errors, meta, 'puzzle.court_position', `debe ser ${VALID_COURT_POSITIONS.join('|')}`);
    }
  }

  if (content.intro_frame != null) {
    validateFrame(content.intro_frame, 'puzzle.intro_frame', { kind: 'intro' }, { requirePlayers: true }, errors);
  }

  validateFrame(content.initial_frame, 'puzzle.initial_frame', { kind: 'initial' }, { requirePlayers: true }, errors);

  if (!Array.isArray(content.options)) {
    push(errors, meta, 'puzzle.options', 'debe ser un array');
  } else {
    if (content.options.length < 2 || content.options.length > 3) {
      push(errors, meta, 'puzzle.options', 'debe contener 2 o 3 opciones');
    }
    const optionIds = new Set<number>();
    let correctCount = 0;
    for (let i = 0; i < content.options.length; i++) {
      const opt = content.options[i];
      validateOption(opt, i, errors);
      if (isObject(opt) && typeof opt.id === 'number') {
        if (optionIds.has(opt.id)) push(errors, meta, 'puzzle.options', 'tiene ids duplicados');
        optionIds.add(opt.id);
        if (opt.is_correct === true) correctCount++;
      }
    }
    if (correctCount !== 1) {
      push(errors, meta, 'puzzle.options', `debe tener exactamente 1 opción con is_correct=true (hay ${correctCount})`);
    }
  }

  return errors;
}

export function validatePuzzleContent(content: unknown): string | null {
  const errors = validatePuzzleContentAll(content);
  return errors[0]?.message ?? null;
}
