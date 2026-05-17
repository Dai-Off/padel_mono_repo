import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, RotateCcw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { PuzzleStage, type SelectedItem } from './PuzzleStage';
import { MetaPanel } from './panels/MetaPanel';
import { OptionPanel } from './panels/OptionPanel';
import { MainTabs, type MainTabKey } from './panels/MainTabs';
import { PhaseTabs, type Phase } from './panels/PhaseTabs';
import { InitialPhaseTabs, type InitialSubTab } from './panels/InitialPhaseTabs';
import { RevealFramePanel } from './panels/RevealFramePanel';
import { ShapesToolbar } from './panels/ShapesToolbar';
import { createShape, type ShapeType } from './lib/shapeFactory';
import { ShapeInspector } from './panels/ShapeInspector';
import { PlayerInspector } from './panels/PlayerInspector';
import { BallInspector } from './panels/BallInspector';
import { PuzzlePlayer } from './PuzzlePlayer';
import { cloneFrame, interpolateFrames, type ActiveFrameKey } from './lib/frames';
import { validatePuzzleContentAll, type PuzzleErrorScope, type PuzzleValidationError } from '../../../../lib/puzzleValidator';
import type {
  PuzzleBall,
  PuzzleContent,
  PuzzleFrame,
  PuzzleOption,
  PuzzlePlayer as PuzzlePlayerType,
  PuzzleShape,
} from '../../../../types/learningContent';

interface Props {
  content: PuzzleContent;
  onChange: (next: PuzzleContent) => void;
  // Si true, el banner de validación y los puntos rojos en tabs aparecen. El
  // padre (QuestionFormModal) lo activa tras el primer intento fallido de
  // publicar. Mientras es false, la UI es silenciosa y el usuario edita en paz.
  showErrors?: boolean;
}

// Renumera los ids de las opciones a 1..N por posición en el array. Mantiene
// el resto de campos (text, frames, badge_position) intactos. Esto garantiza
// que la letra A/B/C derivada (`String.fromCharCode(64 + opt.id)`) coincide
// siempre con la posición visible y no quedan huecos tras borrar.
function renumberOptions(options: PuzzleOption[]): PuzzleOption[] {
  return options.map((o, i) => ({ ...o, id: (i + 1) as 1 | 2 | 3 }));
}

export function PuzzleEditor({ content, onChange: onChangeRaw, showErrors = false }: Props) {
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [mainTab, setMainTab] = useState<MainTabKey>('initial');
  const [phaseTab, setPhaseTab] = useState<Phase>('select');
  const [initialSubTab, setInitialSubTab] = useState<InitialSubTab>('static');
  const [showPlayer, setShowPlayer] = useState(false);
  const [drawingType, setDrawingType] = useState<ShapeType | null>(null);

  // ───── Undo / Redo ─────
  // Historial de contenidos previos. Cada onChange push el `content` actual al
  // historial antes de aplicar el nuevo. Undo restaura el último.
  const pastRef = useRef<PuzzleContent[]>([]);
  const futureRef = useRef<PuzzleContent[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const onChange = useCallback((next: PuzzleContent) => {
    pastRef.current = [...pastRef.current, content].slice(-100);
    futureRef.current = [];
    onChangeRaw(next);
    setHistoryVersion((v) => v + 1);
  }, [content, onChangeRaw]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [content, ...futureRef.current];
    onChangeRaw(prev);
    setSelected(null);
    setHistoryVersion((v) => v + 1);
  }, [content, onChangeRaw]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, content].slice(-100);
    onChangeRaw(next);
    setSelected(null);
    setHistoryVersion((v) => v + 1);
  }, [content, onChangeRaw]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  void historyVersion;

  // Esc cancela el modo dibujo. Supr/Backspace borra la shape seleccionada.
  // Ctrl+Z deshace, Ctrl+Shift+Z (o Ctrl+Y) rehace.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (e.key === 'Escape') {
        if (drawingType) setDrawingType(null);
        else setSelected(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !inInput) {
        e.preventDefault();
        undo();
        return;
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !inInput) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z' && !inInput)
      ) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected?.kind === 'shape') {
        if (inInput) return;
        e.preventDefault();
        removeShape(selected.id);
      }
      // ───── Flechas: mover elemento seleccionado ─────
      // Step 0.1m por defecto, 0.5m con Shift. Clamp a la pista [0..10] × [0..20].
      // Funciona para shape / player / ball cuando hay algo seleccionado.
      if (!inInput && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (!selected) return;
        const step = e.shiftKey ? 0.5 : 0.1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        if (dx === 0 && dy === 0) return;
        e.preventDefault();
        const frame = getActiveFrame();
        if (!frame) return;
        const clampX = (v: number) => Math.max(0, Math.min(10, v));
        const clampY = (v: number) => Math.max(0, Math.min(20, v));
        if (selected.kind === 'player') {
          const p = frame.players.find((pp) => pp.id === selected.id);
          if (!p) return;
          updatePlayer({ ...p, x: clampX(p.x + dx), y: clampY(p.y + dy) });
          return;
        }
        if (selected.kind === 'ball') {
          updateBall({ ...frame.ball, x: clampX(frame.ball.x + dx), y: clampY(frame.ball.y + dy) });
          return;
        }
        if (selected.kind === 'shape') {
          const s = (frame.shapes ?? []).find((sh) => sh.id === selected.id);
          if (!s) return;
          // El delta se aplica a las coordenadas movibles según el tipo. Para
          // arrow movemos los 3 puntos para mover la flecha entera. Para line
          // y triangle desplazamos todo el array de puntos.
          let next: PuzzleShape;
          switch (s.type) {
            case 'circle':
            case 'rect':
            case 'text':
            case 'speechbubble':
              next = { ...s, x: clampX(s.x + dx), y: clampY(s.y + dy) } as PuzzleShape;
              break;
            case 'arrow':
              next = {
                ...s,
                startPoint: { x: clampX(s.startPoint.x + dx), y: clampY(s.startPoint.y + dy) },
                endPoint: { x: clampX(s.endPoint.x + dx), y: clampY(s.endPoint.y + dy) },
                controlPoint: s.controlPoint
                  ? { x: clampX(s.controlPoint.x + dx), y: clampY(s.controlPoint.y + dy) }
                  : s.controlPoint,
              } as PuzzleShape;
              break;
            case 'line':
            case 'triangle': {
              const pts = s.points.map((v, i) => (i % 2 === 0 ? clampX(v + dx) : clampY(v + dy)));
              next = { ...s, points: pts } as PuzzleShape;
              break;
            }
            default:
              return;
          }
          updateShape(next);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingType, selected, undo, redo, content, mainTab, phaseTab, initialSubTab]);

  // Preview animado del editor (contextual): anima desde el frame anterior
  // lógico hasta el activo.
  const [previewFrame, setPreviewFrame] = useState<PuzzleFrame | null>(null);
  const [previewProgress, setPreviewProgress] = useState(1);
  const previewRafRef = useRef<number | null>(null);

  // Limpieza al desmontar.
  useEffect(() => () => {
    if (previewRafRef.current != null) cancelAnimationFrame(previewRafRef.current);
  }, []);

  // ───── Derivar activeFrame (frame que se está editando) ─────
  const activeFrame: ActiveFrameKey =
    mainTab === 'initial' ? 'initial' : { optionId: mainTab, phase: phaseTab };

  // Si la phase activa de la opción no existe, ajustamos automáticamente.
  useEffect(() => {
    if (mainTab === 'initial') return;
    const opt = content.options.find((o) => o.id === mainTab);
    if (!opt) {
      setMainTab('initial');
      return;
    }
    const hasSelect = !!opt.select_frame;
    const hasConfirm = !!opt.confirmation_frame;
    // Si la opción no tiene NINGÚN frame, siempre se debe crear primero el de
    // selección. Forzamos phaseTab='select' para que el mensaje central y el
    // botón "+ Crear" reflejen esa primera fase y no la de confirmación.
    if (!hasSelect && !hasConfirm) {
      if (phaseTab !== 'select') setPhaseTab('select');
      return;
    }
    // Si la phase activa no existe pero la otra sí, saltar a la que existe.
    const hasPhase = phaseTab === 'select' ? hasSelect : hasConfirm;
    if (!hasPhase) {
      const other: Phase = phaseTab === 'select' ? 'confirm' : 'select';
      const hasOther = other === 'select' ? hasSelect : hasConfirm;
      if (hasOther) setPhaseTab(other);
    }
  }, [content.options, mainTab, phaseTab]);

  // ───── Helpers para escribir en el frame activo ─────

  const getActiveFrame = (): PuzzleFrame | null => {
    if (activeFrame === 'initial') {
      if (initialSubTab === 'intro') return content.intro_frame ?? null;
      return content.initial_frame;
    }
    const opt = content.options.find((o) => o.id === activeFrame.optionId);
    if (!opt) return null;
    return activeFrame.phase === 'select' ? opt.select_frame ?? null : opt.confirmation_frame ?? null;
  };

  const writeActiveFrame = (mut: (f: PuzzleFrame) => PuzzleFrame) => {
    if (activeFrame === 'initial') {
      if (initialSubTab === 'intro' && content.intro_frame) {
        onChange({ ...content, intro_frame: mut(content.intro_frame) });
      } else {
        onChange({ ...content, initial_frame: mut(content.initial_frame) });
      }
      return;
    }
    const { optionId, phase } = activeFrame;
    onChange({
      ...content,
      options: content.options.map((o) => {
        if (o.id !== optionId) return o;
        if (phase === 'select' && o.select_frame) {
          return { ...o, select_frame: mut(o.select_frame) };
        }
        if (phase === 'confirm' && o.confirmation_frame) {
          return { ...o, confirmation_frame: mut(o.confirmation_frame) };
        }
        return o;
      }),
    });
  };

  const updatePlayer = (next: PuzzlePlayerType) => {
    writeActiveFrame((f) => ({
      ...f,
      players: f.players.map((p) => {
        if (p.id === next.id) return next;
        // is_user es excluyente: si el nuevo es is_user, desmarcar a los demás.
        if (next.is_user && p.is_user) return { ...p, is_user: undefined };
        return p;
      }),
    }));
  };

  const updateBall = (next: PuzzleBall) => {
    writeActiveFrame((f) => ({ ...f, ball: next }));
  };

  // ───── Shapes ─────

  const addShape = (shape: PuzzleShape) => {
    writeActiveFrame((f) => ({ ...f, shapes: [...(f.shapes ?? []), shape] }));
    setSelected({ kind: 'shape', id: shape.id });
  };
  const removeShape = (id: string) => {
    writeActiveFrame((f) => ({ ...f, shapes: (f.shapes ?? []).filter((s) => s.id !== id) }));
    if (selected?.kind === 'shape' && selected.id === id) setSelected(null);
  };
  const updateShape = (next: PuzzleShape) => {
    writeActiveFrame((f) => ({
      ...f,
      shapes: (f.shapes ?? []).map((s) => (s.id === next.id ? next : s)),
    }));
  };

  // ───── Copiar shape a frame anterior/siguiente ─────
  // Frame anterior: select → initial; confirm → select.
  // Frame siguiente: initial → select de la opción activa (si existe); select → confirm.
  // Devuelve una descripción del frame destino o null si no aplica.
  type FrameRef = 'initial' | { optionId: 1 | 2 | 3; phase: Phase };

  const getNeighborFrame = (dir: 'prev' | 'next'): FrameRef | null => {
    if (mainTab === 'initial') {
      if (dir === 'prev') return null;
      // Siguiente desde initial: no claro a qué opción, deshabilitar por simplicidad.
      return null;
    }
    if (phaseTab === 'select') {
      if (dir === 'prev') return 'initial';
      // siguiente = confirm de la misma opción.
      return { optionId: mainTab, phase: 'confirm' };
    }
    // phaseTab === 'confirm'
    if (dir === 'prev') return { optionId: mainTab, phase: 'select' };
    return null;
  };

  const frameExists = (ref: FrameRef): boolean => {
    if (ref === 'initial') return true;
    const opt = content.options.find((o) => o.id === ref.optionId);
    if (!opt) return false;
    return ref.phase === 'select' ? !!opt.select_frame : !!opt.confirmation_frame;
  };

  // ───── Frame anterior lógico al activo (para auto-trajectory) ─────
  const getPrevFrame = (): PuzzleFrame | null => {
    if (mainTab === 'initial') {
      // Si estamos en static y existe intro, el "anterior" es intro.
      if (initialSubTab === 'static' && content.intro_frame) return content.intro_frame;
      return null;
    }
    if (phaseTab === 'select') return content.initial_frame;
    const opt = content.options.find((o) => o.id === mainTab);
    return opt?.select_frame ?? content.initial_frame;
  };

  // ───── Reset frame entero al estado del anterior ─────
  // En select → copia todo el initial.
  // En confirm → copia todo el select de la misma opción.
  // En initial → no aplica.
  const resetFrameFromPrev = () => {
    if (mainTab === 'initial') return;
    const prev = getNeighborFrame('prev');
    if (!prev || !frameExists(prev)) return;
    const sourceFrame: PuzzleFrame | undefined = prev === 'initial'
      ? content.initial_frame
      : prev.phase === 'select'
        ? content.options.find((o) => o.id === prev.optionId)?.select_frame
        : content.options.find((o) => o.id === prev.optionId)?.confirmation_frame;
    if (!sourceFrame) return;
    const cloned = cloneFrame(sourceFrame);
    writeActiveFrame(() => cloned);
    setSelected(null);
  };

  // ───── Reset shape concreta al estado del frame anterior ─────
  // Busca la misma shape (por id) en el frame anterior y restaura sus datos.
  const resetShapeFromPrev = (shape: PuzzleShape) => {
    if (mainTab === 'initial') return;
    const prev = getNeighborFrame('prev');
    if (!prev || !frameExists(prev)) return;
    const sourceFrame: PuzzleFrame | undefined = prev === 'initial'
      ? content.initial_frame
      : prev.phase === 'select'
        ? content.options.find((o) => o.id === prev.optionId)?.select_frame
        : content.options.find((o) => o.id === prev.optionId)?.confirmation_frame;
    if (!sourceFrame) return;
    const sourceShape = (sourceFrame.shapes ?? []).find((s) => s.id === shape.id);
    if (!sourceShape) return;
    updateShape(sourceShape);
  };

  // Helper: obtiene el frame anterior real (objeto), no la referencia.
  const getPrevFrameObj = (): PuzzleFrame | null => {
    if (mainTab === 'initial') {
      // En sub-tab estático, el anterior lógico es el intro (si existe).
      if (initialSubTab === 'static' && content.intro_frame) return content.intro_frame;
      return null;
    }
    const prev = getNeighborFrame('prev');
    if (!prev || !frameExists(prev)) return null;
    if (prev === 'initial') return content.initial_frame;
    return prev.phase === 'select'
      ? content.options.find((o) => o.id === prev.optionId)?.select_frame ?? null
      : content.options.find((o) => o.id === prev.optionId)?.confirmation_frame ?? null;
  };

  // ───── Reset posición de player/ball al estado del frame anterior ─────
  const resetPlayerFromPrev = (player: PuzzlePlayerType) => {
    const sourceFrame = getPrevFrameObj();
    if (!sourceFrame) return;
    const sourcePlayer = sourceFrame.players.find((p) => p.id === player.id);
    if (!sourcePlayer) return;
    // Solo restauramos posición x/y. El resto de campos (team, is_user,
    // speech_label, facing) los gestiona el usuario explícitamente.
    updatePlayer({ ...player, x: sourcePlayer.x, y: sourcePlayer.y });
  };

  const resetBallFromPrev = () => {
    const sourceFrame = getPrevFrameObj();
    if (!sourceFrame?.ball) return;
    updateBall({ ...sourceFrame.ball });
  };

  // ───── Añadir bocadillo sobre un jugador ─────
  // Sustituye al antiguo campo `speech_label` del player. Crea una shape
  // speechbubble posicionada justo encima del jugador, editable como cualquier
  // otra shape (mover, redimensionar, cambiar texto).
  const addSpeechBubbleForPlayer = (player: PuzzlePlayerType) => {
    const base = createShape('speechbubble');
    const bubble: PuzzleShape = {
      ...base,
      x: player.x,
      y: Math.max(0, player.y - 1.2),
      text: 'Mine!',
    } as PuzzleShape;
    addShape(bubble);
  };

  // ───── Migración suave: speech_label legacy → shape speechbubble ─────
  // Si el puzzle viene de BD con players que tienen `speech_label`, generamos
  // los shapes equivalentes y limpiamos el campo. Se aplica una sola vez al
  // montar para no luchar contra ediciones posteriores del usuario.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    let changed = false;
    const migrateFrame = (frame: PuzzleFrame): PuzzleFrame => {
      const newShapes: PuzzleShape[] = [];
      const newPlayers = frame.players.map((p) => {
        const label = p.speech_label?.trim();
        if (!label) return p;
        changed = true;
        const base = createShape('speechbubble');
        newShapes.push({
          ...base,
          x: p.x,
          y: Math.max(0, p.y - 1.2),
          text: label,
        } as PuzzleShape);
        return { ...p, speech_label: undefined };
      });
      if (newShapes.length === 0) return frame;
      return {
        ...frame,
        players: newPlayers,
        shapes: [...(frame.shapes ?? []), ...newShapes],
      };
    };
    const migrated: PuzzleContent = {
      ...content,
      initial_frame: migrateFrame(content.initial_frame),
      intro_frame: content.intro_frame ? migrateFrame(content.intro_frame) : content.intro_frame,
      options: content.options.map((o) => ({
        ...o,
        select_frame: o.select_frame ? migrateFrame(o.select_frame) : o.select_frame,
        confirmation_frame: o.confirmation_frame ? migrateFrame(o.confirmation_frame) : o.confirmation_frame,
      })),
    };
    // Se hace via onChangeRaw para que no se cuente como acción del usuario
    // en el historial de undo.
    if (changed) onChangeRaw(migrated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyShapeToFrame = (shape: PuzzleShape, target: FrameRef) => {
    // Generar un nuevo id para evitar colisión.
    const cloned: PuzzleShape = { ...shape, id: shape.id + '-c' + Math.random().toString(36).slice(2, 6) } as PuzzleShape;
    if (target === 'initial') {
      onChange({
        ...content,
        initial_frame: {
          ...content.initial_frame,
          shapes: [...(content.initial_frame.shapes ?? []), cloned],
        },
      });
      return;
    }
    const { optionId, phase } = target;
    onChange({
      ...content,
      options: content.options.map((o) => {
        if (o.id !== optionId) return o;
        if (phase === 'select' && o.select_frame) {
          return { ...o, select_frame: { ...o.select_frame, shapes: [...(o.select_frame.shapes ?? []), cloned] } };
        }
        if (phase === 'confirm' && o.confirmation_frame) {
          return { ...o, confirmation_frame: { ...o.confirmation_frame, shapes: [...(o.confirmation_frame.shapes ?? []), cloned] } };
        }
        return o;
      }),
    });
  };

  // ───── Opciones: add / remove ─────

  const addOption = () => {
    if (content.options.length >= 3) return;
    const id = (content.options.length + 1) as 1 | 2 | 3;
    const newOpt: PuzzleOption = {
      id,
      text: '',
      explanation: '',
      is_correct: false,
    };
    // Renumeración no es necesaria al append (ids ya son 1..N+1), pero la
    // aplicamos por consistencia y robustez ante estados antiguos en BD.
    onChange({ ...content, options: renumberOptions([...content.options, newOpt]) });
    setMainTab(id);
  };

  const removeOption = (optionId: 1 | 2 | 3) => {
    if (content.options.length <= 2) return;
    // Tras quitar, renumeramos para que las opciones queden con ids 1..N
    // consecutivos y la letra visual (A/B/C) coincida con la posición.
    const filtered = content.options.filter((o) => o.id !== optionId);
    const renumbered = renumberOptions(filtered);
    onChange({ ...content, options: renumbered });
    // Ajustar mainTab tras renumeración: si la activa era la borrada → initial.
    // Si la activa estaba después del hueco, su id baja en 1.
    if (mainTab === optionId) {
      setMainTab('initial');
    } else if (typeof mainTab === 'number' && mainTab > optionId) {
      setMainTab((mainTab - 1) as 1 | 2 | 3);
    }
  };

  // ───── Intro frame: add / remove ─────
  const addIntroFrame = () => {
    if (content.intro_frame) return;
    // Clonamos initial como punto de partida del intro.
    const cloned: PuzzleFrame = {
      ...cloneFrame(content.initial_frame),
      duration_ms: content.initial_frame.duration_ms ?? 1500,
    };
    onChange({ ...content, intro_frame: cloned });
    setInitialSubTab('intro');
    setSelected(null);
  };

  const removeIntroFrame = () => {
    if (!content.intro_frame) return;
    const { intro_frame: _omit, ...rest } = content;
    void _omit;
    onChange(rest as PuzzleContent);
    setInitialSubTab('static');
  };

  // ───── Frames de fase (select/confirm) ─────

  const addPhaseFrame = (phase: Phase) => {
    if (mainTab === 'initial') return;
    const opt = content.options.find((o) => o.id === mainTab);
    if (!opt) return;
    const source: PuzzleFrame =
      phase === 'select'
        ? opt.select_frame ?? opt.confirmation_frame ?? content.initial_frame
        : opt.confirmation_frame ?? opt.select_frame ?? content.initial_frame;
    const cloned: PuzzleFrame = { ...cloneFrame(source), duration_ms: source.duration_ms ?? 1500 };
    onChange({
      ...content,
      options: content.options.map((o) =>
        o.id !== mainTab ? o : phase === 'select' ? { ...o, select_frame: cloned } : { ...o, confirmation_frame: cloned },
      ),
    });
    setPhaseTab(phase);
    setSelected(null);
  };

  const removePhaseFrame = (phase: Phase) => {
    if (mainTab === 'initial') return;
    onChange({
      ...content,
      options: content.options.map((o) => {
        if (o.id !== mainTab) return o;
        if (phase === 'select') {
          const { select_frame: _omit, ...rest } = o;
          void _omit;
          return rest as PuzzleOption;
        }
        const { confirmation_frame: _omit, ...rest } = o;
        void _omit;
        return rest as PuzzleOption;
      }),
    });
  };

  // ───── Preview contextual ─────
  // Anima desde el frame anterior lógico hasta el frame activo:
  //   - select-X  → from initial         to select_X
  //   - confirm-X → from select_X        to confirmation_X  (o initial si no hay select)
  //   - initial   → sin preview (no hay desde dónde animar)

  const runPreview = () => {
    let from: PuzzleFrame | undefined;
    let to: PuzzleFrame | undefined;
    if (mainTab === 'initial') {
      // Preview en initial: solo aplica si hay intro_frame (intro → static).
      if (!content.intro_frame) return;
      from = content.intro_frame;
      to = content.initial_frame;
    } else {
      const opt = content.options.find((o) => o.id === mainTab);
      if (!opt) return;
      if (phaseTab === 'select') {
        from = content.initial_frame;
        to = opt.select_frame;
      } else {
        from = opt.select_frame ?? content.initial_frame;
        to = opt.confirmation_frame;
      }
    }
    if (!from || !to) return;
    const duration = Math.max(200, to.duration_ms ?? 1500);
    setSelected(null);
    const start = performance.now();
    if (previewRafRef.current != null) cancelAnimationFrame(previewRafRef.current);
    const fromCapt = from;
    const toCapt = to;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setPreviewFrame(interpolateFrames(fromCapt, toCapt, eased));
      setPreviewProgress(eased);
      if (t < 1) previewRafRef.current = requestAnimationFrame(tick);
      else {
        previewRafRef.current = window.setTimeout(() => {
          setPreviewFrame(null);
          setPreviewProgress(1);
          previewRafRef.current = null;
        }, 500) as unknown as number;
      }
    };
    setPreviewFrame(fromCapt);
    setPreviewProgress(0);
    previewRafRef.current = requestAnimationFrame(tick);
  };

  // ───── Validación en vivo ─────
  // Pasa el árbol entero por el validador. Cada cambio dispara recálculo (es
  // función pura O(n) sobre el content). Los errores se agrupan por scope para
  // pintar puntos rojos en las tabs correspondientes.
  // Validación en vivo. La lista solo se "expone" cuando el padre activa
  // showErrors (tras el primer intento de publicar). Mientras showErrors=false
  // todo queda silenciado: ni banner ni puntos rojos en tabs.
  const allErrors = useMemo(() => validatePuzzleContentAll(content), [content]);
  const errors = useMemo(() => (showErrors ? allErrors : []), [showErrors, allErrors]);

  // Sets de tabs con error, derivados del scope de cada error (solo live).
  const errorMainTabs = useMemo(() => {
    const s = new Set<MainTabKey>();
    for (const e of errors) {
      if (e.scope.kind === 'meta' || e.scope.kind === 'initial' || e.scope.kind === 'intro') s.add('initial');
      else if (e.scope.kind === 'option') s.add(e.scope.optionId);
    }
    return s;
  }, [errors]);

  const errorInitialSubTabs = useMemo(() => {
    const s = new Set<InitialSubTab>();
    for (const e of errors) {
      if (e.scope.kind === 'intro') s.add('intro');
      else if (e.scope.kind === 'initial' || e.scope.kind === 'meta') s.add('static');
    }
    return s;
  }, [errors]);

  // Por opción: qué fases (select/confirm) tienen errores.
  const errorPhasesByOption = useMemo(() => {
    const m = new Map<1 | 2 | 3, Set<Phase>>();
    for (const e of errors) {
      if (e.scope.kind !== 'option' || !e.scope.phase) continue;
      const cur = m.get(e.scope.optionId) ?? new Set<Phase>();
      cur.add(e.scope.phase);
      m.set(e.scope.optionId, cur);
    }
    return m;
  }, [errors]);

  // Navega a la tab que corresponda al scope del error clicado.
  const navigateToError = (scope: PuzzleErrorScope) => {
    if (scope.kind === 'meta' || scope.kind === 'initial') {
      setMainTab('initial');
      setInitialSubTab('static');
    } else if (scope.kind === 'intro') {
      setMainTab('initial');
      setInitialSubTab('intro');
    } else if (scope.kind === 'option') {
      setMainTab(scope.optionId);
      if (scope.phase) setPhaseTab(scope.phase);
    }
    setSelected(null);
  };

  const [errorsExpanded, setErrorsExpanded] = useState(true);

  // ───── Render ─────

  const previewing = previewFrame !== null;
  const activeFrameContent = getActiveFrame();
  const frameToShow = previewing
    ? previewFrame!
    : activeFrameContent ?? content.initial_frame;

  const activeOption = mainTab !== 'initial'
    ? content.options.find((o) => o.id === mainTab) ?? null
    : null;

  // Breadcrumb sobre el canvas.
  const breadcrumbLabel = mainTab === 'initial'
    ? (initialSubTab === 'intro' ? 'Inicial · Intro' : 'Inicial · Estático')
    : `Opción ${String.fromCharCode(64 + (mainTab as number))} · ${phaseTab === 'select' ? 'Selección' : 'Confirmación'}`;
  const breadcrumbColor = mainTab === 'initial'
    ? (initialSubTab === 'intro' ? 'bg-purple-500' : 'bg-gray-800')
    : phaseTab === 'select'
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <>
      {/* Banner de validación en vivo: lista de errores. Click navega a la tab
          que los contiene. Se puede colapsar para no estorbar mientras se edita. */}
      {errors.length > 0 && (
        <div className="mb-2 rounded-xl border border-amber-300 bg-amber-50">
          <button
            type="button"
            onClick={() => setErrorsExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <div className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-bold">
                {errors.length} error{errors.length === 1 ? '' : 'es'} de validación
              </span>
            </div>
            {errorsExpanded ? <ChevronUp className="w-4 h-4 text-amber-900" /> : <ChevronDown className="w-4 h-4 text-amber-900" />}
          </button>
          {errorsExpanded && (
            <>
              <ul className="max-h-40 overflow-y-auto px-3 space-y-1">
                {errors.map((e: PuzzleValidationError, i: number) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => navigateToError(e.scope)}
                      className="w-full text-left text-[11px] text-amber-900 hover:bg-amber-100 rounded px-2 py-1 transition-colors"
                    >
                      {e.message}
                    </button>
                  </li>
                ))}
              </ul>
              {/* Hint: ofrece la alternativa de guardar como borrador para
                  que el usuario sepa que puede pausar el trabajo sin perderlo. */}
              <p className="px-3 py-2 text-[10px] text-amber-800 italic">
                ¿Aún no has terminado? Pulsa <span className="font-bold">Guardar borrador</span> para continuar más tarde sin perder lo hecho.
              </p>
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 h-[70vh] min-h-[600px]">
        {/* Canvas + controles */}
        <div className="flex flex-col h-full min-h-0">
          {/* Tabs row 1: main + undo/redo */}
          <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
            <MainTabs
              content={content}
              active={mainTab}
              onSelect={setMainTab}
              onAddOption={addOption}
              onRemoveOption={removeOption}
              disabled={previewing}
              errorTabs={errorMainTabs}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo || previewing}
                title="Deshacer (Ctrl+Z)"
                className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo || previewing}
                title="Rehacer (Ctrl+Y)"
                className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs row 2: phase + reset (solo cuando hay opción activa) */}
          {activeOption && (
            <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
              <PhaseTabs
                option={activeOption}
                active={phaseTab}
                onSelect={setPhaseTab}
                onAddPhase={addPhaseFrame}
                onRemovePhase={removePhaseFrame}
                onPreview={runPreview}
                onPlayGlobal={() => setShowPlayer(true)}
                disabled={previewing}
                errorPhases={errorPhasesByOption.get(activeOption.id)}
              />
              {activeFrameContent && (
                <button
                  type="button"
                  onClick={resetFrameFromPrev}
                  disabled={previewing}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Restaura este frame al estado del frame anterior (Inicial → Selección, Selección → Confirmación)"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset frame
                </button>
              )}
            </div>
          )}

          {/* Tabs row 2: sub-fase del initial (Intro | Estático) */}
          {mainTab === 'initial' && (
            <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
              <InitialPhaseTabs
                content={content}
                active={initialSubTab}
                onSelect={setInitialSubTab}
                onAddIntro={addIntroFrame}
                onRemoveIntro={removeIntroFrame}
                onPreview={runPreview}
                onPlayGlobal={() => setShowPlayer(true)}
                disabled={previewing}
                errorSubTabs={errorInitialSubTabs}
              />
              {initialSubTab === 'static' && content.intro_frame && (
                <button
                  type="button"
                  onClick={() => writeActiveFrame(() => cloneFrame(content.intro_frame!))}
                  disabled={previewing}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Restaura el estático al estado del intro"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset frame
                </button>
              )}
            </div>
          )}

          {/* Canvas */}
          <div className="relative flex-1 min-h-0">
            {/* Breadcrumb */}
            <div className={`absolute top-2 left-2 z-10 ${breadcrumbColor} text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shadow`}>
              {breadcrumbLabel}
            </div>
            {previewing && (
              <div className="absolute top-2 right-2 z-10 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shadow">
                ▶ Preview…
              </div>
            )}
            {activeFrameContent === null && mainTab !== 'initial' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl">
                <div className="text-center space-y-2 px-6">
                  <p className="text-sm font-bold text-gray-700">
                    Esta opción no tiene aún frame {phaseTab === 'select' ? 'de selección' : 'de confirmación'}
                  </p>
                  <button
                    type="button"
                    onClick={() => addPhaseFrame(phaseTab)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1A1A1A] text-white hover:bg-[#333] transition-all"
                  >
                    + Crear frame {phaseTab === 'select' ? 'de selección' : 'de confirmación'}
                  </button>
                </div>
              </div>
            )}
            <PuzzleStage
              frame={frameToShow}
              selected={selected}
              onSelect={setSelected}
              onPlayerChange={updatePlayer}
              onBallChange={updateBall}
              snapToGrid
              draggable={!previewing && activeFrameContent !== null}
              options={content.options}
              onOptionChange={(next) =>
                onChange({
                  ...content,
                  options: content.options.map((o) => (o.id === next.id ? next : o)),
                })
              }
              onShapeChange={updateShape}
              activeOptionId={mainTab !== 'initial' ? mainTab : null}
              drawingType={drawingType}
              onDrawingComplete={(s) => {
                addShape(s);
                setDrawingType(null);
              }}
              badgesDraggable={mainTab === 'initial'}
              trajectoryProgress={previewing ? previewProgress : 1}
              prevFrame={getPrevFrame()}
            />
          </div>
        </div>

        {/* Paneles laterales */}
        <div className="space-y-4 overflow-y-auto pr-1">
          {mainTab === 'initial' && (
            <MetaPanel content={content} onChange={onChange} />
          )}
          {activeOption && (
            <OptionPanel content={content} option={activeOption} onChange={onChange} />
          )}
          {/* Panel de frame: aplica a opciones (select/confirm) y también a
              initial cuando hay intro (porque entonces initial es destino
              animado: tiene sentido shot_type, spin, auto_trajectory). En el
              sub-tab intro solo se edita la duración. */}
          {activeFrameContent &&
            (activeFrame !== 'initial' || !!content.intro_frame) && (
              <>
                <div className="border-t border-gray-100" />
                <RevealFramePanel
                  content={content}
                  activeFrame={activeFrame}
                  initialSubTab={initialSubTab}
                  onChange={onChange}
                />
              </>
            )}
          {activeFrameContent && (
            <>
              <div className="border-t border-gray-100" />
              <ShapesToolbar
                shapes={frameToShow.shapes ?? []}
                selectedShapeId={selected?.kind === 'shape' ? selected.id : null}
                onSelectShape={(id) => setSelected(id ? { kind: 'shape', id } : null)}
                onRemove={removeShape}
                drawingType={drawingType}
                onSetDrawingType={setDrawingType}
              />
              {selected?.kind === 'shape' &&
                (() => {
                  const shape = (frameToShow.shapes ?? []).find((s) => s.id === selected.id);
                  if (!shape) return null;
                  const prev = getNeighborFrame('prev');
                  const next = getNeighborFrame('next');
                  const prevAvailable = prev && frameExists(prev) ? prev : null;
                  const nextAvailable = next && frameExists(next) ? next : null;
                  const frameLabel = (f: FrameRef): string =>
                    f === 'initial'
                      ? 'Inicial'
                      : `${String.fromCharCode(64 + f.optionId)} · ${f.phase === 'select' ? 'Sel' : 'Conf'}`;
                  // Reset solo aplica si la shape EXISTE en el frame anterior con el mismo id.
                  const prevHasShape = prevAvailable && (() => {
                    const f: PuzzleFrame | undefined = prevAvailable === 'initial'
                      ? content.initial_frame
                      : prevAvailable.phase === 'select'
                        ? content.options.find((o) => o.id === prevAvailable.optionId)?.select_frame
                        : content.options.find((o) => o.id === prevAvailable.optionId)?.confirmation_frame;
                    return !!f?.shapes?.some((s) => s.id === shape.id);
                  })();
                  return (
                    <>
                      <div className="border-t border-gray-100" />
                      <ShapeInspector
                        shape={shape}
                        onChange={updateShape}
                        onCopyToPrev={prevAvailable ? () => copyShapeToFrame(shape, prevAvailable) : undefined}
                        copyPrevLabel={prevAvailable ? `→ ${frameLabel(prevAvailable)}` : undefined}
                        onCopyToNext={nextAvailable ? () => copyShapeToFrame(shape, nextAvailable) : undefined}
                        copyNextLabel={nextAvailable ? `→ ${frameLabel(nextAvailable)}` : undefined}
                        onResetFromPrev={prevHasShape ? () => resetShapeFromPrev(shape) : undefined}
                      />
                    </>
                  );
                })()}
              {selected?.kind === 'player' &&
                (() => {
                  const player = frameToShow.players.find((p) => p.id === selected.id);
                  if (!player) return null;
                  const prevObj = getPrevFrameObj();
                  const prevHasPlayer = !!prevObj?.players.some((p) => p.id === player.id);
                  return (
                    <>
                      <div className="border-t border-gray-100" />
                      <PlayerInspector
                        player={player}
                        onChange={updatePlayer}
                        onResetFromPrev={prevHasPlayer ? () => resetPlayerFromPrev(player) : undefined}
                        onAddSpeech={() => addSpeechBubbleForPlayer(player)}
                      />
                    </>
                  );
                })()}
              {selected?.kind === 'ball' && mainTab !== 'initial' && (
                <>
                  <div className="border-t border-gray-100" />
                  <BallInspector
                    ball={frameToShow.ball}
                    onChange={updateBall}
                    onResetFromPrev={getPrevFrameObj() ? resetBallFromPrev : undefined}
                  />
                </>
              )}
              {selected?.kind === 'ball' && mainTab === 'initial' && (
                <>
                  <div className="border-t border-gray-100" />
                  <div className="text-[10px] text-gray-400 italic">
                    El frame inicial es estático: el tipo de tiro y el spin de la pelota solo aplican en frames de selección / confirmación.
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showPlayer && (
        <PuzzlePlayer content={content} onClose={() => setShowPlayer(false)} />
      )}
    </>
  );
}
