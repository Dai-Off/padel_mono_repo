import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal } from 'lucide-react';
import { CourtCard } from './CourtCard';
import type { Court } from '../../types/court';

type Props = {
    court: Court;
    onEdit: (court: Court) => void;
    onDelete?: (id: string) => void;
    onViewDetails?: (court: Court) => void;
};

export function SortableCourtCard({ court, onEdit, onDelete, onViewDetails }: Props) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: court.id,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative ${isDragging ? 'z-10 opacity-90' : ''}`}
        >
            <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white shadow-sm">
                <button
                    type="button"
                    className="w-full flex justify-center py-2.5 bg-gray-50 border-b border-gray-100 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                    aria-label="Arrastrar para ordenar"
                    {...attributes}
                    {...listeners}
                >
                    <GripHorizontal className="w-5 h-5" />
                </button>
                <CourtCard
                    court={court}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onViewDetails={onViewDetails}
                    className="rounded-none border-0 shadow-none"
                />
            </div>
        </div>
    );
}
