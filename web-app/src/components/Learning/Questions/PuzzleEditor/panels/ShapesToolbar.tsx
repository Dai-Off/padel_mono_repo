// Toolbar para añadir y borrar shapes del frame activo.
// Al pulsar un tipo se activa el "modo dibujo": el siguiente click-drag en el
// canvas crea la shape con las dimensiones del drag (como en Paint). El usuario
// puede cancelar pulsando el mismo botón o Esc.

import {
  ArrowRight,
  Circle as CircleIcon,
  MessageCircle,
  Square,
  Triangle,
  Type,
  Trash2,
} from 'lucide-react';
import type { ShapeType } from '../lib/shapeFactory';
import type { PuzzleShape } from '../../../../../types/learningContent';

interface Props {
  shapes: PuzzleShape[];
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  onRemove: (id: string) => void;
  drawingType: ShapeType | null;
  onSetDrawingType: (t: ShapeType | null) => void;
}

const SHAPE_BUTTONS: { type: ShapeType; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { type: 'circle', Icon: CircleIcon, label: 'Círculo' },
  { type: 'arrow', Icon: ArrowRight, label: 'Flecha' },
  { type: 'rect', Icon: Square, label: 'Rect' },
  { type: 'triangle', Icon: Triangle, label: 'Triángulo' },
  { type: 'text', Icon: Type, label: 'Texto' },
  { type: 'speechbubble', Icon: MessageCircle, label: 'Bocadillo' },
];

export function ShapesToolbar({
  shapes,
  selectedShapeId,
  onSelectShape,
  onRemove,
  drawingType,
  onSetDrawingType,
}: Props) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase">
        Shapes del frame
        {drawingType && (
          <span className="ml-2 normal-case text-amber-600 font-normal">
            (Dibujando — arrastra en el campo)
          </span>
        )}
      </h4>
      <div className="grid grid-cols-3 gap-1.5">
        {SHAPE_BUTTONS.map(({ type, Icon, label }) => {
          const active = drawingType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSetDrawingType(active ? null : type)}
              className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                active
                  ? 'bg-amber-50 text-amber-600 border-amber-400'
                  : 'bg-white text-gray-600 border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {shapes.length > 0 && (
        <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
          {shapes.map((s) => {
            const active = selectedShapeId === s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-[10px] cursor-pointer ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => onSelectShape(active ? null : s.id)}
              >
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
