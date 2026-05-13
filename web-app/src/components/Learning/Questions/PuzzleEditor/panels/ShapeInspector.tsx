// Inspector de la shape seleccionada. Edita campos por tipo: color, dashed,
// fillColor/fillOpacity, visible_only_after_confirmation, etc.

import type { PuzzleShape } from '../../../../../types/learningContent';

interface Props {
  shape: PuzzleShape;
  onChange: (next: PuzzleShape) => void;
}

export function ShapeInspector({ shape, onChange }: Props) {
  const patch = <K extends keyof PuzzleShape>(key: K, value: PuzzleShape[K]) => {
    onChange({ ...shape, [key]: value } as PuzzleShape);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">
        Editar {shape.type} · {shape.id}
      </h4>

      {/* Color (común a todas) */}
      <Field label="Color del trazo">
        <input
          type="text"
          value={shape.color ?? ''}
          onChange={(e) => patch('color', e.target.value || undefined)}
          placeholder="yellow, #ff9182, etc."
          className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
        />
      </Field>

      {/* visible_only_after_confirmation */}
      <label className="flex items-center gap-2 text-[10px] text-gray-600">
        <input
          type="checkbox"
          checked={!!shape.visible_only_after_confirmation}
          onChange={(e) =>
            patch('visible_only_after_confirmation', e.target.checked || undefined)
          }
        />
        Solo visible tras confirmar (vOAC)
      </label>

      {/* Campos específicos por tipo */}
      {(shape.type === 'circle' || shape.type === 'arrow') && (
        <label className="flex items-center gap-2 text-[10px] text-gray-600">
          <input
            type="checkbox"
            checked={!!(shape as { dashed?: boolean }).dashed}
            onChange={(e) =>
              onChange({ ...(shape as PuzzleShape), dashed: e.target.checked || undefined } as PuzzleShape)
            }
          />
          Discontinua
        </label>
      )}

      {(shape.type === 'rect' || shape.type === 'triangle') && (
        <>
          <Field label="Color de relleno">
            <input
              type="text"
              value={(shape as { fillColor?: string }).fillColor ?? ''}
              onChange={(e) =>
                onChange({
                  ...(shape as PuzzleShape),
                  fillColor: e.target.value || undefined,
                } as PuzzleShape)
              }
              placeholder="#ff9182"
              className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Opacidad de relleno (0..1)">
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={(shape as { fillOpacity?: number }).fillOpacity ?? 1}
              onChange={(e) =>
                onChange({
                  ...(shape as PuzzleShape),
                  fillOpacity: Number(e.target.value),
                } as PuzzleShape)
              }
              className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
            />
          </Field>
        </>
      )}

      {shape.type === 'text' && (
        <>
          <Field label="Texto">
            <input
              type="text"
              value={shape.text}
              onChange={(e) => onChange({ ...shape, text: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Tamaño (px del kit)">
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
    </div>
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
