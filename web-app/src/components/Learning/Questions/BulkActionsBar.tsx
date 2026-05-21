import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export interface BulkAction {
  key: string;
  label: string;
  icon: ReactNode;
  // Variante visual del botón. Default 'neutral'.
  variant?: 'neutral' | 'danger' | 'success' | 'warning';
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  selectedCount: number;
  actions: BulkAction[];
  onCancel: () => void;
}

const VARIANT_CLASSES: Record<NonNullable<BulkAction['variant']>, string> = {
  neutral: 'bg-gray-50 text-[#1A1A1A] hover:bg-gray-100',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  success: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  warning: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
};

/**
 * Barra sticky inferior que aparece cuando hay preguntas seleccionadas en modo
 * "Seleccionar varias". El padre decide qué acciones expone y qué hace cada
 * una; este componente solo se encarga de la presentación.
 */
export function BulkActionsBar({ selectedCount, actions, onCancel }: Props) {
  if (selectedCount === 0) return null;
  return (
    <div className="sticky top-2 z-30 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-gray-200 shadow-lg px-4 py-2.5">
        <span className="text-xs font-bold text-[#1A1A1A]">
          {selectedCount} seleccionada{selectedCount === 1 ? '' : 's'}
        </span>
        <span className="text-gray-300">·</span>
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all disabled:opacity-40 ${VARIANT_CLASSES[a.variant ?? 'neutral']}`}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onCancel}
          className="ml-1 p-1.5 rounded-lg text-gray-400 hover:text-[#1A1A1A] hover:bg-gray-50"
          title="Cancelar selección"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
