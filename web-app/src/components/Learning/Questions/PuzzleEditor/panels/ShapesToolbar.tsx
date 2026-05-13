// Toolbar para añadir y borrar shapes del frame activo. Versión mínima:
// crear una shape la planta en el centro del campo (5,10); luego se arrastra
// o se edita desde el ShapeInspector.

import {
  ArrowRight,
  Circle as CircleIcon,
  Minus,
  Square,
  Triangle,
  Type,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { createShape, type ShapeType } from '../lib/shapeFactory';
import type { PuzzleShape } from '../../../../../types/learningContent';

interface Props {
  shapes: PuzzleShape[];
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  onAdd: (shape: PuzzleShape) => void;
  onRemove: (id: string) => void;
  // Si el frame activo es 'confirm', dejamos toggle del flag vOAC en cada shape
  // a través del Inspector — la toolbar solo se ocupa de crear/borrar.
}

const SHAPE_BUTTONS: { type: ShapeType; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { type: 'circle', Icon: CircleIcon, label: 'Círculo' },
  { type: 'arrow', Icon: ArrowRight, label: 'Flecha' },
  { type: 'rect', Icon: Square, label: 'Rect' },
  { type: 'line', Icon: Minus, label: 'Línea' },
  { type: 'text', Icon: Type, label: 'Texto' },
  { type: 'triangle', Icon: Triangle, label: 'Triángulo' },
];

export function ShapesToolbar({
  shapes,
  selectedShapeId,
  onSelectShape,
  onAdd,
  onRemove,
}: Props) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">Shapes del frame</h4>
      <div className="grid grid-cols-3 gap-1.5">
        {SHAPE_BUTTONS.map(({ type, Icon, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(createShape(type))}
            className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl bg-white text-[10px] font-bold text-gray-600 border border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-500 transition-all"
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {shapes.length > 0 && (
        <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
          {shapes.map((s) => {
            const active = selectedShapeId === s.id;
            const vOAC = !!s.visible_only_after_confirmation;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-[10px] cursor-pointer ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => onSelectShape(active ? null : s.id)}
              >
                {vOAC ? (
                  <EyeOff className="w-3 h-3 text-amber-500" />
                ) : (
                  <Eye className="w-3 h-3 text-gray-300" />
                )}
                <span className="font-bold uppercase">{s.type}</span>
                <span className="text-gray-400 truncate">{s.id}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(s.id);
                  }}
                  className="ml-auto text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
