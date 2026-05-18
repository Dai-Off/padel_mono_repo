// Validación del árbol jsonb de un puzzle táctico (type='puzzle').
// Schema v2: formato del catálogo importado (kit starter).
//
// API pública:
//   - validatePuzzleContent(content)    → string | null  (primer mensaje, legacy)
//   - validatePuzzleContentAll(content) → PuzzleValidationError[]
//
// Cada error trae:
//   - message: texto en español pensado para el usuario final del editor.
//   - path:    ruta técnica del campo (para navegar al click en el banner).
//   - scope:   meta / intro / initial / opción (+ fase).
//
// El banner del editor decide cuándo mostrar errores (gate por intento de
// publicar). El validador es agnóstico a UX — solo reporta lo que falta.

const COURT_W = 10;
const COURT_H = 20;

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
  scope: PuzzleErrorScope;
  message: string;  // texto en español para el usuario (incluye prefijo).
  path: string;     // ruta técnica del campo. No se muestra; solo nav/debug.
}

// ---------------------------------------------------------------------------
// Helpers
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

function letterFor(optId: 1 | 2 | 3): string {
  return String.fromCharCode(64 + optId);
}

function scopeLabel(scope: PuzzleErrorScope): string {
  switch (scope.kind) {
    case 'meta':    return 'Datos generales';
    case 'intro':   return 'Frame intro';
    case 'initial': return 'Frame inicial';
    case 'option': {
      const letter = letterFor(scope.optionId);
      if (scope.phase === 'select')  return `Opción ${letter} · Selección`;
      if (scope.phase === 'confirm') return `Opción ${letter} · Confirmación`;
      return `Opción ${letter}`;
    }
  }
}

function push(
  errors: PuzzleValidationError[],
  scope: PuzzleErrorScope,
  path: string,
  description: string,
) {
  errors.push({
    scope,
    path,
    message: `${scopeLabel(scope)}: ${description}`,
  });
}

// ---------------------------------------------------------------------------
// Comparación estructural de frames (para detectar duplicados / no-cambio)
// ---------------------------------------------------------------------------

const POS_TOLERANCE = 0.01; // metros

function nearEq(a: number, b: number): boolean {
  return Math.abs(a - b) < POS_TOLERANCE;
}

function coordEq(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (!isObject(a) || !isObject(b)) return false;
  return nearEq(a.x as number, b.x as number) && nearEq(a.y as number, b.y as number);
}

function pointsArrEq(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (typeof a[i] !== 'number' || typeof b[i] !== 'number' || !nearEq(a[i], b[i])) return false;
  }
  return true;
}

function playerEq(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return false;
  if (a.id !== b.id) return false;
  if (a.team !== b.team) return false;
  if (!nearEq(a.x as number, b.x as number)) return false;
  if (!nearEq(a.y as number, b.y as number)) return false;
  if (!!a.is_user !== !!b.is_user) return false;
  if ((a.facing ?? null) !== (b.facing ?? null)) return false;
  if ((a.speech_label ?? '') !== (b.speech_label ?? '')) return false;
  return true;
}

function ballEq(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return false;
  if (!nearEq(a.x as number, b.x as number)) return false;
  if (!nearEq(a.y as number, b.y as number)) return false;
  if ((a.shot_type ?? null) !== (b.shot_type ?? null)) return false;
  if ((a.spin ?? null) !== (b.spin ?? null)) return false;
  return true;
}

function shapeEq(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return false;
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'circle':
      return nearEq(a.x as number, b.x as number) && nearEq(a.y as number, b.y as number) &&
             nearEq(a.radius as number, b.radius as number);
    case 'arrow':
      return coordEq(a.startPoint, b.startPoint) && coordEq(a.endPoint, b.endPoint) &&
             coordEq(a.controlPoint, b.controlPoint);
    case 'rect':
      return nearEq(a.x as number, b.x as number) && nearEq(a.y as number, b.y as number) &&
             nearEq(a.width as number, b.width as number) && nearEq(a.height as number, b.height as number);
    case 'text':
    case 'speechbubble':
      return nearEq(a.x as number, b.x as number) && nearEq(a.y as number, b.y as number) &&
             (a.text ?? '') === (b.text ?? '');
    case 'line':
    case 'triangle':
      return pointsArrEq(a.points, b.points);
  }
  return false;
}

function framesEqual(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return false;
  if (!Array.isArray(a.players) || !Array.isArray(b.players)) return false;
  if (a.players.length !== b.players.length) return false;
  // Comparamos jugadores por matching de id (no por posición en el array).
  const bById = new Map<number, unknown>();
  for (const p of b.players) {
    if (isObject(p) && typeof p.id === 'number') bById.set(p.id, p);
  }
  for (const p of a.players) {
    if (!isObject(p) || typeof p.id !== 'number') return false;
    const m = bById.get(p.id);
    if (!m || !playerEq(p, m)) return false;
  }
  if (!ballEq(a.ball, b.ball)) return false;
  const sa = Array.isArray(a.shapes) ? a.shapes : [];
  const sb = Array.isArray(b.shapes) ? b.shapes : [];
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    if (!shapeEq(sa[i], sb[i])) return false;
  }
  return true;
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
  const num = idx + 1;
  if (!isObject(p)) { push(errors, scope, path, `el jugador ${num} no está bien definido`); return; }
  if (!Number.isInteger(p.id) || (p.id as number) < 1) push(errors, scope, `${path}.id`, `el jugador ${num} no tiene un id válido`);
  if (p.team !== 1 && p.team !== 2) push(errors, scope, `${path}.team`, `el jugador ${num} debe estar en el equipo 1 o 2`);
  if (!isInRange(p.x, 0, COURT_W)) push(errors, scope, `${path}.x`, `el jugador ${num} está fuera de la pista (eje horizontal)`);
  if (!isInRange(p.y, 0, COURT_H)) push(errors, scope, `${path}.y`, `el jugador ${num} está fuera de la pista (eje vertical)`);
  if (p.is_user !== undefined && typeof p.is_user !== 'boolean') {
    push(errors, scope, `${path}.is_user`, `el jugador ${num} tiene un valor inválido en "es el usuario"`);
  }
  if (p.facing !== undefined && !VALID_FACINGS.includes(p.facing as typeof VALID_FACINGS[number])) {
    push(errors, scope, `${path}.facing`, `el jugador ${num} tiene una orientación inválida`);
  }
  if (p.speech_label !== undefined && typeof p.speech_label !== 'string') {
    push(errors, scope, `${path}.speech_label`, `el jugador ${num} tiene un bocadillo inválido`);
  }
}

function validateBall(b: unknown, prefix: string, scope: PuzzleErrorScope, errors: PuzzleValidationError[]): void {
  const path = `${prefix}.ball`;
  if (!isObject(b)) { push(errors, scope, path, 'la pelota no está bien definida'); return; }
  if (!isInRange(b.x, 0, COURT_W)) push(errors, scope, `${path}.x`, 'la pelota está fuera de la pista (eje horizontal)');
  if (!isInRange(b.y, 0, COURT_H)) push(errors, scope, `${path}.y`, 'la pelota está fuera de la pista (eje vertical)');
  if (b.shot_type !== undefined && !VALID_SHOT_TYPES.includes(b.shot_type as typeof VALID_SHOT_TYPES[number])) {
    push(errors, scope, `${path}.shot_type`, 'el tipo de tiro de la pelota no es válido');
  }
  if (b.spin !== undefined && !VALID_SPINS.includes(b.spin as typeof VALID_SPINS[number])) {
    push(errors, scope, `${path}.spin`, 'el spin de la pelota no es válido');
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
  const num = idx + 1;
  if (!isObject(s)) { push(errors, scope, path, `la forma ${num} no es un objeto válido`); return; }
  if (!isNonEmptyString(s.id)) push(errors, scope, `${path}.id`, `la forma ${num} no tiene identificador`);
  if (!VALID_SHAPE_TYPES.includes(s.type as typeof VALID_SHAPE_TYPES[number])) {
    push(errors, scope, `${path}.type`, `la forma ${num} tiene un tipo desconocido`);
    return;
  }
  if (s.color !== undefined && typeof s.color !== 'string') push(errors, scope, `${path}.color`, `la forma ${num} tiene un color inválido`);
  if (s.style !== undefined && !VALID_SHAPE_PRESETS.includes(s.style as typeof VALID_SHAPE_PRESETS[number])) {
    push(errors, scope, `${path}.style`, `la forma ${num} tiene un estilo desconocido`);
  }

  switch (s.type) {
    case 'circle': {
      if (!inCourtTolerant(s.x, COURT_W)) push(errors, scope, `${path}.x`, `la forma ${num} (círculo) está fuera de la pista`);
      if (!inCourtTolerant(s.y, COURT_H)) push(errors, scope, `${path}.y`, `la forma ${num} (círculo) está fuera de la pista`);
      if (!isInRange(s.radius, 0.05, COURT_W)) push(errors, scope, `${path}.radius`, `la forma ${num} (círculo) tiene un radio inválido`);
      break;
    }
    case 'arrow': {
      if (!isCoord(s.startPoint, COURT_W + 0.5, COURT_H + 0.5)) push(errors, scope, `${path}.startPoint`, `la forma ${num} (flecha) tiene un punto inicial fuera de la pista`);
      if (!isCoord(s.endPoint, COURT_W + 0.5, COURT_H + 0.5)) push(errors, scope, `${path}.endPoint`, `la forma ${num} (flecha) tiene un punto final fuera de la pista`);
      if (s.controlPoint !== undefined && !isCoord(s.controlPoint, COURT_W + 0.5, COURT_H + 0.5)) {
        push(errors, scope, `${path}.controlPoint`, `la forma ${num} (flecha) tiene un punto de control inválido`);
      }
      break;
    }
    case 'rect': {
      if (!inCourtTolerant(s.x, COURT_W)) push(errors, scope, `${path}.x`, `la forma ${num} (rectángulo) está fuera de la pista`);
      if (!inCourtTolerant(s.y, COURT_H)) push(errors, scope, `${path}.y`, `la forma ${num} (rectángulo) está fuera de la pista`);
      if (!isInRange(s.width, 0.05, COURT_W)) push(errors, scope, `${path}.width`, `la forma ${num} (rectángulo) tiene un ancho inválido`);
      if (!isInRange(s.height, 0.05, COURT_H)) push(errors, scope, `${path}.height`, `la forma ${num} (rectángulo) tiene un alto inválido`);
      break;
    }
    case 'line': {
      if (!Array.isArray(s.points) || s.points.length < 4 || s.points.length % 2 !== 0) {
        push(errors, scope, `${path}.points`, `la forma ${num} (línea) tiene puntos inválidos`);
      } else {
        for (let i = 0; i < s.points.length; i++) {
          const max = i % 2 === 0 ? COURT_W : COURT_H;
          if (!inCourtTolerant(s.points[i], max)) {
            push(errors, scope, `${path}.points[${i}]`, `la forma ${num} (línea) tiene un punto fuera de la pista`);
          }
        }
      }
      break;
    }
    case 'text':
    case 'speechbubble': {
      const label = s.type === 'text' ? 'texto' : 'bocadillo';
      if (!isNonEmptyString(s.text)) push(errors, scope, `${path}.text`, `el ${label} de la forma ${num} está vacío`);
      if (!inCourtTolerant(s.x, COURT_W)) push(errors, scope, `${path}.x`, `el ${label} de la forma ${num} está fuera de la pista`);
      if (!inCourtTolerant(s.y, COURT_H)) push(errors, scope, `${path}.y`, `el ${label} de la forma ${num} está fuera de la pista`);
      if (s.fontSize !== undefined && !isInRange(s.fontSize, 4, 200)) {
        push(errors, scope, `${path}.fontSize`, `el ${label} de la forma ${num} tiene un tamaño de fuente inválido`);
      }
      break;
    }
    case 'triangle': {
      if (!Array.isArray(s.points) || s.points.length !== 6) {
        push(errors, scope, `${path}.points`, `la forma ${num} (triángulo) tiene puntos inválidos`);
      } else {
        for (let i = 0; i < 6; i++) {
          const max = i % 2 === 0 ? COURT_W : COURT_H;
          if (!inCourtTolerant(s.points[i], max)) {
            push(errors, scope, `${path}.points[${i}]`, `la forma ${num} (triángulo) tiene un punto fuera de la pista`);
          }
        }
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
  if (!isObject(frame)) { push(errors, scope, prefix, 'el frame no está bien definido'); return; }

  const players = frame.players;
  if (!Array.isArray(players)) {
    push(errors, scope, `${prefix}.players`, 'la lista de jugadores no es un array');
  } else {
    if (opts.requirePlayers && (players.length < 1 || players.length > 4)) {
      push(errors, scope, `${prefix}.players`, 'debe haber entre 1 y 4 jugadores');
    }
    if (opts.requirePlayers) {
      const ids = new Set<number>();
      for (const p of players) {
        if (isObject(p) && typeof p.id === 'number') {
          if (ids.has(p.id)) {
            push(errors, scope, `${prefix}.players`, 'hay jugadores con id repetido');
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
      push(errors, scope, `${prefix}.shapes`, 'la lista de formas no es un array');
    } else {
      const shapeIds = new Set<string>();
      for (let i = 0; i < frame.shapes.length; i++) {
        validateShape(frame.shapes[i], i, prefix, scope, errors);
        const sid = (frame.shapes[i] as { id?: string })?.id;
        if (typeof sid === 'string' && sid) {
          if (shapeIds.has(sid)) push(errors, scope, `${prefix}.shapes`, `hay formas con id repetido (${sid})`);
          shapeIds.add(sid);
        }
      }
    }
  }

  if (frame.duration_ms !== undefined && !isInRange(frame.duration_ms, 100, 5000)) {
    push(errors, scope, `${prefix}.duration_ms`, 'la duración del frame debe estar entre 100 y 5000 ms');
  }
  if (frame.auto_trajectory !== undefined && typeof frame.auto_trajectory !== 'boolean') {
    push(errors, scope, `${prefix}.auto_trajectory`, 'la auto-trayectoria debe ser sí o no');
  }
}

function validateOption(o: unknown, idx: number, errors: PuzzleValidationError[]): void {
  const metaScope: PuzzleErrorScope = { kind: 'meta' };
  const path = `puzzle.options[${idx}]`;
  if (!isObject(o)) { push(errors, metaScope, path, `la opción ${idx + 1} no es un objeto válido`); return; }

  const optId = (o.id === 1 || o.id === 2 || o.id === 3) ? (o.id as 1 | 2 | 3) : null;
  const optScope: PuzzleErrorScope = optId ? { kind: 'option', optionId: optId } : metaScope;
  const letter = optId ? letterFor(optId) : `#${idx + 1}`;

  if (optId == null) push(errors, metaScope, `${path}.id`, `la opción ${idx + 1} no tiene id válido (debe ser 1, 2 o 3)`);
  if (!isNonEmptyString(o.text)) push(errors, optScope, `${path}.text`, `falta el texto de la opción ${letter}`);
  if (typeof o.explanation !== 'string') {
    push(errors, optScope, `${path}.explanation`, `la explicación de la opción ${letter} tiene un valor inválido`);
  } else if (o.explanation.trim().length === 0) {
    push(errors, optScope, `${path}.explanation`, `falta la explicación de la opción ${letter}`);
  }
  if (typeof o.is_correct !== 'boolean') push(errors, optScope, `${path}.is_correct`, `la opción ${letter} no indica si es correcta o no`);
  if (o.badge_position !== undefined && !isCoord(o.badge_position, COURT_W, COURT_H)) {
    push(errors, optScope, `${path}.badge_position`, `la posición del badge de la opción ${letter} es inválida`);
  }

  // Frames de selección y confirmación son OBLIGATORIOS al publicar. Sin ellos
  // el visor cae al initial_frame y al pulsar la opción no pasa nada visible.
  if (o.select_frame == null) {
    const scope: PuzzleErrorScope = optId
      ? { kind: 'option', optionId: optId, phase: 'select' }
      : metaScope;
    push(errors, scope, `${path}.select_frame`, `falta el frame de Selección de la opción ${letter}`);
  } else {
    const selScope: PuzzleErrorScope = optId ? { kind: 'option', optionId: optId, phase: 'select' } : metaScope;
    validateFrame(o.select_frame, `${path}.select_frame`, selScope, { requirePlayers: false }, errors);
  }
  if (o.confirmation_frame == null) {
    const scope: PuzzleErrorScope = optId
      ? { kind: 'option', optionId: optId, phase: 'confirm' }
      : metaScope;
    push(errors, scope, `${path}.confirmation_frame`, `falta el frame de Confirmación de la opción ${letter}`);
  } else {
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
    errors.push({ scope: meta, message: 'Datos generales: el puzzle no está bien definido', path: 'puzzle' });
    return errors;
  }

  if (content.schema_version !== undefined && content.schema_version !== 2) {
    push(errors, meta, 'puzzle.schema_version', 'la versión del esquema no está soportada (esperada: 2)');
  }

  // Enunciado: vacío/ausente o fuera de rango. El banner solo aparece tras el
  // primer intento de publicar (gate en QuestionFormModal), así que aquí ya no
  // hace falta diferenciar live vs publish-only.
  if (typeof content.statement !== 'string' || content.statement.trim().length === 0) {
    push(errors, meta, 'puzzle.statement', 'falta el enunciado');
  } else if (content.statement.trim().length < 8 || content.statement.length > 280) {
    push(errors, meta, 'puzzle.statement', 'el enunciado debe tener entre 8 y 280 caracteres');
  }

  // intro_frame: opcional. null y undefined son válidos.
  if (content.intro_frame != null) {
    validateFrame(content.intro_frame, 'puzzle.intro_frame', { kind: 'intro' }, { requirePlayers: true }, errors);
  }

  // initial_frame: obligatorio.
  validateFrame(content.initial_frame, 'puzzle.initial_frame', { kind: 'initial' }, { requirePlayers: true }, errors);

  if (!Array.isArray(content.options)) {
    push(errors, meta, 'puzzle.options', 'el puzzle debe tener al menos 2 opciones');
  } else {
    if (content.options.length < 2 || content.options.length > 3) {
      push(errors, meta, 'puzzle.options', 'el puzzle debe tener 2 o 3 opciones');
    }
    const optionIds = new Set<number>();
    let correctCount = 0;
    for (let i = 0; i < content.options.length; i++) {
      const opt = content.options[i];
      validateOption(opt, i, errors);
      if (isObject(opt) && typeof opt.id === 'number') {
        if (optionIds.has(opt.id)) push(errors, meta, 'puzzle.options', 'hay opciones con id repetido');
        optionIds.add(opt.id);
        if (opt.is_correct === true) correctCount++;
      }
    }
    if (correctCount !== 1) {
      push(errors, meta, 'puzzle.options', `debe haber exactamente 1 opción correcta (hay ${correctCount})`);
    }

    // --- Reglas cruzadas entre opciones y vs initial_frame ---

    // Textos duplicados entre opciones (case-insensitive, sin espacios extra).
    type TextEntry = { text: string; letter: string };
    const texts: TextEntry[] = [];
    for (let i = 0; i < content.options.length; i++) {
      const opt = content.options[i];
      if (!isObject(opt)) continue;
      const id = (opt.id === 1 || opt.id === 2 || opt.id === 3) ? (opt.id as 1|2|3) : null;
      const letter = id ? letterFor(id) : `#${i+1}`;
      if (typeof opt.text === 'string' && opt.text.trim()) {
        texts.push({ text: opt.text.trim().toLowerCase(), letter });
      }
    }
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        if (texts[i].text === texts[j].text) {
          push(errors, meta, 'puzzle.options', `las opciones ${texts[i].letter} y ${texts[j].letter} tienen el mismo texto`);
        }
      }
    }

    // Frame equality: select == initial / confirmation == select / pares entre opciones.
    const initialFrame = content.initial_frame;
    for (let i = 0; i < content.options.length; i++) {
      const opt = content.options[i];
      if (!isObject(opt)) continue;
      const id = (opt.id === 1 || opt.id === 2 || opt.id === 3) ? (opt.id as 1|2|3) : null;
      if (!id) continue;
      const letter = letterFor(id);
      if (opt.select_frame != null && framesEqual(opt.select_frame, initialFrame)) {
        push(errors, { kind: 'option', optionId: id, phase: 'select' },
          `puzzle.options[${i}].select_frame`,
          `el frame de Selección de la opción ${letter} es igual al inicial (no aporta cambio visual al elegirla)`);
      }
      if (opt.select_frame != null && opt.confirmation_frame != null &&
          framesEqual(opt.select_frame, opt.confirmation_frame)) {
        push(errors, { kind: 'option', optionId: id, phase: 'confirm' },
          `puzzle.options[${i}].confirmation_frame`,
          `el frame de Confirmación de la opción ${letter} es igual al de Selección (no hay animación al confirmar)`);
      }
    }
    for (let i = 0; i < content.options.length; i++) {
      for (let j = i + 1; j < content.options.length; j++) {
        const a = content.options[i];
        const b = content.options[j];
        if (!isObject(a) || !isObject(b)) continue;
        const ai = (a.id === 1 || a.id === 2 || a.id === 3) ? (a.id as 1|2|3) : null;
        const bj = (b.id === 1 || b.id === 2 || b.id === 3) ? (b.id as 1|2|3) : null;
        if (!ai || !bj) continue;
        if (a.select_frame != null && b.select_frame != null && framesEqual(a.select_frame, b.select_frame)) {
          push(errors, meta, 'puzzle.options',
            `las opciones ${letterFor(ai)} y ${letterFor(bj)} tienen el mismo frame de Selección`);
        }
        if (a.confirmation_frame != null && b.confirmation_frame != null &&
            framesEqual(a.confirmation_frame, b.confirmation_frame)) {
          push(errors, meta, 'puzzle.options',
            `las opciones ${letterFor(ai)} y ${letterFor(bj)} tienen el mismo frame de Confirmación`);
        }
      }
    }
  }

  return errors;
}

/**
 * Wrapper legacy: devuelve `null` si es válido, o el mensaje del primer error.
 * Mantener para no romper los handlers POST/PUT que esperan string|null.
 */
export function validatePuzzleContent(content: unknown): string | null {
  const errors = validatePuzzleContentAll(content);
  return errors[0]?.message ?? null;
}

/**
 * Construye el row para learning_puzzles a partir del content.
 * Tolerante a campos faltantes para soportar borradores. Sin `court_position`
 * (campo eliminado, ver migración 059_learning_puzzles.sql).
 */
export function buildPuzzleRow(content: Record<string, unknown>, questionId: string) {
  const initialFrame = isObject(content.initial_frame)
    ? content.initial_frame
    : { players: [], ball: { x: 5, y: 10 } };
  return {
    question_id: questionId,
    schema_version: typeof content.schema_version === 'number' ? content.schema_version : 2,
    statement: typeof content.statement === 'string' ? content.statement : '',
    intro_frame: content.intro_frame ?? null,
    initial_frame: initialFrame,
    options: Array.isArray(content.options) ? content.options : [],
  };
}
