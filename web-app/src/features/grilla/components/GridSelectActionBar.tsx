import React from 'react';
import { CheckSquare, X } from 'lucide-react';
import clsx from 'clsx';

type Props = {
    count: number;
    onVoid: () => void;
    onCancel: () => void;
    voiding?: boolean;
};

export const GridSelectActionBar: React.FC<Props> = ({ count, onVoid, onCancel, voiding }) => (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#1A1A1A] text-white shadow-2xl border border-white/10">
        <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-sm font-semibold whitespace-nowrap">
            {count} seleccionado{count === 1 ? '' : 's'}
        </span>
        <button
            type="button"
            onClick={onVoid}
            disabled={voiding || count === 0}
            className={clsx(
                'px-3 py-1.5 rounded-xl text-sm font-bold transition-colors',
                voiding || count === 0
                    ? 'bg-red-400/50 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-500',
            )}
        >
            {voiding ? 'Anulando...' : 'Anular'}
        </button>
        <button
            type="button"
            onClick={onCancel}
            disabled={voiding}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
            title="Salir de selección"
        >
            <X className="w-4 h-4" />
        </button>
    </div>
);
