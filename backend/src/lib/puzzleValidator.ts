// Validación del árbol jsonb de un puzzle táctico (type='puzzle').
// Reglas en docs/learning/Puzzles/IMPLEMENTATION_PLAN.md §1.

const COURT_W = 10;
const COURT_H = 20;

const VALID_COURT_POSITIONS = ['left', 'right', 'both'] as const;
const VALID_SHOT_TYPES = ['lob', 'chiquita'] as const;
const VALID_SPINS = ['clockwise', 'counter-clockwise', 'random'] as const;
const VALID_FACINGS = ['face', 'back'] as const;
const VALID_SHAPE_TYPES = ['arrow', 'circle', 'rect', 'triangle', 'text_tag'] as const;

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

function validatePlayer(p: unknown, idx: number, prefix: string): string | null {
  if (!isObject(p)) return `${prefix}.players[${idx}] debe ser un objeto`;
  if (!Number.isInteger(p.id) || (p.id as number) < 1) return `${prefix}.players[${idx}].id debe ser entero >= 1`;
  if (p.team !== 1 && p.team !== 2) return `${prefix}.players[${idx}].team debe ser 1 o 2`;
  if (!isInRange(p.x, 0, COURT_W)) return `${prefix}.players[${idx}].x fuera de rango [0..${COURT_W}]`;
  if (!isInRange(p.y, 0, COURT_H)) return `${prefix}.players[${idx}].y fuera de rango [0..${COURT_H}]`;
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
    return `${prefix}.ball.shot_type debe ser ${VALID_SHOT_TYPES.join('|')}`;
  }
  if (b.spin !== undefined && !VALID_SPINS.includes(b.spin as typeof VALID_SPINS[number])) {
    return `${prefix}.ball.spin debe ser ${VALID_SPINS.join('|')}`;
  }
  return null;
}

function validateShape(s: unknown, idx: number, prefix: string): string | null {
  if (!isObject(s)) return `${prefix}.shapes[${idx}] debe ser un objeto`;
  if (!Number.isInteger(s.id)) return `${prefix}.shapes[${idx}].id debe ser entero`;
  if (!VALID_SHAPE_TYPES.includes(s.type as typeof VALID_SHAPE_TYPES[number])) {
    return `${prefix}.shapes[${idx}].type debe ser ${VALID_SHAPE_TYPES.join('|')}`;
  }
  if (s.color !== undefined && typeof s.color !== 'string') {
    return `${prefix}.shapes[${idx}].color debe ser string`;
  }
  switch (s.type) {
    case 'arrow':
      if (!isCoord(s.start, COURT_W, COURT_H)) return `${prefix}.shapes[${idx}].start coord inválida`;
      if (!isCoord(s.end, COURT_W, COURT_H)) return `${prefix}.shapes[${idx}].end coord inválida`;
      if (s.control !== undefined && !isCoord(s.control, COURT_W, COURT_H)) {
        return `${prefix}.shapes[${idx}].control coord inválida`;
      }
      break;
    case 'circle':
      if (!isInRange(s.cx, 0, COURT_W)) return `${prefix}.shapes[${idx}].cx fuera de rango`;
      if (!isInRange(s.cy, 0, COURT_H)) return `${prefix}.shapes[${idx}].cy fuera de rango`;
      if (!isInRange(s.r, 0.05, COURT_W)) return `${prefix}.shapes[${idx}].r fuera de rango`;
      break;
    case 'rect':
      if (!isInRange(s.x, 0, COURT_W)) return `${prefix}.shapes[${idx}].x fuera de rango`;
      if (!isInRange(s.y, 0, COURT_H)) return `${prefix}.shapes[${idx}].y fuera de rango`;
      if (!isInRange(s.w, 0.05, COURT_W)) return `${prefix}.shapes[${idx}].w fuera de rango`;
      if (!isInRange(s.h, 0.05, COURT_H)) return `${prefix}.shapes[${idx}].h fuera de rango`;
      break;
    case 'triangle':
      if (!Array.isArray(s.points) || s.points.length !== 6) {
        return `${prefix}.shapes[${idx}].points debe tener 6 números`;
      }
      for (let i = 0; i < 6; i++) {
        const max = i % 2 === 0 ? COURT_W : COURT_H;
        if (!isInRange(s.points[i], 0, max)) {
          return `${prefix}.shapes[${idx}].points[${i}] fuera de rango`;
        }
      }
      break;
    case 'text_tag':
      if (!isNonEmptyString(s.text)) return `${prefix}.shapes[${idx}].text vacío`;
      if (!isInRange(s.x, 0, COURT_W)) return `${prefix}.shapes[${idx}].x fuera de rango`;
      if (!isInRange(s.y, 0, COURT_H)) return `${prefix}.shapes[${idx}].y fuera de rango`;
      break;
  }
  return null;
}

function validateFrame(frame: unknown, prefix: string, opts: { requirePlayers: boolean }): string | null {
  if (!isObject(frame)) return `${prefix} debe ser un objeto`;

  const players = frame.players;
  if (!Array.isArray(players)) return `${prefix}.players debe ser un array`;
  if (opts.requirePlayers) {
    if (players.length < 2 || players.length > 4) {
      return `${prefix}.players debe contener entre 2 y 4 jugadores`;
    }
    const teams = new Set(players.map((p: unknown) => isObject(p) ? p.team : null));
    if (!teams.has(1) || !teams.has(2)) {
      return `${prefix}.players debe incluir al menos 1 jugador de cada equipo (team=1 y team=2)`;
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
    for (let i = 0; i < frame.shapes.length; i++) {
      const err = validateShape(frame.shapes[i], i, prefix);
      if (err) return err;
    }
  }
  return null;
}

function validateOption(o: unknown, idx: number): string | null {
  if (!isObject(o)) return `options[${idx}] debe ser un objeto`;
  if (o.id !== 1 && o.id !== 2 && o.id !== 3) return `options[${idx}].id debe ser 1, 2 o 3`;
  if (!isNonEmptyString(o.text)) return `options[${idx}].text vacío`;
  if (typeof o.explanation !== 'string') return `options[${idx}].explanation debe ser string`;
  if (o.points !== 0 && o.points !== 1 && o.points !== 2) {
    return `options[${idx}].points debe ser 0, 1 o 2`;
  }
  if (o.badge_position !== undefined && !isCoord(o.badge_position, COURT_W, COURT_H)) {
    return `options[${idx}].badge_position coord inválida`;
  }
  if (o.reveal_frame !== undefined) {
    const err = validateFrame(o.reveal_frame, `options[${idx}].reveal_frame`, { requirePlayers: false });
    if (err) return err;
    if (isObject(o.reveal_frame) && o.reveal_frame.duration_ms !== undefined) {
      if (!isInRange(o.reveal_frame.duration_ms, 100, 5000)) {
        return `options[${idx}].reveal_frame.duration_ms debe estar entre 100 y 5000 ms`;
      }
    }
  }
  return null;
}

/**
 * Valida el árbol completo de un puzzle.
 * El payload corresponde al cuerpo que el editor envía al backend cuando type='puzzle'.
 * Devuelve `null` si es válido, o un string con el primer error encontrado.
 */
export function validatePuzzleContent(content: unknown): string | null {
  if (!isObject(content)) return 'puzzle.content debe ser un objeto';

  if (content.schema_version !== undefined && content.schema_version !== 1) {
    return 'puzzle.schema_version no soportada (esperado: 1)';
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

  if (content.general_explanation !== undefined && typeof content.general_explanation !== 'string') {
    return 'puzzle.general_explanation debe ser string';
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
      if (opt.points === 2) correctCount++;
    }
  }
  if (correctCount !== 1) {
    return 'puzzle debe tener exactamente 1 opción con points=2 (correcta)';
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
    schema_version: (content.schema_version as number) ?? 1,
    statement: content.statement as string,
    court_position: (content.court_position as string) ?? 'both',
    general_explanation: (content.general_explanation as string) ?? null,
    initial_frame: content.initial_frame,
    options: content.options,
  };
}
