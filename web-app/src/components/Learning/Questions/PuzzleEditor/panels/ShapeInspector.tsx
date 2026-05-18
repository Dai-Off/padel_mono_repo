// Inspector de la shape seleccionada. Edita preset visual + datos geométricos.
// El preset controla el lenguaje visual (color, dashed, fill, etc.) — el usuario
// elige uno de los 8 presets sin tocar colores individuales.

import { ArrowLeftCircle, ArrowRightCircle, RotateCcw } from 'lucide-react';
import type { PuzzleShape, ShapePreset } from '../../../../../types/learningContent';
import { PRESETS } from '../lib/shapePresets';

interface Props {
  shape: PuzzleShape;
  onChange: (next: PuzzleShape) => void;
  // Acciones de copia entre frames. Si están definidas y devuelven true al
  // verificar disponibilidad, el botón se habilita.
  onCopyToPrev?: () => void;
  onCopyToNext?: () => void;
  copyPrevLabel?: string;
  copyNextLabel?: string;
  // Reset al estado del frame anterior (mismo id de shape).
  onResetFromPrev?: () => void;
}

const PRESET_LABELS: Record<ShapePreset, { label: string; desc: string }> = {
  trajectory: { label: 'Trayectoria pelota', desc: 'Flecha curva naranja con dashes marchando' },
  movement: { label: 'Movimiento jugador', desc: 'Línea fina azul' },
  highlight: { label: 'Highlight posición', desc: 'Halo radial pulsante' },
  good_zone: { label: 'Zona buena', desc: 'Verde semitransparente' },
  bad_zone: { label: 'Zona mala', desc: 'Rojo con diagonales' },
  neutral_zone: { label: 'Zona neutra', desc: 'Amarillo suave' },
  measure: { label: 'Medida', desc: 'Pill blanca + texto' },
  tactical: { label: 'Táctica', desc: 'Pill naranja + mayúsculas' },
};

// Presets recomendados por tipo (para mostrar primero los relevantes).
const PRESETS_BY_TYPE: Record<PuzzleShape['type'], ShapePreset[]> = {
  arrow: ['trajectory', 'movement'],
  circle: ['highlight'],
  rect: ['good_zone', 'bad_zone', 'neutral_zone'],
  triangle: ['good_zone', 'bad_zone', 'neutral_zone'],
  line: ['movement', 'trajectory'],
  text: ['measure', 'tactical'],
  speechbubble: ['tactical'],
};

export function ShapeInspector({ shape, onChange, onCopyToPrev, onCopyToNext, copyPrevLabel, copyNextLabel, onResetFromPrev }: Props) {
  const currentPreset: ShapePreset =
    shape.style ?? (PRESETS_BY_TYPE[shape.type][0] ?? 'highlight');
  const availablePresets = PRESETS_BY_TYPE[shape.type] ?? (Object.keys(PRESETS) as ShapePreset[]);

  const patchPreset = (preset: ShapePreset) => {
    onChange({ ...shape, style: preset } as PuzzleShape);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">
        Editar {shape.type}
      </h4>

      {/* Copia entre frames */}
      {(onCopyToPrev || onCopyToNext) && (
        <div className="flex items-center gap-1.5">
          {onCopyToPrev && (
            <button
              type="button"
              onClick={onCopyToPrev}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
              title={copyPrevLabel}
            >
              <ArrowLeftCircle className="w-3.5 h-3.5" />
              {copyPrevLabel ?? 'A anterior'}
            </button>
          )}
          {onCopyToNext && (
            <button
              type="button"
              onClick={onCopyToNext}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
              title={copyNextLabel}
            >
              {copyNextLabel ?? 'A siguiente'}
              <ArrowRightCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Reset al estado del frame anterior */}
      {onResetFromPrev && (
        <button
          type="button"
          onClick={onResetFromPrev}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all"
          title="Restaurar esta shape al estado del frame anterior"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset al frame anterior
        </button>
      )}

      {/* Selector de preset */}
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">
          Estilo visual
        </label>
        <div className="space-y-1">
          {availablePresets.map((p) => {
            const meta = PRESET_LABELS[p];
            const active = currentPreset === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => patchPreset(p)}
                className={`w-full flex items-start gap-2 px-3 py-2 rounded-xl text-left text-[10px] transition-all ${
                  active
                    ? 'bg-[#1A1A1A] text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                }`}
              >
                <PresetSwatch preset={p} />
                <div className="flex-1">
                  <div className="font-bold">{meta.label}</div>
                  <div className={active ? 'text-white/60' : 'text-gray-400'}>{meta.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>


      {/* Campos geométricos por tipo */}
      {shape.type === 'circle' && (
        <Field label="Radio (m)">
          <input
            type="number"
            min={0.05}
            step={0.05}
            value={shape.radius}
            onChange={(e) => onChange({ ...shape, radius: Number(e.target.value) })}
            className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
          />
        </Field>
      )}

      {shape.type === 'rect' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ancho (m)">
            <input
              type="number"
              min={0.05}
              step={0.05}
              value={shape.width}
              onChange={(e) => onChange({ ...shape, width: Number(e.target.value) })}
              className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Alto (m)">
            <input
              type="number"
              min={0.05}
              step={0.05}
              value={shape.height}
              onChange={(e) => onChange({ ...shape, height: Number(e.target.value) })}
              className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
            />
          </Field>
        </div>
      )}

      {(shape.type === 'text' || shape.type === 'speechbubble') && (
        <>
          <Field label="Texto">
            <input
              type="text"
              value={shape.text}
              onChange={(e) => onChange({ ...shape, text: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Tamaño (px)">
            <input
              type="number"
              min={4}
              max={200}
              value={shape.fontSize ?? 14}
              onChange={(e) => onChange({ ...shape, fontSize: Number(e.target.value) })}
              className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
            />
          </Field>
        </>
      )}
    </div>
  );
}

// Mini muestra de color del preset (8×8px) para indicar visualmente cuál es cuál.
function PresetSwatch({ preset }: { preset: ShapePreset }) {
  const v = PRESETS[preset];
  return (
    <div
      className="w-4 h-4 rounded mt-0.5 flex-shrink-0"
      style={{
        backgroundColor: v.fill ?? 'transparent',
        opacity: v.fillOpacity ?? 1,
        border: `2px solid ${v.stroke}`,
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{label}</label>
      {children}
    </div>
  );
}
