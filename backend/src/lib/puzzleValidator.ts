// Validación del árbol jsonb de un puzzle táctico (type='puzzle').
// Schema v2: formato del catálogo importado (kit starter).

const COURT_W = 10;
const COURT_H = 20;

const VALID_COURT_POSITIONS = ['left', 'right', 'both'] as const;
const VALID_SHOT_TYPES = ['lob', 'chiquita'] as const;
const VALID_SPINS = ['clockwise', 'counter-clockwise', 'random'] as const;
const VALID_FACINGS = ['face', 'back'] as const;
const VALID_SHAPE_TYPES = ['arrow', 'circle', 'rect', 'line', 'text', 'triangle'] as const;

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

// Margen tolerante para shapes que sobresalen (líneas finas, anotaciones cerca del borde).
function inCourtTolerant(n: unknown, max: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= -0.5 && n <= max + 0.5;
}

function validatePlayer(p: unknown, idx: number, prefix: string): string | null {
  if (!isObject(p)) return `${prefix}.players[${idx}] debe ser un objeto`;
  if (!Number.isInteger(p.id) || (p.id as number) < 1) return `${prefix}.players[${idx}].id debe ser entero >= 1`;
  if (p.team !== 1 && p.team !== 2) return `${prefix}.players[${idx}].team debe ser 1 o 2`;
  if (!isInRange(p.x, 0, COURT_W)) return `${prefix}.players[${idx}].x fuera de rango [0..${COURT_W}]`;
  if (!isInRange(p.y, 0, COURT_H)) return `${prefix}.players[${idx}].y fuera de rango [0..${COURT_H}]`;
  if (p.is_user !== undefined && typeof p.is_user !== 'boolean') {
    return `${prefix}.players[${idx}].is_user debe ser boolean`;
  }
  if (p.facing !== undefined && !VALID_FACINGS.includes(p.facing as typeof VALID_FACINGS[number])) {
    return `${prefix}.players[${idx}].facing debe ser ${VALID_FACINGS.join('|')}`;
  }
  if (p.speech_label !== undefined && typeof p.speech_label !== 'string') {
    return `${prefix}.players[${idx}].speech_label debe ser string`;
  }
  return null;
}

function validateBall(b: unknown, prefix: string): string | null {
  if (!isObject(b)) return `${prefix}.ball debe ser un objeto`;
  if (!isInRange(b.x, 0, COURT_W)) return `${prefix}.ball.x fuera de rango [0..${COURT_W}]`;
  if (!isInRange(b.y, 0, COURT_H)) return `${prefix}.ball.y fuera de rango [0..${COURT_H}]`;
  if (b.shot_type !== undefined && !VALID_SHOT_TYPES.includes(b.shot_type as typeof VALID_SHOT_TYPES[number])) {
    return `${prefix}.ball.shot_type debe ser ${VALID_SHOT_TYPES.join('|')} o undefined`;
  }
  if (b.spin !== undefined && !VALID_SPINS.includes(b.spin as typeof VALID_SPINS[number])) {
    return `${prefix}.ball.spin debe ser ${VALID_SPINS.join('|')}`;
  }
  return null;
}

function validateShape(s: unknown, idx: number, prefix: string): string | null {
  if (!isObject(s)) return `${prefix}.shapes[${idx}] debe ser un objeto`;
  if (!isNonEmptyString(s.id)) return `${prefix}.shapes[${idx}].id debe ser string no vacío`;
  if (!VALID_SHAPE_TYPES.includes(s.type as typeof VALID_SHAPE_TYPES[number])) {
    return `${prefix}.shapes[${idx}].type debe ser ${VALID_SHAPE_TYPES.join('|')}`;
  }
  if (s.color !== undefined && typeof s.color !== 'string') {
    return `${prefix}.shapes[${idx}].color debe ser string`;
  }
  if (
    s.visible_only_after_confirmation !== undefined &&
    typeof s.visible_only_after_confirmation !== 'boolean'
  ) {
    return `${prefix}.shapes[${idx}].visible_only_after_confirmation debe ser boolean`;
  }

  switch (s.type) {
    case 'circle': {
      if (!inCourtTolerant(s.x, COURT_W)) return `${prefix}.shapes[${idx}].x fuera de rango`;
      if (!inCourtTolerant(s.y, COURT_H)) return `${prefix}.shapes[${idx}].y fuera de rango`;
      if (!isInRange(s.radius, 0.05, COURT_W)) return `${prefix}.shapes[${idx}].radius fuera de rango`;
      if (s.dashed !== undefined && typeof s.dashed !== 'boolean') {
        return `${prefix}.shapes[${idx}].dashed debe ser boolean`;
      }
      break;
    }
    case 'arrow': {
      if (!isCoord(s.startPoint, COURT_W + 0.5, COURT_H + 0.5))
        return `${prefix}.shapes[${idx}].startPoint coord inválida`;
      if (!isCoord(s.endPoint, COURT_W + 0.5, COURT_H + 0.5))
        return `${prefix}.shapes[${idx}].endPoint coord inválida`;
      if (s.controlPoint !== undefined && !isCoord(s.controlPoint, COURT_W + 0.5, COURT_H + 0.5)) {
        return `${prefix}.shapes[${idx}].controlPoint coord inválida`;
      }
      if (s.dashed !== undefined && typeof s.dashed !== 'boolean') {
        return `${prefix}.shapes[${idx}].dashed debe ser boolean`;
      }
      if (s.pointerAtBeginning !== undefined && typeof s.pointerAtBeginning !== 'boolean') {
        return `${prefix}.shapes[${idx}].pointerAtBeginning debe ser boolean`;
      }
      if (s.tagText !== undefined && typeof s.tagText !== 'string') {
        return `${prefix}.shapes[${idx}].tagText debe ser string`;
      }
      if (s.tagPosition !== undefined && !isInRange(s.tagPosition, 0, 1)) {
        return `${prefix}.shapes[${idx}].tagPosition debe estar en [0..1]`;
      }
      break;
    }
    case 'rect': {
      if (!inCourtTolerant(s.x, COURT_W)) return `${prefix}.shapes[${idx}].x fuera de rango`;
      if (!inCourtTolerant(s.y, COURT_H)) return `${prefix}.shapes[${idx}].y fuera de rango`;
      if (!isInRange(s.width, 0.05, COURT_W)) return `${prefix}.shapes[${idx}].width fuera de rango`;
      if (!isInRange(s.height, 0.05, COURT_H)) return `${prefix}.shapes[${idx}].height fuera de rango`;
      if (s.fillColor !== undefined && typeof s.fillColor !== 'string') {
        return `${prefix}.shapes[${idx}].fillColor debe ser string`;
      }
      if (s.fillOpacity !== undefined && !isInRange(s.fillOpacity, 0, 1)) {
        return `${prefix}.shapes[${idx}].fillOpacity debe estar en [0..1]`;
      }
      break;
    }
    case 'line': {
      if (!Array.isArray(s.points) || s.points.length < 4 || s.points.length % 2 !== 0) {
        return `${prefix}.shapes[${idx}].points debe ser array par de coordenadas (>=4)`;
      }
      for (let i = 0; i < s.points.length; i++) {
        const max = i % 2 === 0 ? COURT_W : COURT_H;
        if (!inCourtTolerant(s.points[i], max)) {
          return `${prefix}.shapes[${idx}].points[${i}] fuera de rango`;
        }
      }
      if (s.strokeWidth !== undefined && !isInRange(s.strokeWidth, 0.01, 1)) {
        return `${prefix}.shapes[${idx}].strokeWidth fuera de rango`;
      }
      break;
    }
    case 'text': {
      if (!isNonEmptyString(s.text)) return `${prefix}.shapes[${idx}].text vacío`;
      if (!inCourtTolerant(s.x, COURT_W)) return `${prefix}.shapes[${idx}].x fuera de rango`;
      if (!inCourtTolerant(s.y, COURT_H)) return `${prefix}.shapes[${idx}].y fuera de rango`;
      if (s.fontSize !== undefined && !isInRange(s.fontSize, 4, 200)) {
        return `${prefix}.shapes[${idx}].fontSize fuera de rango`;
      }
      break;
    }
    case 'triangle': {
      if (!Array.isArray(s.points) || s.points.length !== 6) {
        return `${prefix}.shapes[${idx}].points debe tener 6 números`;
      }
      for (let i = 0; i < 6; i++) {
        const max = i % 2 === 0 ? COURT_W : COURT_H;
        if (!inCourtTolerant(s.points[i], max)) {
          return `${prefix}.shapes[${idx}].points[${i}] fuera de rango`;
        }
      }
      if (s.fillColor !== undefined && typeof s.fillColor !== 'string') {
        return `${prefix}.shapes[${idx}].fillColor debe ser string`;
      }
      if (s.fillOpacity !== undefined && !isInRange(s.fillOpacity, 0, 1)) {
        return `${prefix}.shapes[${idx}].fillOpacity debe estar en [0..1]`;
      }
      break;
    }
  }
  return null;
}

function validateFrame(frame: unknown, prefix: string, opts: { requirePlayers: boolean }): string | null {
  if (!isObject(frame)) return `${prefix} debe ser un objeto`;

  const players = frame.players;
  if (!Array.isArray(players)) return `${prefix}.players debe ser un array`;
  if (opts.requirePlayers) {
    if (players.length < 1 || players.length > 4) {
      return `${prefix}.players debe contener entre 1 y 4 jugadores`;
    }
    const ids = new Set<number>();
    for (const p of players) {
      if (isObject(p) && typeof p.id === 'number') {
        if (ids.has(p.id)) return `${prefix}.players tiene ids duplicados`;
        ids.add(p.id);
      }
    }
  }
  for (let i = 0; i < players.length; i++) {
    const err = validatePlayer(players[i], i, prefix);
    if (err) return err;
  }

  const ballErr = validateBall(frame.ball, prefix);
  if (ballErr) return ballErr;

  if (frame.shapes !== undefined) {
    if (!Array.isArray(frame.shapes)) return `${prefix}.shapes debe ser array`;
    const shapeIds = new Set<string>();
    for (let i = 0; i < frame.shapes.length; i++) {
      const err = validateShape(frame.shapes[i], i, prefix);
      if (err) return err;
      const sid = (frame.shapes[i] as { id: string }).id;
      if (shapeIds.has(sid)) return `${prefix}.shapes tiene ids duplicados (${sid})`;
      shapeIds.add(sid);
    }
  }

  if (frame.duration_ms !== undefined && !isInRange(frame.duration_ms, 100, 5000)) {
    return `${prefix}.duration_ms debe estar entre 100 y 5000 ms`;
  }
  return null;
}

function validateOption(o: unknown, idx: number): string | null {
  if (!isObject(o)) return `options[${idx}] debe ser un objeto`;
  if (o.id !== 1 && o.id !== 2 && o.id !== 3) return `options[${idx}].id debe ser 1, 2 o 3`;
  if (!isNonEmptyString(o.text)) return `options[${idx}].text vacío`;
  if (typeof o.explanation !== 'string') return `options[${idx}].explanation debe ser string`;
  if (typeof o.is_correct !== 'boolean') return `options[${idx}].is_correct debe ser boolean`;
  if (o.badge_position !== undefined && !isCoord(o.badge_position, COURT_W, COURT_H)) {
    return `options[${idx}].badge_position coord inválida`;
  }
  if (o.select_frame !== undefined) {
    const err = validateFrame(o.select_frame, `options[${idx}].select_frame`, { requirePlayers: false });
    if (err) return err;
  }
  if (o.confirmation_frame !== undefined) {
    const err = validateFrame(o.confirmation_frame, `options[${idx}].confirmation_frame`, { requirePlayers: false });
    if (err) return err;
  }
  return null;
}

/**
 * Valida el árbol completo de un puzzle (schema v2).
 * Devuelve `null` si es válido, o un string con el primer error encontrado.
 */
export function validatePuzzleContent(content: unknown): string | null {
  if (!isObject(content)) return 'puzzle.content debe ser un objeto';

  if (content.schema_version !== undefined && content.schema_version !== 2) {
    return 'puzzle.schema_version no soportada (esperado: 2)';
  }

  if (typeof content.statement !== 'string') return 'puzzle.statement debe ser string';
  if (content.statement.trim().length < 8 || content.statement.length > 280) {
    return 'puzzle.statement debe tener entre 8 y 280 caracteres';
  }

  if (content.court_position !== undefined) {
    if (!VALID_COURT_POSITIONS.includes(content.court_position as typeof VALID_COURT_POSITIONS[number])) {
      return `puzzle.court_position debe ser ${VALID_COURT_POSITIONS.join('|')}`;
    }
  }

  const initialErr = validateFrame(content.initial_frame, 'puzzle.initial_frame', { requirePlayers: true });
  if (initialErr) return initialErr;

  if (!Array.isArray(content.options)) return 'puzzle.options debe ser un array';
  if (content.options.length < 2 || content.options.length > 3) {
    return 'puzzle.options debe contener 2 o 3 opciones';
  }

  const optionIds = new Set<number>();
  let correctCount = 0;
  for (let i = 0; i < content.options.length; i++) {
    const opt = content.options[i];
    const err = validateOption(opt, i);
    if (err) return err;
    if (isObject(opt) && typeof opt.id === 'number') {
      if (optionIds.has(opt.id)) return `puzzle.options tiene ids duplicados`;
      optionIds.add(opt.id);
      if (opt.is_correct === true) correctCount++;
    }
  }
  if (correctCount !== 1) {
    return 'puzzle debe tener exactamente 1 opción con is_correct=true';
  }

  return null;
}

/**
 * Construye el row para learning_puzzles a partir del content validado.
 * Asume que validatePuzzleContent ya retornó null para este content.
 */
export function buildPuzzleRow(content: Record<string, unknown>, questionId: string) {
  return {
    question_id: questionId,
    schema_version: (content.schema_version as number) ?? 2,
    statement: content.statement as string,
    court_position: (content.court_position as string) ?? 'both',
    initial_frame: content.initial_frame,
    options: content.options,
  };
}
